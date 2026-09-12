// src/routes/http.js
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { shortenUrl, resolveUrl } from "../services/url.service.js";
import { db } from "../config/db.js";
import geoip from "geoip-lite";
import { parseUA } from "../utils/uaParser.js";
import { counters } from "../utils/metrics.js";

const router = express.Router();

/* ---------------------- Extract email from token ---------------------- */
function getEmailFromAuthHeader(req) {
  try {
    const auth = req.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    const token = auth.split(" ")[1];
    const payload = jwt.verify(token, config.JWT_SECRET);
    return payload?.email || null;
  } catch {
    return null;
  }
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
      short_url: `${config.BASE_URL}/${shortCode}`,
      shortCode,
    });
  } catch (err) {
    console.error("[shorten]", err.message);
    return res.status(err.status || 400).json({ error: err.message });
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
    if (!longUrl) {
      counters.redirectsNotFound += 1;
      return res.status(404).send("URL not found");
    }

    // req.ip, not req.headers["x-forwarded-for"].
    //
    // Reading the header directly bypasses Express's trust proxy setting
    // entirely, so any client could set it and choose the IP that gets hashed
    // into the analytics row. Express already applies the configured trust
    // policy to req.ip, which is the whole point of having the setting.
    const ip = (req.ip || "").replace(/^::ffff:/, "");

    // UA parsing (fixed)
    const ua = parseUA(req.get("User-Agent") || "");

    // GeoIP lookup (will be Unknown on localhost)
    const geo = geoip.lookup(ip);
    const country = geo?.country || "Unknown";

    // Proper QR detection
    const isQR = detectQR(req);

    // Deterministic IP hash
    const { createHash } = await import("crypto");
    const ipHash = createHash("sha256")
      .update(ip + config.IP_SALT)
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

    // No per-request console.log here.
    //
    // On Windows, process.stdout to a console is a SYNCHRONOUS blocking
    // write, and this ran on every successful redirect with an object
    // literal, so each one also paid util.inspect formatting. At a few
    // hundred redirects per second that is a blocking syscall in the hot
    // path several hundred times a second. Request-level detail belongs in
    // the structured logger, behind a level, not on stdout unconditionally.

    counters.redirects += 1;
    return res.redirect(longUrl);
  } catch (err) {
    console.error("❌ REDIRECT ERROR", err);
    return res.status(500).send("Internal server error");
  }
});

export default router;
