import { useState } from "react";
import {
  ALL_RAIL_CLASSES,
  RAIL_CLASS_LABELS_BY_LANGUAGE,
  countInactiveFilters,
  defaultRailFilter,
} from "../types/rail-filter";
import type { RailClass, RailFilterState } from "../types/rail-filter";
import type { Language } from "../types/settings";

interface Props {
  filter: RailFilterState;
  onChange: (filter: RailFilterState) => void;
  language: Language;
}

const TEXT = {
  zh: {
    filter: "筛选",
    title: "筛选线路类型与状态",
    classSection: "线路类型",
    statusSection: "运营状态",
    usageSection: "用途",
    selectAll: "全选",
    deselectAll: "全不选",
    reset: "重置筛选",
    statuses: {
      operational: "正常运营",
      under_construction: "在建",
      disused: "停用",
      abandoned: "废弃",
    },
    usages: {
      passenger: "客运",
      freight: "货运",
    },
  },
  ja: {
    filter: "絞り込み",
    title: "路線タイプと状態で絞り込み",
    classSection: "路線タイプ",
    statusSection: "運行状態",
    usageSection: "用途",
    selectAll: "すべて選択",
    deselectAll: "すべて解除",
    reset: "絞り込みをリセット",
    statuses: {
      operational: "運行中",
      under_construction: "建設中",
      disused: "休止",
      abandoned: "廃止",
    },
    usages: {
      passenger: "旅客",
      freight: "貨物",
    },
  },
  en: {
    filter: "Filter",
    title: "Filter rail types and status",
    classSection: "Rail type",
    statusSection: "Status",
    usageSection: "Usage",
    selectAll: "Select all",
    deselectAll: "Clear all",
    reset: "Reset filters",
    statuses: {
      operational: "Operational",
      under_construction: "Under construction",
      disused: "Disused",
      abandoned: "Abandoned",
    },
    usages: {
      passenger: "Passenger",
      freight: "Freight",
    },
  },
} as const;

const STATUS_KEYS = [
  "operational",
  "under_construction",
  "disused",
  "abandoned",
] as const;
const USAGE_KEYS = ["passenger", "freight"] as const;

export default function RailFilterPanel({ filter, onChange, language }: Props) {
  const [open, setOpen] = useState(false);
  const inactive = countInactiveFilters(filter);
  const text = TEXT[language];
  const classLabels = RAIL_CLASS_LABELS_BY_LANGUAGE[language];

  function toggleClass(cls: RailClass) {
    onChange({
      ...filter,
      classes: { ...filter.classes, [cls]: !filter.classes[cls] },
    });
  }

  function toggleStatus(key: keyof RailFilterState["statuses"]) {
    onChange({
      ...filter,
      statuses: { ...filter.statuses, [key]: !filter.statuses[key] },
    });
  }

  function toggleUsage(key: keyof RailFilterState["usages"]) {
    onChange({
      ...filter,
      usages: { ...filter.usages, [key]: !filter.usages[key] },
    });
  }

  function toggleAllClasses() {
    const allOn = ALL_RAIL_CLASSES.every((c) => filter.classes[c]);
    const classes = Object.fromEntries(
      ALL_RAIL_CLASSES.map((c) => [c, !allOn]),
    ) as RailFilterState["classes"];
    onChange({ ...filter, classes });
  }

  return (
    <div className="rail-filter-panel">
      <button
        className={`rail-filter-toggle${inactive > 0 ? " has-filter" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={text.title}
        type="button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M1.5 3h13l-5 6v5l-3-1.5V9L1.5 3z" />
        </svg>
        <span>{text.filter}</span>
        {inactive > 0 && <span className="filter-badge">{inactive}</span>}
        <span className="filter-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="rail-filter-body">
          <div className="filter-section">
            <div className="filter-section-head">
              <span>{text.classSection}</span>
              <button
                className="filter-all-btn"
                onClick={toggleAllClasses}
                type="button"
              >
                {ALL_RAIL_CLASSES.every((c) => filter.classes[c])
                  ? text.deselectAll
                  : text.selectAll}
              </button>
            </div>
            {ALL_RAIL_CLASSES.map((cls) => (
              <label key={cls} className="filter-row">
                <input
                  type="checkbox"
                  checked={filter.classes[cls]}
                  onChange={() => toggleClass(cls)}
                />
                <span>{classLabels[cls]}</span>
              </label>
            ))}
          </div>

          <div className="filter-section">
            <div className="filter-section-head">
              <span>{text.statusSection}</span>
            </div>
            {STATUS_KEYS.map((key) => (
              <label key={key} className="filter-row">
                <input
                  type="checkbox"
                  checked={filter.statuses[key]}
                  onChange={() => toggleStatus(key)}
                />
                <span>{text.statuses[key]}</span>
              </label>
            ))}
          </div>

          <div className="filter-section">
            <div className="filter-section-head">
              <span>{text.usageSection}</span>
            </div>
            {USAGE_KEYS.map((key) => (
              <label key={key} className="filter-row">
                <input
                  type="checkbox"
                  checked={filter.usages[key]}
                  onChange={() => toggleUsage(key)}
                />
                <span>{text.usages[key]}</span>
              </label>
            ))}
          </div>

          {inactive > 0 && (
            <button
              className="filter-reset-btn"
              onClick={() => onChange(defaultRailFilter())}
              type="button"
            >
              {text.reset}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
