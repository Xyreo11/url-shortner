import express from "express";
import Joi from "joi";
import { requireAuth } from "../middleware/authMiddleware.js";
import { updateUserProfile, updatePassword, updateAvatar } from "../services/user.service.js";

const router = express.Router();

// The auth routes validated with Joi from the start; these three did not, so
// the only check on any of them was a truthiness test on avatarUrl.

const avatarSchema = Joi.object({
  // scheme allowlist rejects javascript: and data:, which matters because the
  // value is rendered straight into an <img src> by the frontend.
  avatarUrl: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .max(2048)
    .required(),
});

const profileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  // lowercase() normalises on the way in, so Alice@x.com and alice@x.com
  // cannot become two accounts.
  email: Joi.string().email().lowercase().max(254),
})
  .min(1)
  .messages({ "object.min": "Nothing to update" });

const passwordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  // Signup already required 8 to 128. Without the same rule here an account
  // could be downgraded to a one-character password after the fact.
  newPassword: Joi.string().min(8).max(128).required(),
});

/**
 * Update avatar (frontend supplies a hosted URL)
 */
router.put("/avatar", requireAuth, async (req, res) => {
  try {
    // Do not log req.headers here or anywhere else. It carries the
    // Authorization bearer token, and the winston transport writes to
    // rotating files kept for 14 days.
    const { error, value } = avatarSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const updated = await updateAvatar(req.user.id, value.avatarUrl);
    res.json(updated);
  } catch (err) {
    console.error("Avatar update error:", err.message);
    res.status(500).json({ error: "Failed to update avatar" });
  }
});

/**
 * Update name and/or email
 */
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const { error, value } = profileSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message });

    const updated = await updateUserProfile(req.user.id, value);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Change password
 */
router.put("/password", requireAuth, async (req, res) => {
  try {
    const { error, value } = passwordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const ok = await updatePassword(req.user.id, value.oldPassword, value.newPassword);
    if (!ok) return res.status(400).json({ error: "Incorrect old password" });

    res.json({ success: true });
  } catch (err) {
    console.error("Password update error:", err.message);
    res.status(500).json({ error: "Failed to update password" });
  }
});

export default router;
