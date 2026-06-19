const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function fetchOneSeries(seriesId, apiKey) {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const data = await res.json();

  const obs = data.observations?.[0];
  // FRED returns "." for missing/unreleased observations
  const raw = obs?.value;
  const value = raw === "." || raw == null ? null : parseFloat(raw);
  return { value, date: obs?.date ?? null };
}

export default async (req) => {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "FRED_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const raw = new URL(req.url).searchParams.get("series") ?? "";
  const ids = raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (ids.length === 0) {
    return new Response(
      JSON.stringify({ error: "no series requested" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch all series in parallel
  const results = await Promise.allSettled(ids.map(id => fetchOneSeries(id, apiKey)));

  const series = {};
  for (let i = 0; i < ids.length; i++) {
    const r = results[i];
    series[ids[i]] = r.status === "fulfilled"
      ? r.value
      : { value: null, date: null, error: r.reason?.message };
  }

  return new Response(
    JSON.stringify({ series, fetchedAt: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/fred-series",
};
