// CFTC Traders in Financial Futures (TFF) – Futures Only
// Dataset gpe5-46if confirmed on publicreporting.cftc.gov — no API key required.
const SOCRATA_BASE = "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

// Contract codes confirmed via CFTC API 2026-06-18
const CONTRACTS = {
  ES: { code: "13874A", label: "E-MINI S&P 500" },
  NQ: { code: "209742", label: "NASDAQ MINI" },
};

const SELECT_FIELDS = [
  "report_date_as_yyyy_mm_dd",
  "lev_money_positions_long",
  "lev_money_positions_short",
  "open_interest_all",
].join(",");

async function fetchContract(key, { code }) {
  const url = new URL(SOCRATA_BASE);
  url.searchParams.set("$where", `cftc_contract_market_code='${code}' AND futonly_or_combined='FutOnly'`);
  url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
  url.searchParams.set("$limit", "1");
  url.searchParams.set("$select", SELECT_FIELDS);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`CFTC ${key}: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error(`CFTC ${key}: no data returned`);

  const row = data[0];
  const long = parseInt(row.lev_money_positions_long, 10);
  const short = parseInt(row.lev_money_positions_short, 10);
  const date = (row.report_date_as_yyyy_mm_dd || "").slice(0, 10);

  return { long, short, net: long - short, oi: parseInt(row.open_interest_all, 10), date };
}

exports.handler = async () => {
  const results = await Promise.allSettled([
    fetchContract("ES", CONTRACTS.ES),
    fetchContract("NQ", CONTRACTS.NQ),
  ]);

  const series = {};

  const pack = (prefix, r, date) => {
    series[`${prefix}_lev_net`]   = { value: r.net,   date };
    series[`${prefix}_lev_long`]  = { value: r.long,  date };
    series[`${prefix}_lev_short`] = { value: r.short, date };
  };

  if (results[0].status === "fulfilled") pack("es", results[0].value, results[0].value.date);
  else series["es_error"] = { value: null, date: null, error: results[0].reason?.message };

  if (results[1].status === "fulfilled") pack("nq", results[1].value, results[1].value.date);
  else series["nq_error"] = { value: null, date: null, error: results[1].reason?.message };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series, fetchedAt: new Date().toISOString() }),
  };
};
