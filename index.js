// url-shortner/index.js


const crypto = require('crypto');

//Normalisations

function normalizeUrl(inputUrl) {
  let url = inputUrl.trim();

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    const parsed = new URL(url);

    // Lowercase host
    let hostname = parsed.hostname.toLowerCase();

    // Strip "www."
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    // Remove default ports
    let port = parsed.port;
    if ((parsed.protocol === "http:" && port === "80") ||
        (parsed.protocol === "https:" && port === "443")) {
      port = "";
    }

    // Clean pathname
    let pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    // Sort query parameters
    let params = new URLSearchParams(parsed.search);
    let sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    let search = sorted.length
      ? "?" + sorted.map(([k, v]) => `${k}=${v}`).join("&")
      : "";

    // Drop fragment
    return `${parsed.protocol}//${hostname}${port ? ":" + port : ""}${pathname}${search}`;
  } catch (err) {
    throw new Error("Invalid URL: " + inputUrl);
  }
}

// Short code Generator


function generateShortCode(length = 7) {
  const base62Chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let shortCode = "";

  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % 62; // remainder to map to base 62
    shortCode += base62Chars[index];
  }

  return shortCode;
}


//---------


// TEMPORARY CONSOLE INPUT

const inputUrl = process.argv[2]; 
console.log("You entered:", inputUrl);
const normalizedUrl = normalizeUrl(inputUrl);
console.log(normalizedUrl);

const shortCode = generateShortCode();
console.log("Shortened URL: https://nik.hil/" + shortCode);

