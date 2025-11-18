// src/routes/http.js
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { shortenUrl, resolveUrl } from "../services/url.service.js";
import { db } from "../config/db.js";
import geoip from "geoip-lite";

const router = express.Router();

/* ---------------------- Extract email from token ---------------------- */
function getEmailFromAuthHeader(req) {
  try {
    const auth = req.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || config.JWT_SECRET);
    return payload?.email || null;
  } catch {
    return null;
  }
}

/* ---------------------- Robust UA parsing ---------------------- */
function parseUserAgent(uaString = "") {
  const ua = uaString.toLowerCase();

  // OS
  let os = "Unknown";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac")) os = "MacOS";
  else if (ua.includes("linux")) os = "Linux";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

  // Browser (Edge fix)
  let browser = "Unknown";
  if (ua.includes("edg")) browser = "Edge";
  else if (ua.includes("chrome")) browser = "Chrome";
  else if (ua.includes("safari")) browser = "Safari";
  else if (ua.includes("firefox")) browser = "Firefox";

  // Device
  let device = "desktop";
  if (ua.includes("iphone") || ua.includes("android")) device = "mobile";
  if (ua.includes("ipad") || ua.includes("tablet")) device = "tablet";

  return { os, browser, device };
}

/* ---------------------- Accurate QR detection ---------------------- */
function detectQR(req) {
  const ua = (req.get("User-Agent") || "").toLowerCase();
  const referer = req.get("Referer") || "";

  // True QR cases
  if (ua.includes("qr") || ua.includes("scanner")) return true;

  // Browsers NEVER send referrer when scanned via camera apps
  if (referer === "") {
    if (!ua.includes("chrome") && !ua.includes("firefox") && !ua.includes("safari"))
      return true; // camera app or scanner
  }

  return false;
}

/*
|-------------------------------------------------------------------------- 
| POST /shorten
|-------------------------------------------------------------------------- 
*/
router.post("/shorten", async (req, res) => {
  try {
    const { url, alias } = req.body;
    const ownerEmail = getEmailFromAuthHeader(req);

    const shortCode = await shortenUrl(url, alias, req.ip, ownerEmail);

    return res.json({
      short_url: `${process.env.BASE_URL}/${shortCode}`,
      shortCode,
    });
  } catch (err) {
    console.error("❌ POST /shorten", err);
    return res.status(400).json({ error: err.message });
  }
});

/*
|-------------------------------------------------------------------------- 
| GET /:code  → Redirect + Track Analytics
|-------------------------------------------------------------------------- 
*/
router.get("/:code", async (req, res) => {
  try {
    const shortCode = req.params.code;

    // Resolve URL
    const longUrl = await resolveUrl(shortCode);
    if (!longUrl) return res.status(404).send("URL not found");

    // Normalize IP
    const ipRaw = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "";
    const ip = ipRaw.replace(/^::ffff:/, "");

    // UA parsing (fixed)
    const ua = parseUserAgent(req.get("User-Agent") || "");

    // GeoIP lookup (will be Unknown on localhost)
    const geo = geoip.lookup(ip);
    const country = geo?.country || "Unknown";

    // Proper QR detection
    const isQR = detectQR(req);

    // Deterministic IP hash
    const { createHash } = await import("crypto");
    const ipHash = createHash("sha256")
      .update(ip + (process.env.IP_SALT || "static_salt"))
      .digest("hex");

    // Insert analytics row
    await db.query(
      `
      INSERT INTO analytics 
      (short_code, ip_hash, device, browser, os, country, is_qr, referrer, timestamp)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      `,
      [
        shortCode,
        ipHash,
        ua.device,
        ua.browser,
        ua.os,
        country,
        isQR,
        req.get("Referer") || "",
      ]
    );

    // Increment click count
    await db.query(
      `UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1`,
      [shortCode]
    );

    console.log("📊 CLICK", {
      shortCode,
      ip,
      ua,
      country,
      isQR,
    });

    return res.redirect(longUrl);
  } catch (err) {
    console.error("❌ REDIRECT ERROR", err);
    return res.status(500).send("Internal server error");
  }
});

export default router;
