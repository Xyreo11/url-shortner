// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { Copy, Check, Link2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

function isValidUrlCandidate(raw) {
  if (!raw) return false;
  // trim and require at least a domain and TLD: simple test
  const trimmed = raw.trim();
  try {
    // If user didn't include protocol, add https for validation
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    // Quick sanity checks
    if (!url.hostname || url.hostname.indexOf(".") === -1) return false;
    // reject single-letter hostnames etc
    if (url.hostname.length < 3) return false;
    return ["http:", "https:"].includes(url.protocol);
  } catch (e) {
    return false;
  }
}

function isValidAlias(alias) {
  if (!alias) return true; // optional
  // only allow alnum, -, _, length 3-50
  return /^[A-Za-z0-9\-_]{3,50}$/.test(alias);
}

export default function Home() {
  const user = localStorage.getItem("currentUser");
  const auth = localStorage.getItem("isAuthenticated") === "true";

  const [input, setInput] = useState("");
  const [alias, setAlias] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showQR, setShowQR] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    // clear error when user types
    const id = setTimeout(() => setError(""), 1500);
    return () => clearTimeout(id);
  }, [input, alias]);

  async function handleShorten() {
    setError("");
    setShortUrl("");
    setShortCode("");
    setQrImage("");
    setShowQR(false);
    setCopied(false);

    const trimmed = input.trim();
    if (!trimmed) {
      setError("Please enter a URL");
      return;
    }
    if (!isValidUrlCandidate(trimmed)) {
      setError("Please enter a valid URL (include domain and TLD)");
      return;
    }
    if (!isValidAlias(alias.trim())) {
      setError("Alias may only contain letters, numbers, '-' or '_' and must be 3+ chars");
      return;
    }

    setLoading(true);
    try {
      // build body: server expects long url + alias optional
      const body = { url: trimmed };
      if (alias.trim()) body.alias = alias.trim();

      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API}/shorten`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // show backend message if exists
        setError((data && data.error) || `Server responded with ${res.status}`);
        setLoading(false);
        return;
      }

      // backend returns { short_url, shortCode } or sometimes shortCode string
      const code = data.shortCode ?? data.short_code ?? (typeof data === "string" ? data : undefined);
      const url = data.short_url ?? data.shortUrl ?? (code ? `${API}/${code}` : null);

      // ensure code is string
      const codeStr = typeof code === "object" ? code?.shortCode ?? "" : code ?? "";

      setShortUrl(url || "");
      setShortCode(codeStr || "");
      setLoading(false);
    } catch (err) {
      console.error("Frontend fetch failure:", err);
      setError("❌ Unable to reach backend service");
      setLoading(false);
    }
  }

  async function handleGenerateQR() {
    setError("");
    setQrImage("");
    setShowQR(false);
    if (!shortCode && !shortUrl) {
      setError("Generate (shorten) a URL first");
      return;
    }
    const code = shortCode || shortUrl.split("/").pop();
    setQrLoading(true);
    try {
      const res = await fetch(`${API}/qr/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setError((data && data.error) || `QR endpoint ${res.status}`);
        setQrLoading(false);
        return;
      }
      setQrImage(data.qr);
      setShowQR(true);
      setQrLoading(false);
    } catch (err) {
      console.error("QR fetch error:", err);
      setError("QR generation failed");
      setQrLoading(false);
    }
  }

  async function handleCopy() {
    try {
      const text = shortUrl || `${API}/${shortCode}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("copy failed", err);
    }
  }

  return (
    <main>
      {/* HERO */}
      <section className="hero container">
        <h1 className="title fade-up delay-1">
          Shorten Your Links, <br />
          Amplify Your Reach
        </h1>

        <p className="subtitle fade-up delay-2">
          Create powerful short links and track their performance with real-time analytics
        </p>

        {/* INPUT AREA */}
        <div className="short-card fade-up delay-2" style={{ marginTop: 28 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <div className="input-glass" style={{ flex: "1 1 60%", minWidth: 300 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter your long URL here..."
                aria-label="long-url"
              />
            </div>

            <div className="input-glass" style={{ flex: "1 1 25%", minWidth: 200 }}>
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Alias (optional)"
                aria-label="alias"
              />
            </div>
          </div>

          {error && (
            <p style={{ color: "red", textAlign: "center", marginTop: 8 }}>{error}</p>
          )}

          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 20 }}>
            <button className="btn-gradient" onClick={handleShorten} disabled={loading}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <Link2 size={18} /> {loading ? "Generating..." : "Shorten URL"}
              </span>
            </button>

            <button className="btn-gradient" onClick={handleGenerateQR} disabled={qrLoading}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                📷 {qrLoading ? "Generating..." : "Generate QR"}
              </span>
            </button>
          </div>

          {/* SHORT URL BOX */}
          {shortUrl && (
            <div className="short-url-box" style={{ marginTop: 18 }}>
              <div style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <a href={shortUrl} target="_blank" rel="noreferrer">{shortUrl}</a>
              </div>
              <button onClick={handleCopy} aria-label="copy-short-url" title="Copy short url">{copied ? <Check /> : <Copy />}</button>
            </div>
          )}
        </div>
      </section>

      {/* small spacer */}
      <div style={{ height: 40 }} />

      {/* QR POPUP */}
      {showQR && (
        <div
          className="qr-modal"
          onClick={() => setShowQR(false)}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.45)",
            zIndex: 1200,
            padding: 20,
          }}
        >
          <div
            className="qr-box"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              padding: 20,
              borderRadius: 12,
              width: "min(420px, 92%)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>Scan QR to open link</h3>
            <p style={{ margin: "0 0 12px 0", color: "#555" }}>
              {shortUrl || `${API}/${shortCode}`}
            </p>
            {qrImage ? (
              <img src={qrImage} alt="qr code" style={{ width: 240, height: 240, margin: "0 auto", display: "block" }} />
            ) : (
              <div style={{ padding: 40 }}>Loading...</div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center" }}>
              <a href={qrImage} download={`qr-${shortCode || "link"}.png`} className="btn-gradient" style={{ textDecoration: "none" }}>
                Download PNG
              </a>
              <button className="btn-gradient" onClick={() => { navigator.clipboard.writeText(shortUrl || `${API}/${shortCode}`); }}>
                Copy URL
              </button>
            </div>

            <button onClick={() => setShowQR(false)} style={{ marginTop: 14, background: "transparent", border: "none", color: "#888", cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
