// Parses Federal Reserve RSS feeds server-side (CORS blocks direct browser fetches)
// source map: use aggregate feeds, not named-official feeds — chair seat changes
const FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_monetary.xml",    source: "Fed/Monetary" },
  { url: "https://www.federalreserve.gov/feeds/speeches_and_testimony.xml", source: "Fed/Speeches" },
];

function extractTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseItems(xml, source) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title:   extractTag(block, "title"),
      link:    extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source,
    });
  }
  return items;
}

async function fetchFeed({ url, source }) {
  const res = await fetch(url, { headers: { "User-Agent": "macro-dashboard/1.0" } });
  if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
  const xml = await res.text();
  return parseItems(xml, source);
}

exports.handler = async () => {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const allItems = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);

  // Sort newest first
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: allItems.slice(0, 10), fetchedAt: new Date().toISOString() }),
  };
};
