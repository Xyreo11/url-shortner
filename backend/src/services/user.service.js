// src/services/user.service.js
import bcrypt from "bcrypt";
import { db } from "../config/db.js";

import {
  findUserById,
  updateUserAvatar,
  updateUserName,
  updateUserEmail,
  findUserByEmail,
} from "../models/user.model.js";

// ------------------------------------------------------
// Update Avatar
// ------------------------------------------------------
export async function updateAvatar(id, avatarUrl) {
  return await updateUserAvatar(id, avatarUrl);
}

// ------------------------------------------------------
// Update Profile (name + email)
// ------------------------------------------------------
export async function updateUserProfile(id, body) {
  const { name, email } = body;

  if (!name && !email) throw new Error("Nothing to update");

  // If changing email, check if already exists
  if (email) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== id) {
      throw new Error("Email already in use");
    }
  }

  if (name) {
    await updateUserName(id, name);
  }

  if (email) {
    await updateUserEmail(id, email);
  }

  // Return fresh updated user object
  return await findUserById(id);
}

// ------------------------------------------------------
// Change Password
// ------------------------------------------------------
export async function updatePassword(id, oldPassword, newPassword) {
  const user = await findUserById(id);
  if (!user) return false;

  // Validate old password
  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return false;

  // Hash new password
  const newHash = await bcrypt.hash(newPassword, 12);

  // Save to DB
  await db.query(
    `UPDATE users 
     SET password_hash = $1 
     WHERE id = $2`,
    [newHash, id]
  );

  return true;
}
