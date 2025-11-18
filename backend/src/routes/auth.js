// auth.js
import express from "express";
import Joi from "joi";
import { registerUser, authenticateUser } from "../services/auth.service.js";

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

router.post("/signup", async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const user = await registerUser(value);
    // don't return password/hash
    return res.status(201).json({ user });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(400).json({ error: err.message || "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { token, user } = await authenticateUser(value);
    return res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(401).json({ error: err.message || "Authentication failed" });
  }
});

export default router;
