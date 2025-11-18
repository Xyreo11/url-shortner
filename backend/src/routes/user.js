import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { updateUserProfile, updatePassword, updateAvatar } from "../services/user.service.js";

const router = express.Router();

/**
 * Update Avatar (frontend provides Cloudinary URL)
 */
router.put("/avatar", requireAuth, async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    console.log("DEBUG avatar route - headers:", req.headers);
    console.log("DEBUG avatar route - body:", req.body);
    if (!avatarUrl) return res.status(400).json({ error: "No avatar URL provided" });

    const updated = await updateAvatar(req.user.id, avatarUrl);
    res.json(updated);
  } catch (err) {
    console.error("Avatar update error:", err);
    res.status(500).json({ error: "Failed to update avatar" });
  }
  
});

/**
 * Update name/email
 */
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const updated = await updateUserProfile(req.user.id, req.body);
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
    const { oldPassword, newPassword } = req.body;

    const ok = await updatePassword(req.user.id, oldPassword, newPassword);
    if (!ok) return res.status(400).json({ error: "Incorrect old password" });

    res.json({ success: true });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});




export default router;
