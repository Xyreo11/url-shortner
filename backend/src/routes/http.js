// src/routes/http.js
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { shortenUrl, resolveUrl } from "../services/url.service.js";
import { db } from "../config/db.js";
import geoip from "geoip-lite";
import { createHash } from "node:crypto";
import { parseUA } from "../utils/uaParser.js";
import { counters } from "../utils/metrics.js";

// Two routers, deliberately.
//
// /shorten is a JSON API call from a browser: it needs a body parser, CORS
// and request logging. The redirect is a bare navigation that needs none of
// them, and mounting them globally meant every redirect paid for all three.
export const shortenRouter = express.Router();
export const redirectRouter = express.Router();

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

/* ---------------------- QR detection (heuristic) ---------------------- */
/**
 * Takes the already-lowercased user agent and the referer rather than the
 * request, because the handler has read both headers by this point and the
 * previous version read them again.
 *
 * Still a heuristic, and a weak one: privacy tools strip the referer too, so
 * this misclassifies. The right design encodes the source as a query
 * parameter in the QR'd URL so the server is told rather than guessing.
 */
function detectQR(uaLower, referer) {
  if (uaLower.includes("qr") || uaLower.includes("scanner")) return true;

  // Camera apps send no referer, and are not one of the browsers.
  if (referer === "") {
    return (
      !uaLower.includes("chrome") &&
      !uaLower.includes("firefox") &&
      !uaLower.includes("safari")
    );
  }

  return false;
}

/**
 * geoip-lite never resolves a loopback or private address, so on any request
 * from the same host or a local network it does a binary search over a ~50MB
 * in-memory dataset to return null.
 *
 * Caveat worth stating whenever this is quoted: with a load generator on the
 * same machine this skips 100% of benchmark traffic, and in production it
 * would skip approximately none. It is a legitimate optimisation but it
 * flatters this particular measurement, so it is reported separately rather
 * than folded into the headline.
 */
function isLocalAddress(ip) {
  return (
    ip === "" ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

/*
|-------------------------------------------------------------------------- 
| POST /shorten
|-------------------------------------------------------------------------- 
*/
shortenRouter.post("/", async (req, res) => {
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
redirectRouter.get("/:code", async (req, res) => {
  try {
    const shortCode = req.params.code;

    // Resolve URL
    const longUrl = await resolveUrl(shortCode);
    if (!longUrl) {
      counters.redirectsNotFound += 1;
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      return res.status(404).send("URL not found");
    }

    // req.ip, not req.headers["x-forwarded-for"].
    //
    // Reading the header directly bypasses Express's trust proxy setting
    // entirely, so any client could set it and choose the IP that gets hashed
    // into the analytics row. Express already applies the configured trust
    // policy to req.ip, which is the whole point of having the setting.
    const ip = (req.ip || "").replace(/^::ffff:/, "");

    // Read each header once and share the lowercased form. parseUA and
    // detectQR both used to read and lowercase the user agent independently.
    const uaRaw = req.get("User-Agent") || "";
    const uaLower = uaRaw.toLowerCase();
    const referer = req.get("Referer") || "";

    const ua = parseUA(uaRaw);

    // Skipped for local addresses, where the lookup can only return null.
    const country = isLocalAddress(ip) ? "Unknown" : geoip.lookup(ip)?.country || "Unknown";

    const isQR = detectQR(uaLower, referer);

    // createHash is imported statically at the top of this file. It used to be
    // `await import("crypto")` here, a dynamic import executed on every single
    // request: the module is cached after the first call, but it still cost a
    // module-registry lookup and forced the handler to yield to the microtask
    // queue in the middle of the hot path.
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
        referer,
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

    // Write the 302 directly rather than via res.redirect.
    //
    // res.redirect does a surprising amount for a bodyless response: it runs
    // full Accept content negotiation through negotiator, sets Vary: Accept,
    // picks a Content-Type, escapes the destination into an HTML or plain
    // text body, measures that body with Buffer.byteLength and writes it. A
    // 302 needs none of it. This is a CPU and syscall saving, not a bandwidth
    // one: on loopback the bytes were never the constraint.
    //
    // The scheme guard below is why this is safe, and in fact safer than
    // before. res.redirect would happily emit any stored string as a
    // Location, including a javascript: URL. Validation now runs at write
    // time, but rows created before validation existed are still in the
    // table, so the read path refuses anything that is not http(s) rather
    // than trusting what it finds.
    if (!longUrl.startsWith("https://") && !longUrl.startsWith("http://")) {
      counters.badDestinations += 1;
      console.error("[redirect] refusing non-http destination for", shortCode);
      return res.status(500).send("Internal server error");
    }

    counters.redirects += 1;
    // The two headers a bodyless 302 actually benefits from, folded into the
    // single writeHead so they cost nothing extra. helmet would have run
    // thirteen middlewares and about a dozen setHeader calls to produce these
    // plus ten others that are inert here: frame options and XSS protection
    // mean nothing without a body, the cross-origin policies mean nothing
    // without a document, and HSTS is inert over plain http.
    res.writeHead(302, {
      Location: longUrl,
      "Content-Length": "0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    return res.end();
  } catch (err) {
    console.error("[redirect]", err.message);
    return res.status(500).send("Internal server error");
  }
});

export default redirectRouter;
