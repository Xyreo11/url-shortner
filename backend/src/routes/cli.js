import { shortenUrl } from "../services/url.service.js";
import { generateQRCode } from "../utils/qrcode.js";
import { config } from "../config/env.js";

export async function cliInput(url, alias = null) {
  try {
    // shorten URL
    const short = await shortenUrl(url, alias);

    const finalUrl = `${config.BASE_URL}/${short}`;
    console.log("Short URL:", finalUrl);

    // Generate QR code
    const qr = await generateQRCode(finalUrl);
    console.log("\nQR Code (Base64):");
    console.log(qr);

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}
