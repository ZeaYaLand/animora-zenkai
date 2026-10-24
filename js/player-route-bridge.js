(function () {
  "use strict";

  // Route the catalog's explicit /watch/:slug/:episode intent into ANIMORA's
  // replacement player. Do not intercept numeric database IDs: provider APIs
  // need a provider-compatible slug, not an AniList/MAL identifier.
  function handleRoute(event) {
    const route = event && event.detail;
    if (!route || route.name !== "watch" || !route.target || !route.target.watchRoute) return;

    const params = route.params || {};
    const slug = String(params.animeId || "").trim();
    const episodeRaw = String(params.episode || "").trim();
    if (!slug || /^\d+$/.test(slug) || !episodeRaw) return;

    const episodeMatch = episodeRaw.match(/(?:episode-?)?(\d+)/i);
    const episode = episodeMatch ? episodeMatch[1] : "";
    if (!episode || Number(episode) < 1) return;

    const target = new URL("/player/v2.html", window.location.origin);
    target.searchParams.set("slug", slug);
    target.searchParams.set("episode", episode);
    target.searchParams.set("returnTo", route.path || ("/anime/" + encodeURIComponent(slug)));
    window.location.replace(target.href);
  }

  window.addEventListener("zenkaitv:route", handleRoute);
})();