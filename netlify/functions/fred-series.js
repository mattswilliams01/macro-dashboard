const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// FRED native unit transformations applied server-side
// pc1 = percent change from year ago; chg = period-over-period change
const UNITS_OVERRIDE = {
  CPIAUCSL:  "pc1",
  CPILFESL:  "pc1",
  PCEPI:     "pc1",
  PCEPILFE:  "pc1",
  PAYEMS:    "chg",
};

// Multiply raw FRED value by this factor before returning
// BAMLH0A0HYM2 is in % pts on FRED; market convention quotes HY OAS in bps
const SCALE = {
  BAMLH0A0HYM2: 100,
};

async function fetchOneSeries(seriesId, apiKey) {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "1");

  const units = UNITS_OVERRIDE[seriesId];
  if (units) url.searchParams.set("units", units);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const data = await res.json();

  const obs = data.observations?.[0];
  const raw = obs?.value;
  if (raw === "." || raw == null) return { value: null, date: obs?.date ?? null };

  let value = parseFloat(raw);
  const scale = SCALE[seriesId];
  if (scale) value = Math.round(value * scale * 10) / 10;

  return { value, date: obs?.date ?? null };
}

exports.handler = async (event) => {
  const apiKey = process.env.FRED_KEY_V2;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "FRED_KEY_V2 not configured" }),
    };
  }

  const raw = event.queryStringParameters?.series ?? "";
  const ids = raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  if (ids.length === 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "no series requested" }),
    };
  }

  const results = await Promise.allSettled(ids.map(id => fetchOneSeries(id, apiKey)));

  const series = {};
  for (let i = 0; i < ids.length; i++) {
    const r = results[i];
    series[ids[i]] = r.status === "fulfilled"
      ? r.value
      : { value: null, date: null, error: r.reason?.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series, fetchedAt: new Date().toISOString() }),
  };
};
