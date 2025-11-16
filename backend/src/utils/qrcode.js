import QRCode from "qrcode";

export async function generateQRCode(url) {
  return await QRCode.toDataURL(url);
}
