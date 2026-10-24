"use strict";

const API_BASE = "https://api.anilibria.tv/v3";
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.end(JSON.stringify(body));
}
module.exports = async function anilibriaProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    return res.end();
  }
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "Method not allowed" });
  const raw = req.query?.path;
  const parts = (Array.isArray(raw) ? raw : String(raw || "").split("/")).map(v => String(v || "").trim()).filter(Boolean);
  const path = parts.join("/");
  const allowed = path === "title/search" || path === "title";
  if (!allowed) return send(res, 400, { ok: false, error: "Unsupported AniLibria endpoint" });
  const params = new URLSearchParams();
  if (path === "title/search") {
    const search = String(req.query?.search || "").trim().slice(0, 120);
    if (!search) return send(res, 400, { ok: false, error: "Missing search" });
    params.set("search", search);
    params.set("limit", String(Math.min(20, Math.max(1, Number(req.query?.limit) || 15))));
    params.set("filter", "id,code,names,team,player");
  } else {
    const code = String(req.query?.code || "").trim().slice(0, 180);
    const id = String(req.query?.id || "").trim().slice(0, 20);
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(code) && !/^\d{1,12}$/.test(id)) return send(res, 400, { ok: false, error: "Missing valid code or id" });
    if (code) params.set("code", code); else params.set("id", id);
    params.set("filter", "id,code,names,team,player");
  }
  const target = API_BASE + "/" + path + "?" + params.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(target, { headers: { Accept: "application/json", "User-Agent": "ANIMORA/1.0 Russian playback adapter" }, signal: controller.signal });
    const body = await upstream.text();
    if (!upstream.ok) return send(res, 502, { ok: false, error: "AniLibria API returned HTTP " + upstream.status });
    let json;
    try { json = JSON.parse(body); } catch (_) { return send(res, 502, { ok: false, error: "AniLibria API returned invalid JSON" }); }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.end(JSON.stringify(json));
  } catch (error) {
    return send(res, 502, { ok: false, error: error && error.name === "AbortError" ? "AniLibria API timeout" : "AniLibria API unavailable" });
  } finally { clearTimeout(timeout); }
};
