(function () {
  "use strict";

  // Connect both explicit /watch URLs and the catalog's internal "play episode"
  // route intent to the replacement player. Never pass numeric AniList/MAL IDs
  // to provider APIs: they are not provider slugs.
  function handleRoute(event) {
    const route = event && event.detail;
    if (!route || !route.target) return;

    const isWatchRoute = route.name === "watch" && route.target.watchRoute;
    const isCatalogPlayIntent = route.target.playIntent === true;
    if (!isWatchRoute && !isCatalogPlayIntent) return;

    const params = route.params || {};
    const slug = String(params.slug || params.animeSlug || params.animeId || "").trim();
    if (!slug || /^\d+$/.test(slug)) {
      console.warn("[ANIMORA player bridge] Cannot route episode: a provider-compatible anime slug is missing.");
      return;
    }

    const targetEpisode = route.target.episodeNumber;
    const rawEpisode = isWatchRoute
      ? String(params.episode || "").trim()
      : String(targetEpisode ?? params.episode ?? params.episodeNumber ?? "").trim();
    const episodeMatch = rawEpisode.match(/(?:episode-?)?(\d+(?:\.\d+)?)/i);
    const episode = episodeMatch ? episodeMatch[1] : "";
    if (!episode || Number(episode) < 1) return;

    const target = new URL("/player/v2.html", window.location.origin);
    target.searchParams.set("slug", slug);
    target.searchParams.set("episode", episode);
    if (route.title && route.title !== "Watch Episode - ANIMORA") {
      target.searchParams.set("title", route.title);
    }
    target.searchParams.set("returnTo", route.path || ("/anime/" + encodeURIComponent(slug)));
    window.location.replace(target.href);
  }

  window.addEventListener("zenkaitv:route", handleRoute);
})();