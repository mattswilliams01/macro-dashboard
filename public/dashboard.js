// Panel definitions — reorder this array to rearrange panels on the dashboard.
// Each panel has: id, title, type, and type-specific config.
const PANEL_CONFIG = [
  {
    id: "fed-policy",
    title: "Fed Policy",
    type: "feed",
    wired: false,
  },
  {
    id: "labor",
    title: "Labor Market",
    type: "metrics",
    endpoint: "/.netlify/functions/fred-series",
    metrics: [
      { label: "Unemployment Rate", series: "UNRATE", unit: "%" },
      { label: "Nonfarm Payrolls (chg, 000s)", series: "PAYEMS", unit: "k", delta: true },
      { label: "Initial Claims", series: "ICSA", unit: "" },
      { label: "Continuing Claims", series: "CCSA", unit: "" },
      { label: "JOLTS Openings", series: "JTSJOL", unit: "k" },
    ],
  },
  {
    id: "inflation",
    title: "Inflation",
    type: "metrics",
    endpoint: "/.netlify/functions/fred-series",
    metrics: [
      { label: "CPI Headline YoY", series: "CPIAUCSL", unit: "%" },
      { label: "CPI Core YoY", series: "CPILFESL", unit: "%" },
      { label: "PCE Headline YoY", series: "PCEPI", unit: "%" },
      { label: "PCE Core YoY", series: "PCEPILFE", unit: "%" },
      { label: "PCE Saving Rate", series: "PSAVERT", unit: "%" },
    ],
  },
  {
    id: "rates-credit",
    title: "Rates, Spreads & Credit",
    type: "metrics",
    endpoint: "/.netlify/functions/fred-series",
    metrics: [
      { label: "10Y Treasury", series: "DGS10", unit: "%" },
      { label: "2Y Treasury", series: "DGS2", unit: "%" },
      { label: "2s10s Spread", series: "T10Y2Y", unit: "% pts" },
      { label: "3M10Y Spread", series: "T10Y3M", unit: "% pts" },
      { label: "HY OAS Spread", series: "BAMLH0A0HYM2", unit: "bps" },
      { label: "5Y TIPS Breakeven", series: "T5YIE", unit: "%" },
      { label: "M2", series: "M2SL", unit: "$B" },
      { label: "DXY Proxy (broad TWI)", series: "DTWEXBGS", unit: "" },
    ],
  },
  {
    id: "positioning",
    title: "Positioning & Flow",
    type: "mixed",
    endpoint: "/api/cot",
    metrics: [],
    manualFields: [
      {
        key: "naaim",
        label: "NAAIM Exposure Index",
        note: "naaim.org — update weekly (Thu)",
      },
    ],
  },
  {
    id: "consumer-sentiment",
    title: "Consumer Sentiment",
    type: "manual",
    manualFields: [
      {
        key: "umich_prelim",
        label: "Michigan Expectations (Prelim)",
        note: "sca.isr.umich.edu — mid-month",
      },
      {
        key: "umich_final",
        label: "Michigan Expectations (Final)",
        note: "sca.isr.umich.edu — end of month",
      },
    ],
  },
  {
    id: "energy",
    title: "Energy / Oil Supply",
    type: "metrics",
    wired: false,
    endpoint: "/api/eia",
    metrics: [
      { label: "Crude Inventories (Mbbls)", series: "eia_crude_inv", unit: "Mbbls" },
      { label: "WTI Spot", series: "eia_wti", unit: "$/bbl" },
    ],
  },
  {
    id: "geopolitical",
    title: "Geopolitical Headlines",
    type: "headlines",
    wired: false,
    endpoint: "/api/news",
    topics: ["Strait of Hormuz", "Iran ceasefire", "FOMC", "oil supply"],
  },
];

async function fetchManualEntry(key) {
  try {
    const res = await fetch(`/.netlify/functions/manual-entry?key=${encodeURIComponent(key)}`);
    if (!res.ok) return { value: null, asOf: null };
    return await res.json();
  } catch {
    return { value: null, asOf: null };
  }
}

async function postManualEntry(key, value) {
  const res = await fetch("/.netlify/functions/manual-entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function formatFreshness(isoDate) {
  if (!isoDate) return "no data";
  const d = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function freshnessClass(isoDate, staleDays = 5) {
  if (!isoDate) return "error";
  const diffDays = Math.floor((new Date() - new Date(isoDate)) / 86400000);
  return diffDays > staleDays ? "stale" : "";
}

function renderMetricRow(label, value, unit, asOf) {
  const el = document.createElement("div");
  el.className = "metric-row";
  const valDisplay = value != null ? `${value}${unit ? " " + unit : ""}` : "—";
  const cls = value == null ? "neutral" : value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  el.innerHTML = `
    <span class="metric-label">${label}</span>
    <span class="metric-value ${cls}" title="as of ${asOf || "unknown"}">${valDisplay}</span>
  `;
  return el;
}

function renderManualField(field, stored) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="metric-row">
      <span class="metric-label">${field.label}</span>
      <span class="metric-value neutral" id="mv-${field.key}">${stored.value != null ? stored.value : "—"}</span>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${field.note}</div>
    <div class="manual-entry-field">
      <input type="number" id="inp-${field.key}" placeholder="enter value" step="0.1">
      <button data-key="${field.key}">Save</button>
    </div>
  `;
  wrapper.querySelector("button").addEventListener("click", async () => {
    const inp = document.getElementById(`inp-${field.key}`);
    const btn = wrapper.querySelector("button");
    const val = parseFloat(inp.value);
    if (isNaN(val)) return;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const saved = await postManualEntry(field.key, val);
      document.getElementById(`mv-${field.key}`).textContent = saved.value;
      inp.value = "";
      // Update panel freshness to reflect the new asOf
      const panelEl = wrapper.closest(".panel");
      if (panelEl) {
        const freshEl = panelEl.querySelector(".panel-freshness");
        if (freshEl) freshEl.textContent = `as of ${formatFreshness(saved.asOf)}`;
      }
    } catch {
      btn.textContent = "err";
      setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 2000);
      return;
    }
    btn.textContent = "Save";
    btn.disabled = false;
  });
  return wrapper;
}

function buildPanelShell(panel) {
  const el = document.createElement("div");
  el.className = "panel";
  el.id = `panel-${panel.id}`;
  el.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">${panel.title}</span>
      <span class="panel-freshness" id="fresh-${panel.id}">—</span>
    </div>
    <div class="panel-body" id="body-${panel.id}">
      <span class="placeholder">loading…</span>
    </div>
  `;
  return el;
}

async function populatePanel(panel) {
  const body = document.getElementById(`body-${panel.id}`);
  const freshEl = document.getElementById(`fresh-${panel.id}`);

  if (panel.wired === false) {
    body.innerHTML = '<span class="placeholder">not yet wired</span>';
    freshEl.textContent = "—";
    return;
  }

  if (panel.type === "manual") {
    body.innerHTML = '<span class="placeholder">fetching…</span>';
    const fetched = await Promise.all(
      panel.manualFields.map(f => fetchManualEntry(f.key))
    );
    body.innerHTML = "";
    let latestAsOf = null;
    panel.manualFields.forEach((field, i) => {
      const stored = fetched[i];
      body.appendChild(renderManualField(field, stored));
      if (stored.asOf && (!latestAsOf || stored.asOf > latestAsOf)) latestAsOf = stored.asOf;
    });
    freshEl.textContent = latestAsOf ? `as of ${formatFreshness(latestAsOf)}` : "no data yet";
    freshEl.className = `panel-freshness ${latestAsOf ? freshnessClass(latestAsOf, 14) : "error"}`;
    return;
  }

  if (panel.type === "mixed") {
    body.innerHTML = '<span class="placeholder">fetching…</span>';
    const manualFields = panel.manualFields || [];
    const fetched = await Promise.all(
      manualFields.map(f => fetchManualEntry(f.key))
    );
    body.innerHTML = "";
    let latestAsOf = null;
    manualFields.forEach((field, i) => {
      const stored = fetched[i];
      body.appendChild(renderManualField(field, stored));
      if (stored.asOf && (!latestAsOf || stored.asOf > latestAsOf)) latestAsOf = stored.asOf;
    });
    // API metrics (COT etc) wired in a later step
    freshEl.textContent = latestAsOf ? `as of ${formatFreshness(latestAsOf)}` : "no data yet";
    freshEl.className = `panel-freshness ${latestAsOf ? freshnessClass(latestAsOf, 14) : "error"}`;
    return;
  }

  // API-backed panels
  body.innerHTML = '<span class="placeholder">fetching…</span>';

  try {
    const url = buildEndpointUrl(panel);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    body.innerHTML = "";

    if (panel.type === "metrics" && data.series) {
      for (const m of panel.metrics) {
        const s = data.series[m.series];
        if (s) {
          body.appendChild(renderMetricRow(m.label, s.value, m.unit, s.date));
        } else {
          body.appendChild(renderMetricRow(m.label, null, m.unit, null));
        }
      }
      const dates = Object.values(data.series).map(s => s.date).filter(Boolean).sort();
      const oldest = dates[0];
      freshEl.textContent = oldest ? `as of ${formatFreshness(oldest)}` : "—";
      freshEl.className = `panel-freshness ${freshnessClass(oldest, 7)}`;
    }

    if (panel.type === "headlines" && data.items) {
      const ul = document.createElement("ul");
      ul.className = "headline-list";
      for (const item of data.items.slice(0, 8)) {
        const li = document.createElement("li");
        li.className = "headline-item";
        li.innerHTML = `
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
          <div class="headline-source">${item.source || ""} · ${item.pubDate || ""}</div>
        `;
        ul.appendChild(li);
      }
      body.appendChild(ul);
      freshEl.textContent = data.fetchedAt ? formatFreshness(data.fetchedAt) : "—";
    }

  } catch (err) {
    body.innerHTML = `<span class="placeholder" style="color:var(--red)">fetch failed — showing last known data if cached</span>`;
    freshEl.textContent = "error";
    freshEl.className = "panel-freshness error";
    console.error(`Panel ${panel.id}:`, err);
  }
}

function buildEndpointUrl(panel) {
  if (panel.type === "metrics" && panel.metrics) {
    const ids = panel.metrics.map(m => m.series).join(",");
    return `${panel.endpoint}?series=${encodeURIComponent(ids)}`;
  }
  if (panel.type === "headlines" && panel.topics) {
    return `${panel.endpoint}?topics=${encodeURIComponent(panel.topics.join("|"))}`;
  }
  return panel.endpoint;
}

async function checkHealth() {
  const el = document.getElementById("api-status");
  try {
    const res = await fetch("/.netlify/functions/health");
    const data = await res.json();
    el.textContent = data.status === "ok" ? "ok" : "degraded";
    el.className = data.status === "ok" ? "ok" : "fail";
  } catch {
    el.textContent = "unreachable";
    el.className = "fail";
  }
}

function init() {
  const dashboard = document.getElementById("dashboard");
  dashboard.innerHTML = "";

  for (const panel of PANEL_CONFIG) {
    dashboard.appendChild(buildPanelShell(panel));
  }

  for (const panel of PANEL_CONFIG) {
    populatePanel(panel);
  }

  document.getElementById("last-refresh").textContent =
    `refreshed ${new Date().toLocaleTimeString()}`;

  checkHealth();
}

document.addEventListener("DOMContentLoaded", init);
