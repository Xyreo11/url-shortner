// src/routes/analytics.js
import express from "express";
import * as service from "../services/analytics.service.js";
import { authMiddleware, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// User analytics (authenticated)
router.get("/user", authMiddleware, async (req, res) => {
  try {
    const email = req.user?.email;
    const { range } = req.query;
    if (!email) return res.status(401).json({ error: "Unauthorized" });
    const data = await service.getUserStats(email, { range });
    // pass ownerEmail so trend is scoped to this user's links
    const trend = await service.getClickTrend({ range, granularity: "daily", ownerEmail: email, zeroFill: true });
    return res.json({ ...data, trend });
  } catch (err) {
    console.error("GET /analytics/user", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Admin overview (admin only)
router.get("/admin", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const summary = await service.getAdminStats({ range });
    const trend = await service.getClickTrend({ range, granularity: "daily" });
    const breakdowns = await service.getBreakdowns({ range });
    const topLinks = await service.getTopLinks({ range, limit: 10 });
    const health = await service.getHealthMetrics();
    return res.json({
      ...summary,
      trend,
      breakdowns,
      topLinks,
      health,
    });
  } catch (err) {
    console.error("GET /analytics/admin", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// trend endpoint (optional)
router.get("/trend", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { range = "14d", granularity = "daily" } = req.query;
    const t = await service.getClickTrend({ range, granularity });
    return res.json({ data: t });
  } catch (err) {
    console.error("GET /analytics/trend", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// top links
router.get("/top-links", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { range = "30d", limit = 10 } = req.query;
    const top = await service.getTopLinks({ range, limit: parseInt(limit, 10) });
    return res.json({ topLinks: top });
  } catch (err) {
    console.error("GET /analytics/top-links", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
