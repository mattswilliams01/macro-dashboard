const { readCache, writeCache } = require("./_cache");

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// CPI/PCE are computed as YoY% from raw observations (current vs. 12 months
// prior) rather than trusting FRED's units=pc1 transform.
const YOY_SERIES = new Set(["CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE"]);

// NFP is displayed as the month-over-month change in thousands, not the level.
const MOM_CHANGE_SERIES = new Set(["PAYEMS"]);

// BAMLH0A0HYM2 is in % pts on FRED; market convention quotes HY OAS in bps.
const SCALE = { BAMLH0A0HYM2: 100 };

// Initial Claims: flag 4+ consecutive weekly increases.
const TREND_CHECK = new Set(["ICSA"]);

function limitFor(seriesId) {
  if (YOY_SERIES.has(seriesId) || MOM_CHANGE_SERIES.has(seriesId)) return 14;
  if (TREND_CHECK.has(seriesId)) return 5;
  return 2;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

async function fetchLive(seriesId, apiKey) {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limitFor(seriesId)));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const data = await res.json();
  const obs = data.observations || [];
  if (!obs.length) throw new Error(`FRED ${seriesId}: no observations`);

  const values = obs.map((o) => (o.value === "." ? null : parseFloat(o.value)));
  const dates = obs.map((o) => o.date);

  let value, delta;
  let trend = null;

  if (YOY_SERIES.has(seriesId)) {
    if (values[0] == null || values[12] == null) {
      throw new Error(`FRED ${seriesId}: insufficient history for YoY calc`);
    }
    value = (values[0] / values[12] - 1) * 100;
    const prevYoy =
      values[1] != null && values[13] != null ? (values[1] / values[13] - 1) * 100 : null;
    delta = prevYoy != null ? value - prevYoy : null;
  } else if (MOM_CHANGE_SERIES.has(seriesId)) {
    if (values[0] == null || values[1] == null) {
      throw new Error(`FRED ${seriesId}: insufficient history for MoM calc`);
    }
    value = values[0] - values[1];
    const prevChange = values[2] != null ? values[1] - values[2] : null;
    delta = prevChange != null ? value - prevChange : null;
  } else {
    if (values[0] == null) throw new Error(`FRED ${seriesId}: latest observation missing`);
    value = values[0];
    delta = values[1] != null ? value - values[1] : null;
  }

  if (TREND_CHECK.has(seriesId)) {
    let up4 = values.length >= 5;
    for (let i = 0; up4 && i < 4; i++) {
      if (values[i] == null || values[i + 1] == null || values[i] <= values[i + 1]) up4 = false;
    }
    trend = up4 ? "up4" : null;
  }

  const scale = SCALE[seriesId];
  if (scale) {
    value *= scale;
    if (delta != null) delta *= scale;
  }

  return { value: round2(value), delta: round2(delta), date: dates[0], trend };
}

async function fetchOneSeries(seriesId, apiKey) {
  const cacheKey = `fred:${seriesId}`;
  try {
    const live = await fetchLive(seriesId, apiKey);
    const payload = { ...live, fetchedAt: new Date().toISOString() };
    await writeCache(cacheKey, payload);
    return { ...payload, stale: false, error: null };
  } catch (err) {
    const cached = await readCache(cacheKey);
    if (cached) return { ...cached, stale: true, error: err.message };
    return { value: null, delta: null, date: null, trend: null, stale: true, error: err.message };
  }
}

exports.handler = async (event) => {
  const apiKey = process.env.FRED_API_KEY || process.env.FRED_KEY_V2;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "FRED API key not configured (set FRED_API_KEY)" }),
    };
  }

  const raw = event.queryStringParameters?.series ?? "";
  const ids = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!ids.length) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "no series requested" }),
    };
  }

  const results = await Promise.all(ids.map((id) => fetchOneSeries(id, apiKey)));
  const series = {};
  ids.forEach((id, i) => {
    series[id] = results[i];
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series, fetchedAt: new Date().toISOString() }),
  };
};
