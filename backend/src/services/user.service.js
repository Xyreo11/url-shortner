// src/services/user.service.js
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { config } from "../config/env.js";

import {
  findUserAuthById,
  updateUserAvatar,
  updateUserProfileFields,
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
export async function updateUserProfile(id, { name, email }) {
  if (!name && !email) throw new Error("Nothing to update");

  if (email) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== id) {
      throw new Error("Email already in use");
    }
  }

  // One statement, and it returns the public columns, so there is no second
  // SELECT that could pull the password hash back into the response.
  const updated = await updateUserProfileFields(id, { name, email });
  if (!updated) throw new Error("User not found");
  return updated;
}

// ------------------------------------------------------
// Change Password
// ------------------------------------------------------
export async function updatePassword(id, oldPassword, newPassword) {
  // findUserAuthById, not findUserById: the latter no longer exposes the hash.
  const user = await findUserAuthById(id);
  if (!user) return false;

  // Validate old password
  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return false;

  // Hash new password
  // config.BCRYPT_ROUNDS, not a literal: auth.service already read the
  // configured cost, so raising it would silently have skipped password
  // changes and left those users on the old cost factor.
  const newHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

  // Save to DB
  await db.query(
    `UPDATE users 
     SET password_hash = $1 
     WHERE id = $2`,
    [newHash, id]
  );

  return true;
}
