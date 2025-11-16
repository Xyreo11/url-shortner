import { URL } from "url";

// -------------------------------
// Validate URL structure
// -------------------------------
export function isValidUrl(str) {
  try {
    const url = new URL(str);

    // Only allow http and https
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

// -------------------------------
// Normalize URL
// -------------------------------
export function normalizeUrl(str) {
  if (!str) throw new Error("URL is empty");

  // Add protocol if missing
  if (!str.startsWith("http://") && !str.startsWith("https://")) {
    str = "https://" + str;
  }

  let url;

  try {
    url = new URL(str);
  } catch (err) {
    throw new Error("Invalid URL");
  }

  // Only domain should be lowercased, not the path
  url.hostname = url.hostname.toLowerCase();

  // Remove URL fragment (#something)
  url.hash = "";

  // Remove trailing slash (optional)
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Remove junk query params if you want (optional)
  // Example: utm parameters (marketing tags)
  // for (const p of url.searchParams.keys()) {
  //   if (p.startsWith("utm_")) url.searchParams.delete(p);
  // }

  return url.toString();
}
