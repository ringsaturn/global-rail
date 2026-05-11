import json
from pathlib import Path
from typing import Any, Iterator

import duckdb

PALETTE = [
    "#0068b7",
    "#e5171f",
    "#009944",
    "#f39700",
    "#8f76d6",
    "#00a7d8",
    "#7b3f2a",
    "#d22f8d",
    "#22883e",
    "#6b5b95",
    "#00838f",
    "#c0392b",
]

STATION_CATEGORIES = (
    "train_station",
    "metro_station",
    "light_rail_and_subway_stations",
)

URBAN_RAIL_CLASSES = {"subway", "tram", "light_rail", "monorail", "funicular"}
MAINLINE_RAIL_CLASSES = {"standard_gauge", "narrow_gauge"}


def stable_hash(value: str) -> int:
    h = 2166136261
    for ch in value:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def first_non_empty(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def flag_set(rail_flags: Any) -> set[str]:
    flags: set[str] = set()
    for entry in rail_flags or []:
        values = entry.get("values") if isinstance(entry, dict) else None
        for value in values or []:
            if isinstance(value, str):
                flags.add(value)
    return flags


def parse_geometry(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, str):
        return json.loads(value)
    if isinstance(value, dict):
        return value
    return None


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def rail_query(source: Path, limit: int | None) -> str:
    parquet_glob = str(source / "type=segment" / "*.parquet")
    limit_clause = f" LIMIT {limit}" if limit else ""
    return f"""
        SELECT
          id,
          names.primary AS primary_name,
          names.common['en'] AS en_name,
          names.common['ja'] AS ja_name,
          routes[1].name AS route_name,
          routes[1].network AS route_network,
          routes[1].ref AS route_ref,
          class,
          rail_flags,
          ST_AsGeoJSON(geometry) AS geometry_geojson
        FROM read_parquet({sql_literal(parquet_glob)}, hive_partitioning = true)
        WHERE subtype = 'rail'
          AND geometry IS NOT NULL
        {limit_clause}
    """


def station_query(places_source: Path, limit: int | None) -> str:
    parquet_glob = str(places_source / "type=place" / "*.parquet")
    cats = ", ".join(sql_literal(category) for category in STATION_CATEGORIES)
    limit_clause = f" LIMIT {limit}" if limit else ""
    return f"""
        WITH base AS (
          SELECT
            id,
            names.primary          AS name,
            names.common['en']     AS name_en,
            names.common['ja']     AS name_ja,
            categories.primary     AS category,
            confidence,
            ST_X(geometry)         AS lon,
            ST_Y(geometry)         AS lat,
            ST_AsGeoJSON(geometry) AS geometry_geojson,
            CASE categories.primary
              WHEN 'train_station' THEN 30
              WHEN 'metro_station' THEN 20
              ELSE 10
            END
            + CASE WHEN brand.wikidata IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN names.primary IS NOT NULL THEN 5 ELSE 0 END
            + CAST(coalesce(confidence, 0) * 10 AS INTEGER) AS score
          FROM read_parquet({sql_literal(parquet_glob)}, hive_partitioning = true)
          WHERE categories.primary IN ({cats})
            AND geometry IS NOT NULL
        ),
        ranked AS (
          SELECT
            *,
            row_number() OVER (
              PARTITION BY floor((lon + 180) * 16 / 360), floor((lat + 90) * 16 / 180)
              ORDER BY score DESC, id
            ) AS rn_z4,
            row_number() OVER (
              PARTITION BY floor((lon + 180) * 64 / 360), floor((lat + 90) * 64 / 180)
              ORDER BY score DESC, id
            ) AS rn_z6,
            row_number() OVER (
              PARTITION BY floor((lon + 180) * 256 / 360), floor((lat + 90) * 256 / 180)
              ORDER BY score DESC, id
            ) AS rn_z8,
            row_number() OVER (
              PARTITION BY floor((lon + 180) * 1024 / 360), floor((lat + 90) * 1024 / 180)
              ORDER BY score DESC, id
            ) AS rn_z10
          FROM base
        )
        SELECT
          id,
          name,
          name_en,
          name_ja,
          category,
          confidence,
          CASE
            WHEN rn_z4 = 1 THEN 4
            WHEN rn_z6 = 1 THEN 6
            WHEN rn_z8 = 1 THEN 8
            WHEN rn_z10 = 1 THEN 10
            ELSE 12
          END AS minzoom,
          score AS station_rank,
          geometry_geojson
        FROM ranked
        {limit_clause}
    """


def segment_minzoom(
    rail_class: str,
    flags: set[str],
    has_route_signal: bool,
) -> int:
    if flags & {"is_abandoned", "is_disused", "is_under_construction"}:
        return 12
    if rail_class == "standard_gauge":
        return 0
    if rail_class in URBAN_RAIL_CLASSES:
        return 8 if has_route_signal or "is_passenger" in flags else 10
    if rail_class in MAINLINE_RAIL_CLASSES:
        if "is_passenger" in flags and has_route_signal:
            return 3
        if has_route_signal:
            return 4
        if "is_passenger" in flags:
            return 5
        if "is_freight" in flags:
            return 8
        return 10
    if has_route_signal:
        return 9
    return 11


def make_segment_feature(row: tuple[Any, ...]) -> dict[str, Any] | None:
    (
        fid,
        primary_name,
        en_name,
        ja_name,
        route_name,
        route_network,
        route_ref,
        rail_class,
        rail_flags,
        geometry_geojson,
    ) = row

    geometry = parse_geometry(geometry_geojson)
    if geometry is None:
        return None

    name = first_non_empty(primary_name, route_name, en_name, ja_name, route_ref)
    color_key = first_non_empty(
        route_name, name, route_ref, route_network, rail_class, fid
    )
    flags = flag_set(rail_flags)
    has_route_signal = bool(first_non_empty(route_name, name, route_ref, route_network))
    minzoom = segment_minzoom(rail_class or "", flags, has_route_signal)

    return {
        "type": "Feature",
        "tippecanoe": {"layer": "segments", "minzoom": minzoom},
        "geometry": geometry,
        "properties": {
            "overture_id": fid,
            "class": rail_class or "",
            "minzoom": minzoom,
            "name": name,
            "name_en": en_name or "",
            "name_ja": ja_name or "",
            "route_name": route_name or "",
            "route_network": route_network or "",
            "route_ref": route_ref or "",
            "color": PALETTE[stable_hash(color_key) % len(PALETTE)],
            "is_tunnel": "is_tunnel" in flags,
            "is_bridge": "is_bridge" in flags,
            "is_passenger": "is_passenger" in flags,
            "is_freight": "is_freight" in flags,
            "is_under_construction": "is_under_construction" in flags,
            "is_disused": "is_disused" in flags,
            "is_abandoned": "is_abandoned" in flags,
        },
    }


def make_station_feature(row: tuple[Any, ...]) -> dict[str, Any] | None:
    (
        fid,
        name,
        name_en,
        name_ja,
        category,
        confidence,
        minzoom,
        station_rank,
        geometry_geojson,
    ) = row
    geometry = parse_geometry(geometry_geojson)
    if geometry is None:
        return None
    return {
        "type": "Feature",
        "tippecanoe": {"layer": "stations", "minzoom": minzoom},
        "geometry": geometry,
        "properties": {
            "id": fid,
            "name": name or name_en or name_ja or "",
            "name_en": name_en or "",
            "name_ja": name_ja or "",
            "category": category or "",
            "confidence": confidence or 0,
            "minzoom": minzoom,
            "station_rank": station_rank or 0,
        },
    }


def iter_segment_features(
    con: duckdb.DuckDBPyConnection,
    source: Path,
    limit: int | None,
    batch_size: int,
) -> Iterator[dict[str, Any]]:
    cursor = con.execute(rail_query(source, limit))
    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break
        for row in rows:
            feature = make_segment_feature(row)
            if feature is not None:
                yield feature


def iter_station_features(
    con: duckdb.DuckDBPyConnection,
    places_source: Path,
    limit: int | None,
    batch_size: int,
) -> Iterator[dict[str, Any]]:
    cursor = con.execute(station_query(places_source, limit))
    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break
        for row in rows:
            feature = make_station_feature(row)
            if feature is not None:
                yield feature
