// Google News RSS — one feed per topic, merged and sorted server-side
// source map: capped at 100 items/feed, links are Google redirects (cosmetic)
const BASE = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";

function extractTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseItems(xml, topic) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title:   extractTag(block, "title"),
      link:    extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source:  extractTag(block, "source") || topic,
    });
  }
  return items;
}

async function fetchTopic(topic) {
  const url = BASE + encodeURIComponent(topic);
  const res = await fetch(url, { headers: { "User-Agent": "macro-dashboard/1.0" } });
  if (!res.ok) throw new Error(`news "${topic}": HTTP ${res.status}`);
  const xml = await res.text();
  return parseItems(xml, topic).slice(0, 5);
}

exports.handler = async (event) => {
  const raw = event.queryStringParameters?.topics ?? "";
  const topics = raw.split("|").map(t => t.trim()).filter(Boolean);

  if (!topics.length) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "no topics provided" }),
    };
  }

  const results = await Promise.allSettled(topics.map(fetchTopic));

  const allItems = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);

  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: allItems.slice(0, 12), fetchedAt: new Date().toISOString() }),
  };
};
