// src/utils/api.js
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, opts = {}, token) {
  const headers = opts.headers || {};
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  // if (!opts.body && !(opts.body instanceof FormData)) {
  //   headers["Content-Type"] = "application/json";
  // }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  console.log("Request body before fetch:", opts.body);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (res.status >= 400) {
    const body = await res.json().catch(()=>null);
    const msg = body?.error || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default {
  get: (path, token) => request(path, { method: "GET" }, token),
  post: (path, body, token) => request(path, { method: "POST", body }, token),
  put: (path, body, token) => request(path, { method: "PUT", body }, token),
  delete: (path, token) => request(path, { method: "DELETE" }, token),
  postForm: (path, formData, token) => request(path, { method: "POST", body: formData }, token),
};

