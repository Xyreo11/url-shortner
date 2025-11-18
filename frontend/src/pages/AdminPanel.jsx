// src/pages/AdminPanel.jsx
import React, { useEffect, useState } from "react";
import api from "../utils/api";

export default function AdminPanel() {
  const [data, setData] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(()=> {
    fetchAdmin();
  }, []);

  async function fetchAdmin() {
    try {
      const res = await api.get("/analytics/admin", token);
      setData(res);
    } catch (err) {
      console.error(err);
      alert("Failed to load admin data");
    }
  }

  return (
    <main className="container" style={{ marginTop:20 }}>
      <h1>Admin Panel</h1>
      <div style={{ marginTop:12 }}>
        <button className="toggle" onClick={fetchAdmin}>Refresh</button>
      </div>

      <div style={{ marginTop:20 }}>
        <div className="analytic-card">
          <h3>Failing URLs</h3>
          {data?.failingUrls?.length ? (
            <ul>
              {data.failingUrls.map((f,i)=> <li key={i}>{f.path} — {f.errors} errors</li>)}
            </ul>
          ) : <div style={{padding:16}}>No failing URLs</div>}
        </div>
      </div>
    </main>
  );
}
