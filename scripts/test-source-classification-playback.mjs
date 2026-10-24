import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

// Match the application's same-origin /api/source relay predicate.
globalThis.isLocalSourceProxyUrl = (value = "") => {
  try {
    const parsed = new URL(String(value), "https://animora.test");
    return parsed.pathname === "/api/source";
  } catch {
    return false;
  }
};

const require = createRequire(import.meta.url);
const classification = require("../js/source-classification.js");

test("a direct blocked upstream media URL remains blocked", () => {
  assert.equal(classification.isBlockedPlaybackSource({
    id: "animeav1-hls",
    provider: "AnimeAV1",
    type: "direct",
    videoUrl: "https://player.zilla-networks.com/m3u8/0123456789abcdef0123456789abcdef"
  }), true);
});

test("a same-origin relayed HLS URL is not rejected because metadata remembers the upstream host", () => {
  assert.equal(classification.isBlockedPlaybackSource({
    id: "animeav1-hls",
    provider: "AnimeAV1",
    type: "direct",
    container: "hls",
    videoUrl: "https://animora.test/api/source?url=https%3A%2F%2Fplayer.zilla-networks.com%2Fm3u8%2F0123456789abcdef0123456789abcdef",
    externalUrl: "https://player.zilla-networks.com/m3u8/0123456789abcdef0123456789abcdef",
    siteUrl: "https://player.zilla-networks.com/",
    streamResolver: { type: "hls", endpoint: "https://player.zilla-networks.com/m3u8/0123456789abcdef0123456789abcdef" }
  }), false);
});

test("ordinary direct media remains eligible", () => {
  assert.equal(classification.isBlockedPlaybackSource({
    id: "regular-hls",
    provider: "AnimeAV1",
    type: "direct",
    videoUrl: "https://cdn.example.test/episode.m3u8"
  }), false);
});


test("only Russian AniLiberty/Anilibria sources are eligible for the catalog source picker", () => {
  assert.equal(classification.isRussianCatalogSource({
    id: "aniliberty-hls",
    provider: "AniLiberty",
    label: "AniLiberty · Русская озвучка",
    language: "ru",
    type: "direct",
    videoUrl: "https://cdn.example.test/episode.m3u8"
  }), true);
  assert.equal(classification.isRussianCatalogSource({
    id: "animeav1-hls",
    provider: "AnimeAV1",
    label: "AnimeAV1",
    language: "sub",
    type: "direct",
    videoUrl: "https://cdn.example.test/episode.m3u8"
  }), false);
  assert.equal(classification.isRussianCatalogSource({
    id: "generic-hls",
    provider: "HLS",
    type: "direct",
    videoUrl: "https://cdn.example.test/episode.m3u8"
  }), false);
});
