#!/usr/bin/env python3
"""
Build the global rail PMTiles asset from local Overture parquet snapshots.

Output:
  public/global_rail.pmtiles

Layers:
  segments  Global rail line features from transportation/type=segment
  stations  Global rail station points from places/type=place, enabled when
            --places-source is provided

Each GeoJSON feature declares its target layer through the tippecanoe property,
so the output is produced in one tippecanoe process.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import duckdb
from overture_global import iter_segment_features, iter_station_features

DEFAULT_SOURCE = Path(os.environ.get("SOURCE_DIR", "data-snapshot/transportation"))


def tippecanoe_command(args: argparse.Namespace) -> list[str]:
    return [
        args.tippecanoe,
        "--output",
        str(args.output),
        "--minimum-zoom",
        str(args.minimum_zoom),
        "--maximum-zoom",
        str(args.maximum_zoom),
        "--simplification",
        str(args.simplification),
        "--no-tile-size-limit",
        "--no-feature-limit",
        "--force",
    ]


def write_feature(stdin: Any, feature: dict[str, Any]) -> None:
    stdin.write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")))
    stdin.write("\n")


def require_dir(path: Path, label: str) -> None:
    if not path.is_dir():
        raise SystemExit(f"Missing {label} dir: {path}")


def stream_pmtiles(args: argparse.Namespace) -> None:
    require_dir(args.source / "type=segment", "segment")
    if args.places_source is not None:
        require_dir(args.places_source / "type=place", "places")
    if shutil.which(args.tippecanoe) is None:
        raise SystemExit(f"tippecanoe not found: {args.tippecanoe}")

    args.output.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(f"SET threads = {args.threads}")

    proc = subprocess.Popen(
        tippecanoe_command(args),
        stdin=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert proc.stdin is not None

    seg_written = 0
    sta_written = 0
    try:
        for feature in iter_segment_features(
            con, args.source, args.limit, args.batch_size
        ):
            write_feature(proc.stdin, feature)
            seg_written += 1

        if args.places_source is not None:
            for feature in iter_station_features(
                con, args.places_source, args.limit, args.batch_size
            ):
                write_feature(proc.stdin, feature)
                sta_written += 1
    except BrokenPipeError:
        pass
    finally:
        proc.stdin.close()

    code = proc.wait()
    if code != 0:
        raise SystemExit(code)

    layers = ["segments"]
    if sta_written:
        layers.append("stations")
    print(
        f"Wrote {args.output} layers={layers} "
        f"segments={seg_written:,} stations={sta_written:,}",
        file=sys.stderr,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Transportation parquet directory",
    )
    parser.add_argument(
        "--places-source",
        type=Path,
        default=None,
        help="Places parquet directory. Adds the stations layer when set",
    )
    parser.add_argument(
        "--output", type=Path, default=Path("public/global_rail.pmtiles")
    )
    parser.add_argument("--minimum-zoom", type=int, default=0)
    parser.add_argument("--maximum-zoom", type=int, default=14)
    parser.add_argument("--simplification", type=float, default=2)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=5000)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--tippecanoe", default="tippecanoe")
    return parser.parse_args()


def main() -> None:
    stream_pmtiles(parse_args())


if __name__ == "__main__":
    main()
