// auth.js
import express from "express";
import Joi from "joi";
import { registerUser, authenticateUser } from "../services/auth.service.js";
import { rateLimit } from "../utils/rateLimiter.js";
import { config } from "../config/env.js";

const router = express.Router();

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().max(100).allow("", null)
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * Neither auth route was rate limited. Both run bcrypt at the configured cost,
 * which is deliberately expensive, so an unauthenticated caller could pin a
 * CPU core with a loop of login attempts. It also left credential stuffing
 * completely unthrottled.
 *
 * Keyed on IP. Note that req.ip is only as trustworthy as the trust proxy
 * setting, which now defaults to off for exactly this reason.
 */
async function authRateLimit(req, res) {
  const allowed = await rateLimit(
    `rl:auth:${req.ip}`,
    config.RATE_LIMIT_AUTH_MAX,
    config.RATE_LIMIT_AUTH_WINDOW_S
  );
  if (!allowed) {
    res.status(429).json({ error: "Too many attempts, please try again later" });
    return false;
  }
  return true;
}

router.post("/signup", async (req, res) => {
  try {
    if (!(await authRateLimit(req, res))) return;

    const { error, value } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const user = await registerUser(value);
    // don't return password/hash
    return res.status(201).json({ user });
  } catch (err) {
    console.error("Signup error:", err.message);
    return res.status(400).json({ error: err.message || "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    if (!(await authRateLimit(req, res))) return;

    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { token, user } = await authenticateUser(value);
    return res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(401).json({ error: err.message || "Authentication failed" });
  }
});

export default router;
