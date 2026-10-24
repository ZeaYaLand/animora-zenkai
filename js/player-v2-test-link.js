(function () {
  "use strict";
  // Temporary opt-in entry point for testing Player 2. The production player is
  // untouched; this button only opens the isolated v2 page in a separate route.
  const BUTTON_ID = "animora-player-v2-test";
  function parseEpisode(raw) {
    const value = decodeURIComponent(String(raw || ""));
    const match = value.match(/^s\d+(?:-part-?\d+)?-e(\d+(?:\.\d+)?)$/i)
      || value.match(/^(?:episode-|ep-|e)?(\d+(?:\.\d+)?)$/i);
    return match ? match[1] : "1";
  }
  function render() {
    const path = location.pathname;
    let match = path.match(/^\/anime\/([^/]+)\/episode\/([^/]+)\/?$/)
      || path.match(/^\/watch\/([^/]+)\/([^/]+)\/?$/);
    let button = document.getElementById(BUTTON_ID);
    if (!match) {
      if (button) button.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "Тест нового плеера";
      button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9998;padding:12px 16px;border:1px solid #8a55ff;border-radius:999px;background:#17122b;color:#fff;font:600 14px/1.2 system-ui;box-shadow:0 8px 28px #0008;cursor:pointer";
      button.addEventListener("click", function () {
        const current = location.pathname.match(/^\/anime\/([^/]+)\/episode\/([^/]+)\/?$/)
          || location.pathname.match(/^\/watch\/([^/]+)\/([^/]+)\/?$/);
        if (!current) return;
        const slug = decodeURIComponent(current[1]);
        const episode = parseEpisode(current[2]);
        const target = new URL("/player/v2.html", location.origin);
        target.searchParams.set("slug", slug);
        target.searchParams.set("episode", episode);
        target.searchParams.set("title", slug.replace(/[-_]+/g, " "));
        target.searchParams.set("test", "1");
        window.open(target.href, "_blank", "noopener");
      });
      document.body.appendChild(button);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
  window.addEventListener("popstate", render);
  window.addEventListener("zenkaitv:route", render);
})();
