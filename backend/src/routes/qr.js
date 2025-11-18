import express from "express";
import { generateQRCode } from "../utils/qrcode.js";

const router = express.Router();

// GET /qr/:code → return QR as Base64 PNG
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;

    // Build the full short URL
    const url = `${process.env.BASE_URL}/${code}`;

    const qr = await generateQRCode(url);

    return res.json({ qr });
  } catch (err) {
    console.error("QR Error:", err);
    return res.status(500).json({ error: "QR generation failed" });
  }
});

export default router;
