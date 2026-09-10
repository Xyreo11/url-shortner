// src/utils/uaParser.js
//
// The single user-agent parser. There used to be two: this one, which was
// exported and never imported, and a near-identical copy inlined in
// routes/http.js which was the one actually running. They disagreed, and both
// were wrong in the same place.

/**
 * Best-effort user agent classification for analytics.
 *
 * Deliberately a heuristic. User agent strings are self-reported and actively
 * misleading by design, so this aims to be right about common browsers rather
 * than exhaustive.
 */
export function parseUA(uaString = "") {
  const ua = String(uaString).toLowerCase();

  // iOS must be tested before macOS. An iPhone user agent contains the
  // literal text "like Mac OS X", so any check for "mac" that runs first
  // reports every iPhone and iPad as a Mac. Both previous implementations
  // had this bug, so the OS breakdown undercounted iOS entirely.
  let os = "Unknown";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os") || ua.includes("macintosh")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";

  // Order matters here too. Edge and Opera both put "chrome" in their user
  // agent, and Chrome puts "safari" in its, so the most specific token has to
  // win. Modern Edge identifies as "Edg/", not "Edge", which the exported
  // parser got wrong; Opera identifies as "OPR/", which the inlined one did
  // not handle at all.
  let browser = "Unknown";
  if (ua.includes("edg")) browser = "Edge";
  else if (ua.includes("opr") || ua.includes("opera")) browser = "Opera";
  else if (ua.includes("firefox") || ua.includes("fxios")) browser = "Firefox";
  else if (ua.includes("chrome") || ua.includes("crios")) browser = "Chrome";
  else if (ua.includes("safari")) browser = "Safari";

  let device = "desktop";
  if (
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("ipod") ||
    ua.includes("android")
  ) {
    device = "mobile";
  }
  // Checked second so a tablet is not left classified as mobile.
  if (ua.includes("ipad") || ua.includes("tablet")) device = "tablet";

  return { os, browser, device };
}
