// EIA API v2 — petroleum spot price and weekly crude inventory
// Requires EIA_API_KEY env var (free at eia.gov/opendata)
const EIA_BASE = "https://api.eia.gov/v2";

async function fetchWTI(apiKey) {
  const url = `${EIA_BASE}/petroleum/pri/spt/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA WTI: HTTP ${res.status}`);
  const json = await res.json();
  const row = json.response?.data?.[0];
  if (!row) throw new Error("EIA WTI: no data");
  return { value: parseFloat(row.value), date: row.period };
}

async function fetchCrudeInventory(apiKey) {
  // wstk = weekly stocks; EPC0 = crude oil; NUS = US total
  // EIA returns values in thousands of barrels — divide by 1000 for Mbbls
  const url = `${EIA_BASE}/petroleum/stoc/wstk/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[duoarea][]=NUS&facets[product][]=EPC0&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA crude inv: HTTP ${res.status}`);
  const json = await res.json();
  const row = json.response?.data?.[0];
  if (!row) throw new Error("EIA crude inv: no data");
  return { value: Math.round(parseFloat(row.value) / 1000 * 10) / 10, date: row.period };
}

exports.handler = async () => {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "EIA_API_KEY not configured" }),
    };
  }

  const [wtiResult, invResult] = await Promise.allSettled([
    fetchWTI(apiKey),
    fetchCrudeInventory(apiKey),
  ]);

  const series = {
    eia_wti: wtiResult.status === "fulfilled"
      ? wtiResult.value
      : { value: null, date: null, error: wtiResult.reason?.message },
    eia_crude_inv: invResult.status === "fulfilled"
      ? invResult.value
      : { value: null, date: null, error: invResult.reason?.message },
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series, fetchedAt: new Date().toISOString() }),
  };
};
