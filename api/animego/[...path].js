"use strict";

const BASE = "https://animego.org";
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=90, stale-while-revalidate=180");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.end(JSON.stringify(body));
}
function decode(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}
async function get(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ANIMORA/1.0)", Accept: "text/html,application/json,*/*", ...headers }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}
module.exports = async function animeGoProxy(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; res.setHeader("Access-Control-Allow-Origin", "*"); return res.end(); }
  if (req.method !== "GET") return reply(res, 405, { ok:false, error:"Method not allowed" });
  const raw = req.query?.path;
  const parts = (Array.isArray(raw) ? raw : String(raw || "").split("/")).map(v => String(v || "").trim()).filter(Boolean);
  const mode = parts.join("/");
  try {
    if (mode === "search") {
      const q = String(req.query?.query || "").trim().slice(0, 100);
      if (q.length < 2) return reply(res, 400, { ok:false, error:"Search query is too short" });
      const r = await get(BASE + "/search/anime?q=" + encodeURIComponent(q));
      if (!r.ok) return reply(res, 502, { ok:false, error:"AnimeGO search HTTP " + r.status });
      const html = await r.text(), results = [], seen = new Set();
      const chunks = html.split(/class="[^"]*\bani-grid__item\b[^"]*"/i).slice(1);
      for (const chunk of chunks) {
        const link = chunk.match(/href="(\/anime\/([a-z0-9-]+)-(\d+))"/i);
        const title = chunk.match(/\btitle="([^"]+)"/i) || chunk.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
        if (!link || !title || seen.has(link[3])) continue;
        seen.add(link[3]);
        results.push({ id:link[3], slug:link[2], title:decode(title[1]), url:BASE+link[1] });
        if (results.length >= 15) break;
      }
      return reply(res, 200, { ok:true, source:"AnimeGO", results });
    }
    if (mode === "players") {
      const id = String(req.query?.id || "").trim(), episode = Number(req.query?.episode || 1);
      if (!/^\d{1,12}$/.test(id) || !Number.isInteger(episode) || episode < 1 || episode > 9999) return reply(res, 400, {ok:false,error:"Invalid anime ID or episode"});
      let playerUrl = BASE + "/player/" + id;
      if (episode > 1) {
        const er = await get(playerUrl, { "X-Requested-With":"XMLHttpRequest", Referer:BASE+"/" });
        if (!er.ok) return reply(res, 502, {ok:false,error:"AnimeGO episode list HTTP "+er.status});
        let epPayload; try { epPayload = await er.json(); } catch (_) { return reply(res,502,{ok:false,error:"AnimeGO returned invalid episode JSON"}); }
        const content = decode(epPayload?.data?.content || "");
        let episodeId = "";
        for (const m of content.matchAll(/data-episode="(\d+)"[^>]*data-episode-number="(\d+)"/gi)) if(Number(m[2])===episode) { episodeId=m[1]; break; }
        if (!episodeId) for (const m of content.matchAll(/data-episode-number="(\d+)"[^>]*data-episode="(\d+)"/gi)) if(Number(m[1])===episode) { episodeId=m[2]; break; }
        if (!episodeId) return reply(res,200,{ok:true,source:"AnimeGO",players:[]});
        playerUrl = BASE + "/player/videos/" + episodeId;
      }
      const r = await get(playerUrl, { "X-Requested-With":"XMLHttpRequest", Referer:BASE+"/" });
      if (!r.ok) return reply(res,502,{ok:false,error:"AnimeGO player HTTP "+r.status});
      let payload; try { payload=await r.json(); } catch (_) { return reply(res,502,{ok:false,error:"AnimeGO returned invalid player JSON"}); }
      const content = decode(payload?.data?.content || "");
      const players = [], seen = new Set();
      for (const m of content.matchAll(/<button\b[^>]*>/gi)) {
        const a = attrs(m[0]), embed = a["data-player"], label = a["data-translation-title"], provider = a["data-provider-title"] || "";
        if (!embed || !label) continue;
        let u = embed.startsWith("//") ? "https:"+embed : embed;
        try { const parsed = new URL(u, BASE); if(!/^https?:$/.test(parsed.protocol)) continue; u=parsed.href; } catch (_) { continue; }
        // Expose only recognized Russian-segment player providers; no arbitrary external providers.
        if (!/aniboom|\bcvh\b|kodik|sibnet/i.test(provider+" "+u)) continue;
        const key = u + "|" + label;
        if (seen.has(key)) continue; seen.add(key);
        players.push({ url:u, kind:"iframe", provider, label:decode(label).replace(/\s*\(ошибка\)\s*/ig,"").trim(), language:"ru" });
      }
      return reply(res,200,{ok:true,source:"AnimeGO",players});
    }
    return reply(res,400,{ok:false,error:"Unsupported AnimeGO endpoint"});
  } catch (e) {
    return reply(res,502,{ok:false,error:e?.name==="AbortError"?"AnimeGO request timeout":"AnimeGO unavailable"});
  }
};
