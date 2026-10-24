(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const video = $("video"), embed = $("embed"), loading = $("loading"), errorBox = $("error");
  const sourceSelect = $("sourceSelect");
  let hls = null, sources = [], activeIndex = -1, attemptToken = 0;
  const safeUrl = (raw) => {
    try { const u = new URL(String(raw || ""), location.href); return /^(https?:)$/.test(u.protocol) ? u.href : ""; }
    catch { return ""; }
  };
  function normaliseSource(item, index) {
    if (typeof item === "string") item = { url: item };
    if (!item || typeof item !== "object") return null;
    const url = safeUrl(item.videoUrl || item.url || item.src || item.href || item.externalUrl);
    if (!url) return null;
    const type = String(item.type || item.format || "").toLowerCase();
    return { url, type, label: String(item.label || item.name || item.provider || ("Источник " + (index + 1))), kind: String(item.kind || item.mode || "").toLowerCase() };
  }
  function getSources() {
    const all = [];
    const direct = params.get("src") || params.get("url") || params.get("videoUrl") || params.get("file");
    if (direct) all.push({ url: direct, label: params.get("provider") || "Основной источник", type: params.get("type") || "" });
    for (const key of ["sources", "fallbacks", "alternatives"]) {
      const raw = params.get(key);
      if (!raw) continue;
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) all.push(...parsed); } catch (e) { console.warn("[ANIMORA Player 2] Invalid " + key + " parameter"); }
    }
    return dedupeSources(all);
  }
  function dedupeSources(items) {
    const seen = new Set();
    return items.map(normaliseSource).filter(Boolean).filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
  }
  function collectApiSources(payload, providerName) {
    if (!payload || typeof payload !== "object") return [];
    const rows = Array.isArray(payload.sources) ? payload.sources : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.results) ? payload.results : [];
    return rows.map((item, index) => {
      if (typeof item === "string") return { url: item, provider: providerName, label: providerName + " · " + (index + 1) };
      const copy = { ...item };
      copy.url = copy.videoUrl || copy.url || copy.src || copy.href || copy.externalUrl || copy.iframeUrl || copy.embedUrl;
      copy.type = copy.type || copy.format || (copy.provider === "HLS" ? "hls" : "");
      copy.kind = copy.kind || copy.mode || (copy.iframeUrl || copy.embedUrl ? "iframe" : "");
      copy.label = copy.label || copy.name || copy.provider || (providerName + " · " + (index + 1));
      return copy;
    }).filter(Boolean);
  }
  function getEpisodeIdentity() {
    const slug = params.get("slug") || params.get("anime") || params.get("animeId") || params.get("id");
    const episode = params.get("episode") || params.get("ep") || params.get("episodeNumber");
    return slug && episode ? { slug, episode } : null;
  }
  async function loadSourcesFromExistingApis() {
    const identity = getEpisodeIdentity();
    if (!identity) return [];
    const requested = (params.get("api") || params.get("sourceApi") || "").toLowerCase();
    const providers = requested ? [requested] : ["animeav1", "tioanime"];
    const collected = [];
    for (const provider of providers) {
      if (!/^[a-z0-9-]+$/.test(provider)) continue;
      const endpoint = new URL("/api/" + provider + "/sources", location.origin);
      endpoint.searchParams.set("slug", identity.slug);
      endpoint.searchParams.set("episode", identity.episode);
      if (params.get("variant")) endpoint.searchParams.set("variant", params.get("variant"));
      try {
        const response = await fetch(endpoint.href, { headers: { Accept: "application/json" }, credentials: "same-origin" });
        if (!response.ok) { console.warn("[ANIMORA Player 2] Provider unavailable:", provider, response.status); continue; }
        const payload = await response.json();
        collected.push(...collectApiSources(payload, provider));
        if (payload && payload.ok && collected.length && requested) break;
      } catch (error) { console.warn("[ANIMORA Player 2] Source API request failed:", provider, error); }
    }
    return dedupeSources(collected);
  }
  function setLoading(message) { loading.hidden = false; errorBox.hidden = true; $("loadingText").textContent = message || "Проверяем доступность видео"; }
  function clearMedia() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    video.pause(); video.removeAttribute("src"); video.load(); embed.removeAttribute("src");
    video.hidden = false; embed.hidden = true;
  }
  function showError(message) { loading.hidden = true; errorBox.hidden = false; $("errorText").textContent = message; }
  function isHls(s) { return /\.m3u8(?:$|[?#])/i.test(s.url) || /hls|mpegurl|m3u8/.test(s.type); }
  function isEmbed(s) { return /iframe|embed/.test(s.kind) || /\/embed\/|\/player\/|\.html(?:$|[?#])/i.test(s.url); }
  async function playAt(index, token) {
    if (token !== attemptToken) return;
    if (index >= sources.length) { showError("Все переданные источники не удалось запустить. Это может быть ограничение источника, CORS или недоступность видеосегментов."); return; }
    activeIndex = index; sourceSelect.value = String(index);
    const s = sources[index]; clearMedia(); setLoading("Источник: " + s.label);
    if (isEmbed(s)) {
      video.hidden = true; embed.hidden = false;
      embed.onload = () => { if (token === attemptToken) loading.hidden = true; };
      embed.onerror = () => { if (token === attemptToken) playAt(index + 1, token); };
      embed.src = s.url;
      window.setTimeout(() => { if (token === attemptToken && !loading.hidden) { loading.hidden = true; } }, 10000);
      return;
    }
    if (isHls(s) && window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, manifestLoadingTimeOut: 15000, fragLoadingTimeOut: 20000 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (token !== attemptToken) return; loading.hidden = true; video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (token !== attemptToken || !data || !data.fatal) return;
        console.warn("[ANIMORA Player 2] HLS fatal error", data.type, data.details);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hls) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hls) hls.recoverMediaError();
        else playAt(index + 1, token);
      });
      hls.loadSource(s.url); hls.attachMedia(video); return;
    }
    if (isHls(s) && !video.canPlayType("application/vnd.apple.mpegurl")) { playAt(index + 1, token); return; }
    video.src = s.url;
    const onReady = () => { cleanup(); if (token !== attemptToken) return; loading.hidden = true; video.play().catch(() => {}); };
    const onFailure = () => { cleanup(); if (token === attemptToken) playAt(index + 1, token); };
    const cleanup = () => { video.removeEventListener("canplay", onReady); video.removeEventListener("error", onFailure); };
    video.addEventListener("canplay", onReady, { once: true }); video.addEventListener("error", onFailure, { once: true }); video.load();
  }
  function start(index) { attemptToken++; playAt(Math.max(0, index), attemptToken); }
  $("title").textContent = params.get("title") || params.get("name") || "Просмотр аниме";
  $("episode").textContent = params.get("episode") ? "Серия " + params.get("episode") : "";
  $("back").addEventListener("click", () => { if (history.length > 1) history.back(); else location.href = "/"; });
  $("retry").addEventListener("click", () => start(Math.max(0, activeIndex)));
  sourceSelect.addEventListener("change", () => start(Number(sourceSelect.value)));
  video.addEventListener("waiting", () => { if (!video.hidden) setLoading("Буферизация видео…"); });
  video.addEventListener("playing", () => { loading.hidden = true; errorBox.hidden = true; });
  video.addEventListener("error", () => { if (activeIndex >= 0 && !video.hidden) start(activeIndex + 1); });
  async function initialise() {
    sources = getSources();
    if (!sources.length) {
      setLoading("Запрашиваем источники серии у ANIMORA…");
      sources = await loadSourcesFromExistingApis();
    }
    sourceSelect.replaceChildren();
    sources.forEach((s, i) => { const option = document.createElement("option"); option.value = String(i); option.textContent = s.label; sourceSelect.appendChild(option); });
    sourceSelect.disabled = sources.length < 2;
    if (!sources.length) {
      showError("Не удалось получить источники. Проверьте параметры адреса: slug и episode. Также API источников может быть недоступно для этой серии.");
      return;
    }
    start(0);
  }
  initialise().catch(error => { console.error("[ANIMORA Player 2] Initialisation failed", error); showError("Ошибка загрузки источников серии."); });
})();
