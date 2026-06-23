// Latest FOMC press release — title + link only, no further parsing.
const { readCache, writeCache } = require("./_cache");

const FEED_URL = "https://www.federalreserve.gov/feeds/press_monetary.xml";
const CACHE_KEY = "fed:latest";

function extractTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

exports.handler = async () => {
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "macro-dashboard/1.0" } });
    if (!res.ok) throw new Error(`Fed RSS: HTTP ${res.status}`);
    const xml = await res.text();
    const m = xml.match(/<item>([\s\S]*?)<\/item>/i);
    if (!m) throw new Error("Fed RSS: no items found");
    const block = m[1];
    const item = {
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
    };
    await writeCache(CACHE_KEY, item);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, stale: false, error: null, fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    const cached = await readCache(CACHE_KEY);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: cached || null,
        stale: true,
        error: err.message,
        fetchedAt: new Date().toISOString(),
      }),
    };
  }
};
