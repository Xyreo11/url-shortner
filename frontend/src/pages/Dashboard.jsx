// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import FilterBar from "../components/FilterBar";
import { saveAs } from "file-saver";
import { useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* ------------------------- SMALL COMPONENTS ------------------------- */
function StatCard({ title, value }) {
  return (
    <div className="stat-card" style={{ minWidth: 220 }}>
      <h3>{title}</h3>
      <p className="stat-value">{value ?? "-"}</p>
    </div>
  );
}

function TinyLoading() {
  return <div style={{ padding: 12 }}>Loading…</div>;
}

function safeJSON(res) {
  return res.json ? res.json() : Promise.resolve(res);
}

/* ------------------------- THEME COLORS ------------------------- */
const BLUE = "#1976d2";
const GREEN = "#0b784f";
const BLUE_GREEN_GRAD = ["#dff6ff", "#bfeefa", "#79d2e0", "#15a3a1", "#0b784f"];
const PIE_COLORS = [BLUE, GREEN, "#4fc3f7", "#82e0aa", "#ffc107", "#9c27b0"];

/* ==================================================================== */
/*                           DASHBOARD COMPONENT                        */
/* ==================================================================== */

export default function Dashboard() {
  /* ------------------------- CRITICAL FIX ------------------------- */
  let currentUser = null;
  try {
    const raw = localStorage.getItem("currentUser");
    currentUser = raw ? JSON.parse(raw) : null;
  } catch (e) {
    currentUser = null;
  }

  const isAdmin = currentUser?.role === "admin";
  const token = localStorage.getItem("token") || null;

  /* --------------------------- HOOKS -------------------------------- */
  const [activeView, setActiveView] = useState("user");
  const [filters, setFilters] = useState({
    range: "14d",
    start: null,
    end: null,
    device: "all",
    browser: "all",
    country: "all",
    granularity: "daily",
    topN: 10,
  });

  const [userData, setUserData] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const location = useLocation();
  const abortRef = useRef(null);

  /* --------------------- VIEW SYNC WITH QUERY PARAM --------------------- */
  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const view = qp.get("view");

    if (view === "admin" && isAdmin) {
      setActiveView("admin");
    } else if (view === "admin" && !isAdmin) {
      setActiveView("user");
    }
  }, [location.search, isAdmin]);

  /* ----------------------------- FETCH DATA ----------------------------- */
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchData() {
      setLoading(true);
      setError("");

      try {
        const q = new URLSearchParams();
        if (filters.range) q.set("range", filters.range);
        if (filters.device && filters.device !== "all") q.set("device", filters.device);
        if (filters.browser && filters.browser !== "all") q.set("browser", filters.browser);
        if (filters.country && filters.country !== "all") q.set("country", filters.country);

        q.set("granularity", filters.granularity || "daily");
        q.set("topN", filters.topN || 10);

        const url =
          activeView === "user"
            ? `${API}/analytics/user?${q.toString()}`
            : `${API}/analytics/admin?${q.toString()}`;

        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const resp = await fetch(url, { headers, signal: controller.signal });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(txt || `Server ${resp.status}`);
        }

        const json = await safeJSON(resp);
        const payload = json?.data ?? json;

        if (activeView === "user") setUserData(payload);
        else setAdminData(payload);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("fetchData error", err);
          setError(err?.message || "Failed to fetch analytics");
        }
      } finally {
        setLoading(false);
      }
    }

    if (activeView === "admin" && !isAdmin) {
      setError("Admin analytics are restricted to administrators");
      setAdminData(null);
      setLoading(false);
    } else {
      fetchData();
    }

    return () => controller.abort();
  }, [activeView, JSON.stringify(filters), token, isAdmin]);

  /* ---------------------------- TREND TRANSFORM ---------------------------- */
  const trendData = useMemo(() => {
    const t = (activeView === "user" ? userData?.trend : adminData?.trend) || [];

    return t.map((item) => {
      let dt = item.time;

      if (typeof dt === "string") {
        try {
          dt = parseISO(dt);
        } catch {
          dt = new Date(dt);
        }
      } else if (!dt) {
        dt = new Date();
      }
      const fmt = filters.granularity === "hourly" ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";
      return {
        time: format(new Date(dt), fmt),
        clicks: Number(item.clicks || 0),
      };
    });
  }, [userData, adminData, filters.granularity, activeView]);

  /* ------------------------- HELPERS: SAFE FIELDS ------------------------ */
  // backend may return summary fields at root OR inside breakdowns; handle both.
  const getDevices = () => {
    if (!adminData) return [];
    if (Array.isArray(adminData.devices)) return adminData.devices;
    if (adminData.breakdowns && Array.isArray(adminData.breakdowns.devices)) return adminData.breakdowns.devices;
    if (Array.isArray(adminData?.devices?.rows)) return adminData.devices.rows;
    return [];
  };
  const getBrowsers = () => {
    if (!adminData) return [];
    if (Array.isArray(adminData.browsers)) return adminData.browsers;
    if (adminData.breakdowns && Array.isArray(adminData.breakdowns.browsers)) return adminData.breakdowns.browsers;
    if (Array.isArray(adminData?.browsers?.rows)) return adminData.browsers.rows;
    return [];
  };
  const getOs = () => {
    if (!adminData) return [];
    if (Array.isArray(adminData.os)) return adminData.os;
    if (adminData.breakdowns && Array.isArray(adminData.breakdowns.os)) return adminData.breakdowns.os;
    if (Array.isArray(adminData?.os?.rows)) return adminData.os.rows;
    return [];
  };
  const getCountries = () => {
    if (!adminData) return [];
    if (Array.isArray(adminData.countries)) return adminData.countries;
    if (adminData.breakdowns && Array.isArray(adminData.breakdowns.countries)) return adminData.breakdowns.countries;
    if (Array.isArray(adminData?.countries?.rows)) return adminData.countries.rows;
    return [];
  };

  /* ---------------------------- CHART DATA ---------------------------- */
  const deviceChartData = useMemo(
    () =>
      getDevices().map((d) => ({
        key: d.device ?? d.name ?? d.key,
        count: Number(d.count ?? d.value ?? d.cnt ?? 0),
      })),
    [adminData]
  );

  const browserChartData = useMemo(
    () =>
      getBrowsers().map((b) => ({
        key: b.browser ?? b.name ?? b.key,
        count: Number(b.count ?? b.value ?? b.cnt ?? 0),
      })),
    [adminData]
  );

  const osChartData = useMemo(
    () =>
      getOs().map((o) => ({
        key: o.os ?? o.name ?? o.key,
        count: Number(o.count ?? o.value ?? o.cnt ?? 0),
      })),
    [adminData]
  );

  const countryChartData = useMemo(
    () =>
      getCountries()
        .map((c) => ({
          key: c.country ?? c.name ?? c.key,
          count: Number(c.count ?? c.value ?? c.cnt ?? 0),
        }))
        .slice(0, 20), // limit to top 20 for display
    [adminData]
  );

  // QR vs Normal small pie data (Option B)
  const qrPieData = useMemo(() => {
    const total = Number(adminData?.totalClicks ?? adminData?.total ?? 0);
    const qr = Number(adminData?.qrScans ?? 0);
    const normal = Math.max(0, total - qr);
    return [
      { name: "QR Scans", value: qr },
      { name: "Normal Clicks", value: normal },
    ];
  }, [adminData]);

  /* ------------------------------ EXPORT CSV ------------------------------ */
  function exportCSV() {
    const rows = (activeView === "user" ? userData?.topLinks : adminData?.topLinks) || [];
    if (!rows.length) {
      alert("No rows to export");
      return;
    }

    const csv = [
      ["short_code", "long_url", "clicks"],
      ...rows.map((r) => [
        r.short_code || r.id,
        (r.long_url || "").replace(/,/g, " "),
        r.clicks || 0,
      ]),
    ]
      .map((r) => r.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `${activeView}_top_links.csv`);
  }

  /* ==================================================================== */
  /*                               RENDER                                 */
  /* ==================================================================== */

  return (
    <main style={{ paddingBottom: 60 }}>
      <section className="container" style={{ marginTop: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h1 className="analytics-title">Analytics Dashboard</h1>
            <p className="analytics-subtitle">
              URL Shortener Analytics & Performance Metrics
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={activeView === "user" ? "toggle-active" : "toggle"}
              onClick={() => setActiveView("user")}
            >
              User View
            </button>

            {isAdmin && (
              <button
                className={activeView === "admin" ? "toggle-active" : "toggle"}
                onClick={() => setActiveView("admin")}
              >
                Admin View
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <FilterBar filters={filters} setFilters={setFilters} isAdmin={isAdmin} />
        </div>
      </section>

      <section className="container" style={{ marginTop: 24 }}>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        {loading && <TinyLoading />}

        {/* ---------------------------- USER VIEW ---------------------------- */}
        {!loading && activeView === "user" && (
          <>
            <div
              className="stats-section"
              style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
            >
              <StatCard title="Your Total Links" value={userData?.totalLinks ?? 0} />
              <StatCard title="Total Clicks" value={userData?.totalClicks ?? 0} />
              <StatCard title="Avg. Clicks / Link" value={userData?.avgClicks ?? 0} />
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="analytic-card">
                <h2>Your Click Trend</h2>
                <div style={{ width: "100%", height: 280 }}>
                  {trendData.length ? (
                    <ResponsiveContainer>
                      <LineChart data={trendData}>
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="clicks"
                          stroke={BLUE}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ padding: 40 }}>No data for selected range</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="analytic-card">
                <h2>Your Top Links</h2>

                {userData?.topLinks?.length ? (
                  <ul style={{ marginTop: 12 }}>
                    {userData.topLinks.map((l, i) => (
                      <li
                        key={i}
                        style={{
                          padding: "10px 0",
                          borderBottom: "1px solid #f1f1f1",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            <a
                              href={`${API}/${l.short_code}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {`${API}/${l.short_code}`}
                            </a>
                            <div style={{ fontSize: 13, color: "#666" }}>
                              {l.long_url}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700 }}>{l.clicks}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ padding: 20 }}>No top links</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---------------------------- ADMIN VIEW ---------------------------- */}
        {!loading && activeView === "admin" && isAdmin && (
          <>
            {error ? (
              <div style={{ padding: 20, color: "crimson" }}>
                Failed to load admin data — see server logs.{" "}
                {typeof error === "string" ? (
                  <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
                ) : null}
              </div>
            ) : null}

            <div
              className="stats-section"
              style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
            >
              <StatCard title="Total Clicks" value={adminData?.totalClicks ?? "-"} />
              <StatCard
                title="Unique Visitors"
                value={adminData?.uniqueVisitors ?? "-"}
              />
              <StatCard title="QR Scans" value={adminData?.qrScans ?? "-"} />
              <StatCard
                title="Avg Click Rate"
                value={adminData?.avgClickRate ? `${adminData.avgClickRate}%` : "-"}
              />
            </div>

            {/* Row 1: Trend + Devices */}
            <div
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(2,1fr)",
                gap: 20,
              }}
            >
              {/* Trend */}
              <div className="analytic-card">
                <h3>Clicks — Last {filters.range}</h3>
                <div style={{ width: "100%", height: 260 }}>
                  {trendData.length ? (
                    <ResponsiveContainer>
                      <LineChart data={trendData}>
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="clicks"
                          stroke={GREEN}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ padding: 20 }}>No trend data</div>
                  )}
                </div>
              </div>

              {/* Devices */}
              <div className="analytic-card">
                <h3>Device Breakdown</h3>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={deviceChartData}
                    >
                      <XAxis dataKey="key" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={BLUE} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 2: Browser + OS */}
            <div
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(2,1fr)",
                gap: 20,
              }}
            >
              {/* Browser Breakdown */}
              <div className="analytic-card">
                <h3>Browser Breakdown</h3>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={browserChartData}
                    >
                      <XAxis dataKey="key" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={BLUE} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* OS Breakdown */}
              <div className="analytic-card">
                <h3>OS Breakdown</h3>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={osChartData}
                    >
                      <XAxis dataKey="key" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={GREEN} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 3: Country + QR-vs-Normal (small pie) */}
            <div
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(2,1fr)",
                gap: 20,
              }}
            >
              {/* Country Breakdown */}
              <div className="analytic-card">
                <h3>Country Breakdown (top 20)</h3>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={countryChartData}
                    >
                      <XAxis dataKey="key" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={BLUE} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* QR vs Normal small chart */}
              <div className="analytic-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <h3>QR vs Normal</h3>
                <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={qrPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={40}
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {qrPieData.map((entry, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                  Total clicks: <strong>{adminData?.totalClicks ?? "-"}</strong>
                </div>
              </div>
            </div>

            {/* Top links (full width) */}
            <div style={{ marginTop: 20 }}>
              <div className="analytic-card">
                <h2>Top Links</h2>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ color: "#666" }}>Showing top {filters.topN}</div>
                  <button className="toggle" onClick={exportCSV}>
                    Export CSV
                  </button>
                </div>

                {adminData?.topLinks?.length ? (
                  <ul style={{ marginTop: 12 }}>
                    {adminData.topLinks.map((l, i) => (
                      <li
                        key={i}
                        style={{
                          padding: "10px 0",
                          borderBottom: "1px solid #f1f1f1",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          <a
                            href={`${API}/${l.short_code}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {`${API}/${l.short_code}`}
                          </a>
                          <div style={{ fontSize: 13, color: "#666" }}>
                            {l.long_url}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700 }}>{l.clicks}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ padding: 20 }}>No top links</div>
                )}
              </div>
            </div>

            {/* System Health */}
            <div style={{ marginTop: 24 }}>
              <div className="analytic-card">
                <h2>System Health</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                    gap: 12,
                  }}
                >
                  <div style={{ padding: 16 }}>
                    <h4>Cache Hit Rate</h4>
                    <p>{adminData?.health?.cacheHitRate ?? "—"}</p>
                  </div>
                  <div style={{ padding: 16 }}>
                    <h4>Avg Redirect Latency</h4>
                    <p>{adminData?.health?.avgRedirectLatency ?? "—"} ms</p>
                  </div>
                  <div style={{ padding: 16 }}>
                    <h4>Error Rate</h4>
                    <p>{adminData?.health?.errorRate ?? "—"}</p>
                  </div>
                  <div style={{ padding: 16 }}>
                    <h4>Uptime</h4>
                    <p>{adminData?.health?.uptime ?? "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
