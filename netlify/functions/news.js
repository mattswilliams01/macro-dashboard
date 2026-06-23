// Google News RSS — one feed per keyword, merged, deduplicated by title.
// No synopsis: RSS doesn't reliably carry full article text, so we only
// ever show title + source + link.
const { readCache, writeCache } = require("./_cache");

const BASE = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";
const TOPICS = ["Strait of Hormuz", "Iran ceasefire", "FOMC", "oil supply tariffs", "ceasefire Middle East"];
const CACHE_KEY = "news:headlines";

function extractTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source: extractTag(block, "source"),
    });
  }
  return items;
}

async function fetchTopic(topic) {
  const url = BASE + encodeURIComponent(topic);
  const res = await fetch(url, { headers: { "User-Agent": "macro-dashboard/1.0" } });
  if (!res.ok) throw new Error(`news "${topic}": HTTP ${res.status}`);
  const xml = await res.text();
  return parseItems(xml);
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

exports.handler = async () => {
  const results = await Promise.allSettled(TOPICS.map(fetchTopic));
  const fulfilled = results.filter((r) => r.status === "fulfilled");

  if (!fulfilled.length) {
    const cached = await readCache(CACHE_KEY);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cached?.items || [],
        stale: true,
        error: "all topic fetches failed",
        fetchedAt: new Date().toISOString(),
      }),
    };
  }

  let allItems = dedupe(fulfilled.flatMap((r) => r.value));
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  allItems = allItems.slice(0, 20);

  await writeCache(CACHE_KEY, { items: allItems });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: allItems, stale: false, error: null, fetchedAt: new Date().toISOString() }),
  };
};
