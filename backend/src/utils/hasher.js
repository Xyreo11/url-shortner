import crypto from "crypto";

export function generateShortCode(url) {
  return crypto
    .createHash("sha256")
    .update(url + Date.now())
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 8);
}
