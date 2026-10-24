"use strict";

const API_BASES = [
  "https://api.anilibria.app/api/v1",
  "https://anilibria.top/api/v1"
];

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.end(JSON.stringify(body));
}

module.exports = async function anilibertyProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    return res.end();
  }
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const raw = req.query?.path;
  const parts = (Array.isArray(raw) ? raw : String(raw || "").split("/"))
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const path = parts.join("/");
  const isSearch = path === "app/search/releases";
  const isLatest = path === "anime/releases/latest";
  const isRelease = parts.length === 3 && parts[0] === "anime" && parts[1] === "releases" &&
    /^[a-zA-Z0-9._-]{1,180}$/.test(parts[2]) && parts[2] !== "latest";

  if (!isSearch && !isLatest && !isRelease) {
    return sendJson(res, 400, { ok: false, error: "Unsupported AniLiberty endpoint" });
  }

  const upstreamQuery = new URLSearchParams();
  if (isSearch) {
    const query = String(req.query?.query || "").trim().slice(0, 120);
    if (!query) return sendJson(res, 400, { ok: false, error: "Missing query" });
    upstreamQuery.set("query", query);
    upstreamQuery.set("limit", String(Math.min(30, Math.max(1, Number(req.query?.limit) || 15))));
  } else if (isLatest) {
    upstreamQuery.set("limit", String(Math.min(30, Math.max(1, Number(req.query?.limit) || 10))));
  }

  let lastError = "AniLiberty is unavailable";
  for (const base of API_BASES) {
    const target = new URL(base + "/" + path);
    upstreamQuery.forEach((value, key) => target.searchParams.set(key, value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const upstream = await fetch(target.href, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "ANIMORA/1.0 (public anime metadata client)" },
        signal: controller.signal
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        lastError = "AniLiberty upstream returned HTTP " + upstream.status;
        continue;
      }
      let payload;
      try { payload = JSON.parse(text); }
      catch (_) { lastError = "AniLiberty returned invalid JSON"; continue; }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", isRelease ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=90, stale-while-revalidate=180");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.end(JSON.stringify(payload));
    } catch (error) {
      lastError = error?.name === "AbortError" ? "AniLiberty request timed out" : (error?.message || lastError);
    } finally {
      clearTimeout(timeout);
    }
  }
  return sendJson(res, 502, { ok: false, source: "AniLiberty", error: lastError });
};
