// SmartSourceIntegrator — analyzes a pasted link and decides how to add it as a
// source: direct video, single episode, an anime series, a full-site crawl, an
// API/JSON catalog, or an addon manifest. Detection is pure & testable; the
// actual "do the work" strategies are injected so this file has no app/DOM deps.

function ssNormalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return "";
  // Strip wrapping quotes/spaces, collapse whitespace.
  raw = raw.replace(/^["'\s]+|["'\s]+$/g, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    // bare domain or path → assume https
    if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(raw)) raw = `https://${raw}`;
  }
  try {
    const u = new URL(raw);
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function ssDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ""); }
  catch { return ""; }
}

function ssDomainName(url) {
  const host = ssDomain(url);
  if (!host) return "Source";
  const base = host.split(".").slice(-2, -1)[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const SS_VIDEO_RE = [
  /\.(mp4|mkv|webm|avi|mov|m4v|ogv)(\?|#|$)/i,
  /\.(m3u8|mpd)(\?|#|$)/i,
  /\/stream\//i,
  /\/get\?file=/i,
  /\/master\.m3u8/i
];
const SS_UNSUPPORTED_HOSTS = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|netflix\.com|crunchyroll\.com|spotify\.com|facebook\.com|instagram\.com|tiktok\.com)/i;
const SS_ADDON_RE = [/github\.com/i, /githubusercontent\.com/i, /manifest\.json(\?|#|$)/i, /stremio/i, /\/addon(\.json|\/)/i];
const SS_API_RE = [/\/api\//i, /\.json(\?|#|$)/i, /\/catalog(\?|\/|$)/i, /\/graphql\b/i, /\/v\d+\/(anime|catalog|search)/i];
const SS_EPISODE_RE = [
  /\/episodio[-/]/i, /\/episode[-/]/i, /\/ver[-/]/i, /\/watch[-/]/i,
  /-episodio-\d+/i, /-episode-\d+/i, /[-/]ep[-_]?\d+/i, /\/e\d+\b/i, /第\d+[集话話]/
];
const SS_SERIES_RE = [/\/anime\//i, /\/serie[s]?\//i, /\/title\//i, /\/show\//i, /\/media\//i, /\/tv\//i];

const SmartSource = {
  normalizeUrl: ssNormalizeUrl,
  domainOf: ssDomain,
  domainName: ssDomainName,

  isUnsupported(url) { return SS_UNSUPPORTED_HOSTS.test(url); },
  isDirectVideoUrl(url) { return SS_VIDEO_RE.some((re) => re.test(url)); },
  isAddonManifest(url) { return SS_ADDON_RE.some((re) => re.test(url)); },
  isJsonApi(url) { return SS_API_RE.some((re) => re.test(url)); },
  isEpisodePage(url) { return SS_EPISODE_RE.some((re) => re.test(url)); },
  isAnimeSeriesPage(url) { return SS_SERIES_RE.some((re) => re.test(url)); },
  isDomainOnly(url) {
    try {
      const u = new URL(url);
      const p = u.pathname.replace(/\/+$/, "");
      const noPath = p === "" || p === "/" || /^\/(index\.\w+|home)?$/i.test(u.pathname);
      return noPath && !u.search;
    } catch { return false; }
  },

  // Decide the strategy. Order matters — most specific first.
  analyzeInput(input) {
    const url = ssNormalizeUrl(input);
    if (!url) return { type: "unknown", url: String(input || ""), suggestion: "Enter a valid http(s) link." };
    if (this.isUnsupported(url)) {
      return { type: "unsupported", url, suggestion: `${ssDomain(url)} is a streaming platform ANIMORA can't crawl.` };
    }
    if (this.isDirectVideoUrl(url)) return { type: "direct_playable_url", url };
    if (this.isAddonManifest(url)) return { type: "addon_repo", url };
    if (this.isJsonApi(url)) return { type: "api_endpoint", url };
    if (this.isEpisodePage(url)) return { type: "anime_episode_page", url };
    if (this.isAnimeSeriesPage(url)) return { type: "anime_series_page", url };
    if (this.isDomainOnly(url)) return { type: "full_website_domain", url };
    // Valid URL with a path but no clear markers (e.g. site.com/one-piece) →
    // best guess is a single anime/title page to crawl.
    return { type: "anime_series_page", url };
  },

  // Human-readable preview for the modal ("what will happen").
  describePlan(analysis) {
    const host = ssDomain(analysis.url) || analysis.url;
    switch (analysis.type) {
      case "direct_playable_url":
        return { icon: "🎥", title: "Direct video", detail: "Adds this file as a single playable source." };
      case "anime_episode_page":
        return { icon: "🎬", title: "Single episode", detail: `Adds just this episode from ${host}.` };
      case "anime_series_page":
        return { icon: "📺", title: "Anime series", detail: `Crawls every episode of this title on ${host}.` };
      case "full_website_domain":
        return { icon: "🌐", title: "Full website", detail: `Crawls all anime and episodes on ${host}. This can take 1–2 minutes.` };
      case "api_endpoint":
        return { icon: "🔌", title: "API / JSON catalog", detail: "Uses this endpoint directly as a catalog source." };
      case "addon_repo":
        return { icon: "🧩", title: "Addon manifest", detail: "Installs this addon and merges its catalog." };
      case "unsupported":
        return { icon: "🚫", title: "Not supported", detail: analysis.suggestion };
      default:
        return { icon: "❓", title: "Unrecognized link", detail: analysis.suggestion || "Try a different URL." };
    }
  }
};

// SmartSourceIntegrator routes an analysis to injected strategy functions.
class SmartSourceIntegrator {
  constructor(deps = {}) { this.deps = deps; this.engine = SmartSource; }

  analyzeInput(input) { return this.engine.analyzeInput(input); }
  describePlan(analysis) { return this.engine.describePlan(analysis); }

  async addSmartSource(input, opts = {}) {
    const analysis = this.analyzeInput(input);
    const d = this.deps;
    switch (analysis.type) {
      case "direct_playable_url": return d.addDirectVideo?.(analysis, opts);
      case "anime_episode_page":  return d.crawl?.("episode", analysis, opts);
      case "anime_series_page":   return d.crawl?.("anime", analysis, opts);
      case "full_website_domain": return d.crawl?.("site", analysis, opts);
      case "api_endpoint":        return d.addApi?.(analysis, opts);
      case "addon_repo":          return d.addAddon?.(analysis, opts);
      case "unsupported":
      default:
        throw new Error(analysis.suggestion || "Unsupported link.");
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SmartSource, SmartSourceIntegrator };
}
