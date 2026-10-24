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

test("all Russian adapters are queried concurrently with a deadline", () => {
  for (const adapter of ["aniLibertySources(id)", "animeVostSources(id)", "animeGoSources(id)"]) {
    assert.ok(player.includes(adapter), "missing adapter: " + adapter);
  }
  assert.ok(player.includes("deadline(aniLibertySources(id),12000)"));
  assert.ok(player.includes("deadline(animeVostSources(id),12000)"));
  assert.ok(player.includes("deadline(animeGoSources(id),12000)"));
  assert.ok(player.includes("/субтитр|subtitles?\\b|\\(sub\\)/i"));
  assert.ok(player.includes("Зарубежные источники отключены"));
});

test("AnimeGO proxy limits results to recognized embed providers", () => {
  assert.ok(animeGo.includes("/aniboom|\\bcvh\\b|kodik|sibnet/i"));
  assert.ok(animeGo.includes('kind:"iframe"'));
  assert.ok(animeGo.includes("Unsupported AnimeGO endpoint"));
});

test("player page busts the old cached JavaScript", () => {
  assert.ok(page.includes("/player/v2.js?v=14"));
});

test("AnimeGO search supports cards without title attributes and normalizes embed URLs", () => {
  assert.ok(animeGo.includes('class="(?:ani-grid__item|[^"]*\\sani-grid__item)(?:\\s[^"]*)?"'));
  assert.ok(animeGo.includes('ani-grid__item-title'));
  assert.ok(animeGo.includes('new URL(u, BASE)'));
  assert.ok(animeGo.includes('title:decode(title[1].replace(/<[^>]*>/g, "").trim())'));
});
