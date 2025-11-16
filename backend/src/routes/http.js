// src/routes/http.js

import express from "express";
import { shortenUrl, resolveUrl } from "../services/url.service.js";

const router = express.Router();

// ===================================================
// POST /shorten
// ===================================================
router.post("/shorten", async (req, res) => {
  console.log("📩 Incoming /shorten request:", req.body);

  try {
    const { url, alias } = req.body;
    const ip = req.ip;

    const shortCode = await shortenUrl(url, alias, ip);

    const response = {
      short_url: `${process.env.BASE_URL}/${shortCode}`,
      shortCode
    };

    console.log("✅ Shorten response:", response);

    return res.json(response);

  } catch (err) {
    console.error("❌ Error in /shorten:", err);
    return res.status(400).json({ error: err.message || "Unknown error" });
  }
});

// ===================================================
// GET /:code  → Redirect to long URL
// ===================================================
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;

    console.log("➡️ Incoming redirect for:", code);

    const longUrl = await resolveUrl(code);

    if (!longUrl) {
      console.log("❌ Redirect failed. URL not found:", code);
      return res.status(404).send("URL not found");
    }

    console.log("🔁 Redirecting to:", longUrl);
    return res.redirect(longUrl);

  } catch (err) {
    console.error("❌ Redirect error:", err);
    return res.status(500).send("Internal error");
  }
});

export default router;
