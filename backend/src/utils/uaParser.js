// src/utils/uaParser.js

export function parseUA(ua = "") {
  ua = ua.toLowerCase();

  // -------------------------
  // DEVICE TYPE
  // -------------------------
  let device = "desktop";

  if (/mobile|iphone|android/.test(ua)) device = "mobile";
  if (/ipad|tablet/.test(ua)) device = "tablet";

  // -------------------------
  // BROWSER
  // -------------------------
  let browser = "unknown";

  if (ua.includes("chrome") && !ua.includes("edge") && !ua.includes("opr")) browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("edge")) browser = "Edge";
  else if (ua.includes("opr") || ua.includes("opera")) browser = "Opera";

  // -------------------------
  // OS
  // -------------------------
  let os = "unknown";

  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os")) os = "macOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) os = "iOS";
  else if (ua.includes("linux")) os = "Linux";

  return { device, browser, os };
}
