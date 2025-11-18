// src/services/auth.service.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { findUserByEmail, insertUser } from "../models/user.model.js";
import { config } from "../config/env.js";

const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);

/* =======================================================
   REGISTER USER
======================================================= */
export async function registerUser({ email, password, name }) {
  const existing = await findUserByEmail(email);
  if (existing) throw new Error("Email already registered");

  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  // NOTE: avatar_url defaults to NULL in DB
  const user = await insertUser({
    email,
    password_hash: hash,
    name,
  });

  return user;
}

/* =======================================================
   LOGIN + RETURN FULL USER OBJECT INCLUDING AVATAR
======================================================= */
export async function authenticateUser({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error("Invalid credentials");

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Error("Invalid credentials");

  // Create JWT payload
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET || config.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  // 🔥 CRITICAL FIX: include avatar_url in returned user object
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url ?? null,
    },
  };
}
