import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import animeGoProxy from "../api/animego/[...path].js";

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
  assert.ok(player.includes("/субтитр|subtitles?\\b|\\bsub\\b|\\(sub\\)/i"));
  assert.ok(player.includes("Зарубежные источники отключены"));
});

test("AnimeGO proxy limits results to recognized embed providers", () => {
  assert.ok(animeGo.includes("/aniboom|\\bcvh\\b|kodik|sibnet/i"));
  assert.ok(animeGo.includes('kind:"iframe"'));
  assert.ok(animeGo.includes("Unsupported AnimeGO endpoint"));
});

test("player page busts the old cached JavaScript", () => {
  assert.ok(page.includes("/player/v2.js?v=15"));
  assert.ok(page.includes('id="nextSource"'));
  assert.ok(player.includes('$("nextSource").addEventListener("click"'));
  assert.ok(player.includes("start((active+1)%sources.length)"));
});

test("AnimeGO search supports cards without title attributes and normalizes embed URLs", () => {
  assert.ok(animeGo.includes('class="(?:ani-grid__item|[^"]*\\sani-grid__item)(?:\\s[^"]*)?"'));
  assert.ok(animeGo.includes('ani-grid__item-title'));
  assert.ok(animeGo.includes('new URL(u, BASE)'));
  assert.ok(animeGo.includes('title:decode(title[1].replace(/<[^>]*>/g, "").trim())'));
});


async function callAnimeGo(query, fakeFetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body = "") { this.body = body; }
  };
  try {
    await animeGoProxy({ method: "GET", query }, res);
    return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body || "{}") };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function response(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/html" : "application/json" }
  });
}

test("AnimeGO search route extracts Russian title and numeric ID", async () => {
  const html = '<div class="ani-grid__item"><div class="ani-grid__item-title"><a href="/anime/naruto-shippuuden-2239">Наруто: Ураганные хроники</a></div></div>';
  const result = await callAnimeGo({ path: ["search"], query: "naruto" }, async () => response(html));
  assert.equal(result.status, 200);
  assert.equal(result.body.results[0].id, "2239");
  assert.equal(result.body.results[0].slug, "naruto-shippuuden");
  assert.equal(result.body.results[0].title, "Наруто: Ураганные хроники");
});

test("AnimeGO player route returns recognized Russian-language embed providers", async () => {
  const html = '<div id="provider"><button data-player="//kodikplayer.com/seria/123" data-translation-title="AniLibria" data-provider-title="Kodik" data-ptranslation="1"></button></div>';
  const result = await callAnimeGo({ path: ["players"], id: "2239", episode: "1" }, async () => response({ data: { content: html } }));
  assert.equal(result.status, 200);
  assert.equal(result.body.players.length, 1);
  assert.equal(result.body.players[0].url, "https://kodikplayer.com/seria/123");
  assert.equal(result.body.players[0].label, "AniLibria");
  assert.equal(result.body.players[0].kind, "iframe");
});


test("AnimeGO player route excludes subtitle-only variants and unknown foreign providers", async () => {
  const html = '<button data-player="//kodikplayer.com/seria/sub" data-translation-title="AniLibria.Subtitles" data-provider-title="Kodik"></button><button data-player="//foreign.example/player/1" data-translation-title="Dub" data-provider-title="Foreign"></button>';
  const result = await callAnimeGo({ path: ["players"], id: "2239", episode: "1" }, async () => response({ data: { content: html } }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.players, []);
});

test("AnimeGO player route resolves episodes after the first", async () => {
  const episodeList = { data: { content: '<div data-episode="555" data-episode-number="2">2</div>' } };
  const playerData = { data: { content: '<div id="provider"><button data-player="//video.sibnet.ru/shell.php?videoid=123" data-translation-title="AniDUB" data-provider-title="Sibnet" data-ptranslation="2"></button></div>' } };
  const requested = [];
  const result = await callAnimeGo({ path: ["players"], id: "2239", episode: "2" }, async url => {
    requested.push(String(url));
    return response(requested.length === 1 ? episodeList : playerData);
  });
  assert.equal(result.status, 200);
  assert.ok(requested[1].includes("/player/videos/555"));
  assert.equal(result.body.players[0].provider, "Sibnet");
});
