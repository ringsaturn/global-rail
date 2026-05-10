import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { defaultRailFilter } from "../types/rail-filter";
import type { RailFilterState } from "../types/rail-filter";
import type { Language, ResolvedTheme } from "../types/settings";
import { buildRailFilterExpr } from "../utils/rail-filter-expr";
import RailFilterPanel from "./RailFilterPanel";

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile.bind(pmtilesProtocol));

const PROTOMAPS_KEY = import.meta.env.VITE_PROTOMAPS_KEY as string | undefined;
const REMOTE_RAIL_PMTILES_URL =
  "https://dataset.ringsaturn.me/pmtiles/global_rail.pmtiles";
const LOCAL_RAIL_PMTILES_PROXY = "/pmtiles/global_rail.pmtiles";
const RAIL_PMTILES_URL = import.meta.env.DEV
  ? LOCAL_RAIL_PMTILES_PROXY
  : REMOTE_RAIL_PMTILES_URL;
const RAIL_PMTILES = `pmtiles://${RAIL_PMTILES_URL}`;

const INITIAL_VIEW = { longitude: 139.7671, latitude: 35.6812, zoom: 10.2 };
const RAIL_LAYER_ID = "rail-lines";
const STATION_LAYER_ID = "rail-station-dots";
const STATION_LABEL_LAYER_ID = "rail-station-labels";
const OVERTURE_ATTRIBUTION =
  'Rail data: <a href="https://overturemaps.org/" target="_blank" rel="noopener noreferrer">Overture Maps</a>';
const PROTOMAPS_LANGUAGE: Record<Language, string> = {
  zh: "zh-Hans",
  ja: "ja",
  en: "en",
};
const PROTOMAPS_STYLE_THEME: Record<ResolvedTheme, string> = {
  dark: "dark",
  light: "white",
};

const REMOVE_LAYER_IDS = new Set([
  "pois",
  "buildings",
  "roads_labels_minor",
  "roads_labels_major",
  "roads_rail",
  "roads_other",
  "roads_link",
  "roads_minor_service",
  "roads_minor",
  "roads_minor_service_casing",
  "roads_minor_casing",
  "roads_link_casing",
  "roads_major_casing_early",
  "roads_tunnels_other_casing",
  "roads_tunnels_minor_casing",
  "roads_tunnels_link_casing",
  "roads_tunnels_major_casing",
  "roads_tunnels_highway_casing",
  "roads_tunnels_other",
  "roads_tunnels_minor",
  "roads_tunnels_link",
  "roads_tunnels_major",
  "roads_tunnels_highway",
  "roads_bridges_other_casing",
  "roads_bridges_link_casing",
  "roads_bridges_minor_casing",
  "roads_bridges_other",
  "roads_bridges_minor",
  "roads_bridges_link",
  "roads_runway",
  "roads_taxiway",
  "landuse_runway",
  "landuse_pier",
  "roads_pier",
  "water_waterway_label",
]);

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  detail?: string;
}

interface Props {
  theme: ResolvedTheme;
  language: Language;
}

const THEME_COLORS = {
  dark: {
    background: "#0c0f12",
    lineFallback: "#889096",
    stationFill: "#f3f5f7",
    stationStroke: "#252a2f",
    text: "#eef2f5",
    halo: "#0c0f12",
  },
  light: {
    background: "#f3f5f1",
    lineFallback: "#56616c",
    stationFill: "#182029",
    stationStroke: "#ffffff",
    text: "#17212b",
    halo: "#ffffff",
  },
} as const;

const STATUS_TEXT = {
  zh: {
    loading: "加载中",
    ready: "Global rail PMTiles",
    error: "地图加载失败",
    station: "车站",
    unnamed: "未命名",
    passenger: "客运",
    freight: "货运",
    underConstruction: "在建",
    disused: "停用",
    abandoned: "废弃",
  },
  ja: {
    loading: "読み込み中",
    ready: "Global rail PMTiles",
    error: "地図の読み込みに失敗",
    station: "駅",
    unnamed: "名称不明",
    passenger: "旅客",
    freight: "貨物",
    underConstruction: "建設中",
    disused: "休止",
    abandoned: "廃止",
  },
  en: {
    loading: "Loading",
    ready: "Global rail PMTiles",
    error: "Map failed to load",
    station: "Station",
    unnamed: "Unnamed",
    passenger: "passenger",
    freight: "freight",
    underConstruction: "under construction",
    disused: "disused",
    abandoned: "abandoned",
  },
} as const;

function protomapsStyleUrl(
  theme: ResolvedTheme,
  language: Language,
): string | null {
  if (!PROTOMAPS_KEY) return null;
  return `https://api.protomaps.com/styles/v5/${PROTOMAPS_STYLE_THEME[theme]}/${PROTOMAPS_LANGUAGE[language]}.json?key=${PROTOMAPS_KEY}`;
}

function emptyStyle(theme: ResolvedTheme): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": THEME_COLORS[theme].background },
      },
    ],
  };
}

async function fetchFilteredStyle(
  theme: ResolvedTheme,
  language: Language,
): Promise<maplibregl.StyleSpecification> {
  const styleUrl = protomapsStyleUrl(theme, language);
  if (!styleUrl) return emptyStyle(theme);

  let res: Response;
  try {
    res = await fetch(styleUrl);
  } catch {
    return emptyStyle(theme);
  }

  if (!res.ok) return emptyStyle(theme);

  const style = (await res.json()) as maplibregl.StyleSpecification;
  style.layers = style.layers.filter(
    (layer) => !REMOVE_LAYER_IDS.has(layer.id),
  );
  return style;
}

function nameFields(language: Language): maplibregl.ExpressionSpecification {
  const fieldsByLanguage = {
    zh: ["name", "name_en", "name_ja"],
    ja: ["name_ja", "name", "name_en"],
    en: ["name_en", "name", "name_ja"],
  } as const;
  const fields = fieldsByLanguage[language];
  let expr: unknown = "";

  for (let i = fields.length - 1; i >= 0; i -= 1) {
    const field = fields[i];
    expr = [
      "case",
      ["all", ["has", field], ["!=", ["get", field], ""]],
      ["get", field],
      expr,
    ];
  }

  return expr as maplibregl.ExpressionSpecification;
}

function nameFromProperties(
  props: Record<string, unknown> | null | undefined,
  language: Language,
): string {
  if (!props) return STATUS_TEXT[language].unnamed;

  const fieldsByLanguage = {
    zh: ["name", "name_en", "name_ja"],
    ja: ["name_ja", "name", "name_en"],
    en: ["name_en", "name", "name_ja"],
  } as const;

  for (const field of fieldsByLanguage[language]) {
    if (props[field]) return String(props[field]);
  }

  return String(props.id || STATUS_TEXT[language].unnamed);
}

function routeDetail(
  props: Record<string, unknown> | null | undefined,
  language: Language,
): string | undefined {
  if (!props) return undefined;
  const text = STATUS_TEXT[language];
  const parts = [
    props.class ? `class: ${props.class}` : null,
    props.is_passenger ? text.passenger : null,
    props.is_freight ? text.freight : null,
    props.is_under_construction ? text.underConstruction : null,
    props.is_disused ? text.disused : null,
    props.is_abandoned ? text.abandoned : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function removeRailLayers(map: maplibregl.Map) {
  for (const layerId of [
    STATION_LABEL_LAYER_ID,
    STATION_LAYER_ID,
    RAIL_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource("rail")) map.removeSource("rail");
}

function addRailLayers(
  map: maplibregl.Map,
  theme: ResolvedTheme,
  language: Language,
  filter: RailFilterState,
) {
  const colors = THEME_COLORS[theme];

  removeRailLayers(map);
  map.addSource("rail", { type: "vector", url: RAIL_PMTILES });

  map.addLayer({
    id: RAIL_LAYER_ID,
    type: "line",
    source: "rail",
    "source-layer": "segments",
    minzoom: 0,
    paint: {
      "line-color": [
        "coalesce",
        ["get", "color"],
        colors.lineFallback,
      ] as maplibregl.ExpressionSpecification,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        0.35,
        5,
        0.75,
        9,
        1.8,
        13,
        4,
      ] as maplibregl.ExpressionSpecification,
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        0.5,
        6,
        0.82,
        11,
        0.96,
      ] as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: STATION_LAYER_ID,
    type: "circle",
    source: "rail",
    "source-layer": "stations",
    minzoom: 6,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6,
        1.5,
        10,
        3,
        14,
        5,
      ] as maplibregl.ExpressionSpecification,
      "circle-color": colors.stationFill,
      "circle-opacity": 0.92,
      "circle-stroke-color": colors.stationStroke,
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: STATION_LABEL_LAYER_ID,
    type: "symbol",
    source: "rail",
    "source-layer": "stations",
    minzoom: 10,
    layout: {
      "text-field": nameFields(language),
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        10,
        14,
        12,
      ] as maplibregl.ExpressionSpecification,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-max-width": 8,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": colors.text,
      "text-halo-color": colors.halo,
      "text-halo-width": 1.5,
    },
  });

  map.setFilter(RAIL_LAYER_ID, buildRailFilterExpr(filter));
}

function isRailSourceLoaded(map: maplibregl.Map): boolean {
  return Boolean(map.getSource("rail") && map.isSourceLoaded("rail"));
}

function watchRailSourceReady(
  map: maplibregl.Map,
  onReady: () => void,
): () => void {
  let ready = false;

  const markReady = () => {
    if (ready) return;
    ready = true;
    onReady();
    cleanup();
  };

  const handleSourceData = (event: maplibregl.MapSourceDataEvent) => {
    if (event.sourceId === "rail" && event.isSourceLoaded) markReady();
  };

  const handleIdle = () => {
    if (isRailSourceLoaded(map)) markReady();
  };

  const cleanup = () => {
    map.off("sourcedata", handleSourceData);
    map.off("idle", handleIdle);
  };

  map.on("sourcedata", handleSourceData);
  map.on("idle", handleIdle);
  handleIdle();

  return cleanup;
}

function syncRailLayersAfterStyleLoad(
  map: maplibregl.Map,
  theme: ResolvedTheme,
  language: Language,
  filter: RailFilterState,
  onRailReady: () => void,
): () => void {
  let cancelled = false;
  let cleanupRailReady: (() => void) | undefined;

  const applyRailLayers = () => {
    if (cancelled) return;
    addRailLayers(map, theme, language, filter);
    cleanupRailReady = watchRailSourceReady(map, onRailReady);
  };

  map.once("style.load", applyRailLayers);

  return () => {
    cancelled = true;
    map.off("style.load", applyRailLayers);
    cleanupRailReady?.();
  };
}

export default function MapView({ theme, language }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const themeRef = useRef(theme);
  const languageRef = useRef(language);
  const railFilterRef = useRef<RailFilterState>(defaultRailFilter());
  const styleKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [railFilter, setRailFilterState] = useState<RailFilterState>(
    railFilterRef.current,
  );
  const [tooltip, setTooltip] = useState<HoverInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  function setRailFilter(filter: RailFilterState) {
    railFilterRef.current = filter;
    setRailFilterState(filter);
  }

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let cancelled = false;
    let map: maplibregl.Map | null = null;
    setMapReady(false);
    setTooltip(null);
    setStatus("loading");

    fetchFilteredStyle(theme, language)
      .then((style) => {
        if (cancelled || !mapContainer.current) return;

        map = new maplibregl.Map({
          container: mapContainer.current,
          style,
          center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
          zoom: INITIAL_VIEW.zoom,
          minZoom: 1,
          attributionControl: false,
        });
        mapRef.current = map;

        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: OVERTURE_ATTRIBUTION,
          }),
          "bottom-right",
        );
        map.addControl(
          new maplibregl.NavigationControl({ visualizePitch: true }),
          "top-right",
        );
        map.addControl(
          new maplibregl.ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        map.on("load", () => {
          if (!map) return;
          styleKeyRef.current = `${theme}-${language}`;
          addRailLayers(map, theme, language, railFilterRef.current);
          setMapReady(true);

          watchRailSourceReady(map, () => setStatus("ready"));
        });

        map.on("mousemove", RAIL_LAYER_ID, (event) => {
          map?.getCanvas().style.setProperty("cursor", "pointer");
          const props = event.features?.[0]?.properties ?? null;
          const currentLanguage = languageRef.current;
          setTooltip({
            x: event.point.x,
            y: event.point.y,
            name: nameFromProperties(props, currentLanguage),
            detail: routeDetail(props, currentLanguage),
          });
        });

        map.on("mouseleave", RAIL_LAYER_ID, () => {
          map?.getCanvas().style.setProperty("cursor", "");
          setTooltip(null);
        });

        map.on("mousemove", STATION_LAYER_ID, (event) => {
          map?.getCanvas().style.setProperty("cursor", "pointer");
          const props = event.features?.[0]?.properties ?? null;
          const currentLanguage = languageRef.current;
          setTooltip({
            x: event.point.x,
            y: event.point.y,
            name: nameFromProperties(props, currentLanguage),
            detail: STATUS_TEXT[currentLanguage].station,
          });
        });

        map.on("mouseleave", STATION_LAYER_ID, () => {
          map?.getCanvas().style.setProperty("cursor", "");
          setTooltip(null);
        });

        map.on("error", (event) => {
          if (event.error) console.error(event.error);
        });
      })
      .catch((error) => {
        console.error(error);
        setStatus("error");
      });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;
    languageRef.current = language;

    const map = mapRef.current;
    if (!mapReady || !map) return;

    const styleKey = `${theme}-${language}`;
    if (styleKeyRef.current === styleKey) return;

    let cancelled = false;
    let cleanupStyleLoad: (() => void) | undefined;
    setTooltip(null);
    setStatus("loading");

    fetchFilteredStyle(theme, language)
      .then((style) => {
        if (cancelled || !mapRef.current) return;
        styleKeyRef.current = styleKey;
        cleanupStyleLoad = syncRailLayersAfterStyleLoad(
          map,
          themeRef.current,
          languageRef.current,
          railFilterRef.current,
          () => setStatus("ready"),
        );
        map.setStyle(style, { diff: false });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      cleanupStyleLoad?.();
    };
  }, [mapReady, theme, language]);

  useEffect(() => {
    railFilterRef.current = railFilter;
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer(RAIL_LAYER_ID)) return;
    map.setFilter(RAIL_LAYER_ID, buildRailFilterExpr(railFilter));
  }, [mapReady, railFilter]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />
      <RailFilterPanel
        filter={railFilter}
        language={language}
        onChange={setRailFilter}
      />
      {status === "error" && (
        <div className="map-error">{STATUS_TEXT[language].error}</div>
      )}
      {tooltip && (
        <div
          className="rail-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <strong>{tooltip.name}</strong>
          {tooltip.detail && <span>{tooltip.detail}</span>}
        </div>
      )}
    </div>
  );
}
