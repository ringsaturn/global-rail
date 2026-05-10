export const ALL_RAIL_CLASSES = [
  "subway",
  "light_rail",
  "tram",
  "monorail",
  "narrow_gauge",
  "standard_gauge",
  "funicular",
  "unknown",
] as const;

export type RailClass = (typeof ALL_RAIL_CLASSES)[number];

export const RAIL_CLASS_LABELS: Record<RailClass, string> = {
  subway: "地铁 Subway",
  light_rail: "轻轨 Light Rail",
  tram: "有轨电车 Tram",
  monorail: "单轨 Monorail",
  narrow_gauge: "窄轨 Narrow Gauge",
  standard_gauge: "标准轨 Standard Gauge",
  funicular: "缆车 Funicular",
  unknown: "未知 Unknown",
};

export const RAIL_CLASS_LABELS_BY_LANGUAGE: Record<
  "zh" | "ja" | "en",
  Record<RailClass, string>
> = {
  zh: RAIL_CLASS_LABELS,
  ja: {
    subway: "地下鉄 Subway",
    light_rail: "ライトレール Light Rail",
    tram: "路面電車 Tram",
    monorail: "モノレール Monorail",
    narrow_gauge: "狭軌 Narrow Gauge",
    standard_gauge: "標準軌 Standard Gauge",
    funicular: "ケーブルカー Funicular",
    unknown: "不明 Unknown",
  },
  en: {
    subway: "Subway",
    light_rail: "Light rail",
    tram: "Tram",
    monorail: "Monorail",
    narrow_gauge: "Narrow gauge",
    standard_gauge: "Standard gauge",
    funicular: "Funicular",
    unknown: "Unknown",
  },
};

export interface RailFilterState {
  classes: Record<RailClass, boolean>;
  statuses: {
    operational: boolean;
    under_construction: boolean;
    disused: boolean;
    abandoned: boolean;
  };
  usages: {
    passenger: boolean;
    freight: boolean;
  };
}

export function defaultRailFilter(): RailFilterState {
  return {
    classes: Object.fromEntries(
      ALL_RAIL_CLASSES.map((c) => [c, true]),
    ) as Record<RailClass, boolean>,
    statuses: {
      operational: true,
      under_construction: true,
      disused: true,
      abandoned: true,
    },
    usages: {
      passenger: true,
      freight: true,
    },
  };
}

export function countInactiveFilters(f: RailFilterState): number {
  return (
    ALL_RAIL_CLASSES.filter((c) => !f.classes[c]).length +
    Object.values(f.statuses).filter((v) => !v).length +
    Object.values(f.usages).filter((v) => !v).length
  );
}
