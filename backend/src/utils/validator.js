// src/utils/validator.js

// Normalize input (your existing function)
export function normalizeUrl(url) {
  url = url.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

// Validate URL format
export function isValidUrl(url) {
  try {
    const u = new URL(url);

    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (!u.hostname || !u.hostname.includes(".")) return false;
    if (u.hostname.length < 3) return false;

    return true;
  } catch {
    return false;
  }
}

// Validate alias format
export function isValidAlias(alias) {
  if (!alias) return true;

  // Only alphanumeric, dash, underscore, 3–50 chars
  const regex = /^[A-Za-z0-9\-_]{3,50}$/;

  return regex.test(alias);
}
