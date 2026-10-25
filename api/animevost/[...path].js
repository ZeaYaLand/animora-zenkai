"use strict";

const API_BASE = "https://api.animevost.org/v1";
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.end(JSON.stringify(body));
}
module.exports = async function animeVostProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    return res.end();
  }
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const raw = req.query?.path;
  const parts = (Array.isArray(raw) ? raw : String(raw || "").split("/")).map(v => String(v || "").trim()).filter(Boolean);
  const path = parts.join("/");
  if (path !== "search" && path !== "playlist") return sendJson(res, 400, { ok: false, error: "Unsupported AnimeVost endpoint" });
  const params = new URLSearchParams();
  if (path === "search") {
    const name = String(req.query?.query || "").trim().slice(0, 120);
    if (name.length < 3) return sendJson(res, 400, { ok: false, error: "Search query must contain at least 3 characters" });
    params.set("name", name);
  } else {
    const id = String(req.query?.id || "").trim();
    if (!/^\d{1,12}$/.test(id)) return sendJson(res, 400, { ok: false, error: "Missing valid AnimeVost title ID" });
    params.set("id", id);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const upstream = await fetch(API_BASE + "/" + path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "ANIMORA/1.0" },
      body: params.toString(),
      signal: controller.signal
    });
    const rawBody = await upstream.text();
    if (!upstream.ok) return sendJson(res, 502, { ok: false, error: "AnimeVost API returned HTTP " + upstream.status });
    let data;
    try { data = JSON.parse(rawBody); } catch (_) { return sendJson(res, 502, { ok: false, error: "AnimeVost API returned invalid JSON" }); }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.end(JSON.stringify(data));
  } catch (error) {
    return sendJson(res, 502, { ok: false, error: error && error.name === "AbortError" ? "AnimeVost API timeout" : "AnimeVost API unavailable" });
  } finally { clearTimeout(timeout); }
};
