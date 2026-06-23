// EIA API v2 — weekly U.S. crude oil stocks (Weekly Petroleum Status Report).
// WTI spot now sourced from FRED (DCOILWTICO) instead, see fred-series.js.
// Requires EIA_API_KEY env var (free at eia.gov/opendata).
const { readCache, writeCache } = require("./_cache");

const EIA_BASE = "https://api.eia.gov/v2";
const CACHE_KEY = "eia:crude_inv";

function toMbbls(raw) {
  // EIA returns thousands of barrels — convert to millions of barrels.
  return Math.round((parseFloat(raw) / 1000) * 10) / 10;
}

async function fetchLive(apiKey) {
  const url =
    `${EIA_BASE}/petroleum/stoc/wstk/data/?api_key=${apiKey}&frequency=weekly&data[0]=value` +
    `&facets[duoarea][]=NUS&facets[product][]=EPC0` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=2`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA crude inv: HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.response?.data || [];
  if (!rows.length) throw new Error("EIA crude inv: no data returned");

  const value = toMbbls(rows[0].value);
  const delta = rows[1] ? Math.round((value - toMbbls(rows[1].value)) * 10) / 10 : null;
  return { value, delta, date: rows[0].period };
}

exports.handler = async () => {
  const apiKey = process.env.EIA_API_KEY;

  if (!apiKey) {
    const cached = await readCache(CACHE_KEY);
    const entry = cached
      ? { ...cached, stale: true, error: "EIA_API_KEY not configured" }
      : { value: null, delta: null, date: null, stale: true, error: "EIA_API_KEY not configured" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series: { eia_crude_inv: entry }, fetchedAt: new Date().toISOString() }),
    };
  }

  let entry;
  try {
    const live = await fetchLive(apiKey);
    const payload = { ...live, fetchedAt: new Date().toISOString() };
    await writeCache(CACHE_KEY, payload);
    entry = { ...payload, stale: false, error: null };
  } catch (err) {
    const cached = await readCache(CACHE_KEY);
    entry = cached
      ? { ...cached, stale: true, error: err.message }
      : { value: null, delta: null, date: null, stale: true, error: err.message };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series: { eia_crude_inv: entry }, fetchedAt: new Date().toISOString() }),
  };
};
