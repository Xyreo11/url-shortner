// src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

// Core auth function
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || config.JWT_SECRET);

    req.user = payload; // id, email, role
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Admin-only protection
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
};

// Alias to support older imports
const authMiddleware = requireAuth;

export { authMiddleware, requireAuth, adminOnly };
