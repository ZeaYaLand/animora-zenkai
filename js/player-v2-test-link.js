(function () {
  "use strict";
  // Isolated test entry point. The legacy player remains untouched.
  const BUTTON_ID = "animora-player-v2-test";
  const STYLE = "position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:2147483646;padding:12px 16px;border:1px solid #8a55ff;border-radius:999px;background:#17122b;color:#fff;font:600 14px/1.2 system-ui;box-shadow:0 8px 28px #0008;cursor:pointer;display:block;visibility:visible;opacity:1;pointer-events:auto";
  function decode(value) { try { return decodeURIComponent(value || ""); } catch { return value || ""; } }
  function parseEpisode(raw) {
    const value = decode(raw);
    const match = value.match(/^s\d+(?:-part-?\d+)?-e(\d+(?:\.\d+)?)$/i)
      || value.match(/^(?:episode-|ep-|e)?(\d+(?:\.\d+)?)$/i);
    return match ? match[1] : "1";
  }
  function getRoute() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    let match = path.match(/^\/(?:anime|watch)\/([^/]+)\/episode\/([^/]+)$/i);
    if (match) return { id: decode(match[1]), episode: parseEpisode(match[2]) };
    match = path.match(/^\/watch\/([^/]+)\/([^/]+)$/i);
    if (match) return { id: decode(match[1]), episode: parseEpisode(match[2]) };
    // The app can keep playback on the anime details route rather than a
    // dedicated episode URL. Offer a safe test entry point there as well.
    match = path.match(/^\/anime\/([^/]+)$/i);
    if (match) {
      const q = new URLSearchParams(location.search);
      return { id: decode(match[1]), episode: parseEpisode(q.get("episode") || q.get("ep") || "1") };
    }
    return null;
  }
  function render() {
    if (!document.body) return;
    const route = getRoute();
    let button = document.getElementById(BUTTON_ID);
    if (!route) { if (button) button.remove(); return; }
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "Смотреть в плеере ANIMORA";
      button.setAttribute("aria-label", "Открыть тест нового плеера ANIMORA");
      button.style.cssText = STYLE;
      button.addEventListener("click", function () {
        const current = getRoute();
        if (!current) return;
        const target = new URL("/player/v2.html", location.origin);
        target.searchParams.set("slug", current.id);
        target.searchParams.set("episode", current.episode);
        target.searchParams.set("title", current.id.replace(/[-_]+/g, " "));
        target.searchParams.set("test", "1");
        // Navigate in the same tab: mobile browsers may block window.open() from injected SPA buttons.
        location.assign(target.href);
      });
      document.body.appendChild(button);
    } else {
      button.style.cssText = STYLE;
    }
  }
  function scheduleRender() { window.requestAnimationFrame(render); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
  else scheduleRender();
  window.addEventListener("popstate", scheduleRender);
  window.addEventListener("hashchange", scheduleRender);
  window.addEventListener("zenkaitv:route", scheduleRender);
  // Catch SPA navigation even if it uses a different custom route event.
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      scheduleRender();
      return result;
    };
  }
  if (document.documentElement && window.MutationObserver) {
    new MutationObserver(() => {
      if (getRoute() && !document.getElementById(BUTTON_ID)) scheduleRender();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();