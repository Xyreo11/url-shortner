// src/components/FilterBar.jsx
import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const presets = [
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" },
];

const devices = ["all", "mobile", "desktop", "tablet"];
const browsers = ["all", "Chrome", "Safari", "Firefox", "Edge"];
const granularities = ["daily", "hourly"];

export default function FilterBar({ filters, setFilters, isAdmin }) {
  const update = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <div className="filter-bar-wrapper fade-in-up">
      <div className="filter-row">

        {/* RANGE */}
        <div className="filter-item">
          <label>Range</label>
          <select
            className="filter-select"
            value={filters.range}
            onChange={(e) => update({ range: e.target.value })}
          >
            {presets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* CUSTOM DATE RANGE */}
        {filters.range === "custom" && (
          <div className="custom-dates animated-expand">
            <div className="filter-item">
              <label>Start</label>
              <DatePicker
                className="filter-date"
                selected={filters.start ? new Date(filters.start) : null}
                onChange={(d) => update({ start: d })}
              />
            </div>

            <div className="filter-item">
              <label>End</label>
              <DatePicker
                className="filter-date"
                selected={filters.end ? new Date(filters.end) : null}
                onChange={(d) => update({ end: d })}
              />
            </div>
          </div>
        )}

        {/* DEVICE */}
        <div className="filter-item">
          <label>Device</label>
          <select
            className="filter-select"
            value={filters.device}
            onChange={(e) => update({ device: e.target.value })}
          >
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* BROWSER */}
        <div className="filter-item">
          <label>Browser</label>
          <select
            className="filter-select"
            value={filters.browser}
            onChange={(e) => update({ browser: e.target.value })}
          >
            {browsers.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* GRANULARITY */}
        <div className="filter-item">
          <label>Granularity</label>
          <select
            className="filter-select"
            value={filters.granularity}
            onChange={(e) => update({ granularity: e.target.value })}
          >
            {granularities.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* TOP N — ONLY ADMIN */}
        {isAdmin && (
          <div className="filter-item">
            <label>Top N</label>
            <select
              className="filter-select"
              value={filters.topN}
              onChange={(e) => update({ topN: parseInt(e.target.value, 10) })}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
