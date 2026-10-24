import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const player = readFileSync(new URL("../player/v2.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../player/v2.html", import.meta.url), "utf8");
const animeGo = readFileSync(new URL("../api/animego/[...path].js", import.meta.url), "utf8");

test("player and AnimeGO proxy parse as JavaScript", () => {
  assert.doesNotThrow(() => new Function(player));
  assert.doesNotThrow(() => new Function(animeGo));
});

test("AnimeGO search IDs are validated as digits, not literal backslash-d", () => {
  assert.ok(player.includes('if(!/^\\d{1,12}$/.test(idValue))'));
  assert.ok(!player.includes('if(!/^\\\\d{1,12}$/.test(idValue))'));
});

test("player uses only configured Russian source adapters and has a bounded wait", () => {
  assert.match(player, /aniLibertySources\\(id\\)/);
  assert.match(player, /animeVostSources\\(id\\)/);
  assert.match(player, /animeGoSources\\(id\\)/);
  assert.match(player, /deadline\\(aniLibertySources\\(id\\),12000\\)/);
  assert.match(player, /субтитр|subtitles?\\b/);
  assert.match(player, /зарубежные источники отключены/);
});

test("AnimeGO proxy only exposes recognized embed providers", () => {
  assert.ok(animeGo.includes("/aniboom|\\\\bcvh\\\\b|kodik|sibnet/i"));
  assert.ok(animeGo.includes('kind:"iframe"'));
  assert.match(animeGo, /Unsupported AnimeGO endpoint/);
});

test("player page busts the old cached JavaScript", () => {
  assert.match(page, /\\/player\\/v2\\.js\\?v=13/);
});
