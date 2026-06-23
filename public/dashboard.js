// ---------- Metric definitions ----------
// `good`: "up" | "down" | null — which delta direction is constructive.
// `threshold`: { gt, lt, label } — flags shown as a badge when crossed.
// `trendFlag`: series gets a 4-consecutive-period trend check server-side.

const METRICS = {
  DGS10:        { label: "10Y Treasury",            unit: "%",   good: "down" },
  DGS2:         { label: "2Y Treasury",              unit: "%",   good: "down" },
  T10Y2Y:       { label: "2s10s Spread",              unit: "pts", good: "up" },
  T10Y3M:       { label: "3M10Y Spread",              unit: "pts", good: "up" },
  BAMLH0A0HYM2: { label: "HY OAS Spread",             unit: "bps", good: "down", threshold: { gt: 500, label: "Elevated Stress" } },
  T5YIE:        { label: "5Y TIPS Breakeven",         unit: "%",   good: "down" },
  M2SL:         { label: "M2 Money Supply",           unit: "$B",  good: null },
  DTWEXBGS:     { label: "DXY Proxy (Broad TWI)",     unit: "",    good: null },
  VIXCLS:       { label: "VIX",                       unit: "",    good: "down", threshold: { gt: 30, label: "Elevated Vol" } },
  SP500:        { label: "S&P 500 (Prior Close)",     unit: "",    good: "up" },
  UNRATE:       { label: "Unemployment Rate",         unit: "%",   good: "down" },
  PAYEMS:       { label: "Nonfarm Payrolls (MoM, k)", unit: "k",   good: "up" },
  ICSA:         { label: "Initial Claims",            unit: "",    good: "down", trendFlag: true },
  CCSA:         { label: "Continuing Claims",         unit: "",    good: "down" },
  JTSJOL:       { label: "JOLTS Openings",            unit: "k",   good: "up" },
  CPIAUCSL:     { label: "CPI Headline YoY",          unit: "%",   good: "down" },
  CPILFESL:     { label: "CPI Core YoY",               unit: "%",   good: "down" },
  PCEPI:        { label: "PCE Headline YoY",           unit: "%",   good: "down" },
  PCEPILFE:     { label: "PCE Core YoY",                unit: "%",   good: "down" },
  PSAVERT:      { label: "PCE Saving Rate",             unit: "%",   good: "up" },
  FEDFUNDS:     { label: "Effective Fed Funds Rate",    unit: "%",   good: null },
  DCOILWTICO:   { label: "WTI Spot",                    unit: "$/bbl", good: null },
};

const FRED_IDS = Object.keys(METRICS);

const EIA_METRICS = {
  eia_crude_inv: { label: "Crude Inventories", unit: "Mbbls", good: null },
};

const MANUAL_FIELDS = {
  naaim:        { key: "naaim",        label: "NAAIM Exposure Index",            note: "naaim.org — weekly (Thu)",          threshold: { lt: 30, gt: 90, label: "Extreme Positioning" } },
  umich_prelim: { key: "umich_prelim", label: "Michigan Expectations (Prelim)",  note: "sca.isr.umich.edu — mid-month" },
  umich_final:  { key: "umich_final",  label: "Michigan Expectations (Final)",   note: "sca.isr.umich.edu — end of month" },
};

const TABS = [
  { id: "rates",     label: "Rates & Credit",          fred: ["DGS10", "DGS2", "T10Y2Y", "T10Y3M", "BAMLH0A0HYM2", "T5YIE", "M2SL", "DTWEXBGS"], inversionCheck: true },
  { id: "labor",     label: "Labor Market",            fred: ["UNRATE", "PAYEMS", "ICSA", "CCSA", "JTSJOL"] },
  { id: "inflation", label: "Inflation",               fred: ["CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE", "PSAVERT"] },
  { id: "sentiment", label: "Sentiment & Positioning",  fred: ["VIXCLS"], manual: ["umich_prelim", "umich_final", "naaim"] },
  { id: "fed",       label: "Fed Policy",               fred: ["FEDFUNDS"], fedFeed: true },
  { id: "geo",       label: "Geopolitical & Energy",    fred: ["DCOILWTICO"], eia: ["eia_crude_inv"], news: true },
];

const LS_KEY = "macro-dashboard-state-v2";

let state = {
  fred: {},
  eia: {},
  news: { items: [] },
  fed: { item: null },
  manual: {
    naaim: { value: null, asOf: null },
    umich_prelim: { value: null, asOf: null },
    umich_final: { value: null, asOf: null },
  },
  fetchedAt: null,
};

// ---------- Formatting helpers ----------

function formatNum(n, decimals = 2) {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function formatFreshness(dateStr) {
  if (!dateStr) return "no data";
  const diffDays = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function arrow(delta) {
  if (delta == null || delta === 0) return "•";
  return delta > 0 ? "▲" : "▼";
}

function metricColorClass(delta, good) {
  if (delta == null || delta === 0 || good == null) return "neutral";
  const rising = delta > 0;
  const isGood = (good === "up" && rising) || (good === "down" && !rising);
  return isGood ? "positive" : "negative";
}

function badge(label, kind) {
  return `<span class="badge ${kind}">${label}</span>`;
}

// ---------- Data fetchers ----------

async function fetchFred() {
  try {
    const res = await fetch(`/.netlify/functions/fred-series?series=${encodeURIComponent(FRED_IDS.join(","))}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.series || null;
  } catch (err) {
    console.error("fred-series:", err);
    return null;
  }
}

async function fetchEia() {
  try {
    const res = await fetch("/.netlify/functions/eia");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.series || null;
  } catch (err) {
    console.error("eia:", err);
    return null;
  }
}

async function fetchNews() {
  try {
    const res = await fetch("/.netlify/functions/news");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("news:", err);
    return null;
  }
}

async function fetchFedRss() {
  try {
    const res = await fetch("/.netlify/functions/fed-rss");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fed-rss:", err);
    return null;
  }
}

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

// ---------- Persistence (instant render from last good payload) ----------

function persistState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable — non-fatal, just skip the instant-load cache
  }
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------- Rendering primitives ----------

function createPanel(title) {
  const panel = document.createElement("div");
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "panel-header";

  const titleEl = document.createElement("span");
  titleEl.className = "panel-title";
  titleEl.textContent = title;

  const freshEl = document.createElement("span");
  freshEl.className = "panel-freshness";
  freshEl.textContent = "—";

  header.appendChild(titleEl);
  header.appendChild(freshEl);

  const body = document.createElement("div");
  body.className = "panel-body";

  panel.appendChild(header);
  panel.appendChild(body);

  return { panel, body, freshEl };
}

function renderMetricRow(def, data) {
  const value = data?.value ?? null;
  const delta = data?.delta ?? null;
  const cls = value == null ? "neutral" : metricColorClass(delta, def.good);
  const valStr = value != null ? `${formatNum(value)}${def.unit ? " " + def.unit : ""}` : "no data";
  const deltaStr = delta != null ? `${arrow(delta)} ${formatNum(Math.abs(delta))}` : "";
  const titleAttr = `as of ${data?.date || "unknown"}${data?.stale ? " (stale)" : ""}`;

  let badgesHtml = "";
  if (def.threshold && value != null) {
    if (def.threshold.gt != null && value > def.threshold.gt) badgesHtml += badge(def.threshold.label, "danger");
    if (def.threshold.lt != null && value < def.threshold.lt) badgesHtml += badge(def.threshold.label, "warn");
  }
  if (def.trendFlag && data?.trend === "up4") badgesHtml += badge("4-Wk Uptrend", "warn");

  const container = document.createElement("div");
  const row = document.createElement("div");
  row.className = "metric-row";
  row.innerHTML = `
    <span class="metric-label">${def.label}</span>
    <div class="metric-value-group">
      ${deltaStr ? `<span class="metric-delta ${cls}">${deltaStr}</span>` : ""}
      <span class="metric-value ${cls}" title="${titleAttr}">${valStr}</span>
    </div>
  `;
  container.appendChild(row);

  if (badgesHtml) {
    const b = document.createElement("div");
    b.className = "panel-badges";
    b.innerHTML = badgesHtml;
    container.appendChild(b);
  }
  return container;
}

function renderManualField(field, stored) {
  const value = stored?.value ?? null;
  let badgeHtml = "";
  if (field.threshold && value != null) {
    const hit =
      (field.threshold.lt != null && value < field.threshold.lt) ||
      (field.threshold.gt != null && value > field.threshold.gt);
    if (hit) badgeHtml = badge(field.threshold.label, "warn");
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="metric-row">
      <span class="metric-label">${field.label}</span>
      <span class="metric-value neutral">${value != null ? formatNum(value) : "no data"}</span>
    </div>
    ${badgeHtml ? `<div class="panel-badges">${badgeHtml}</div>` : ""}
    <div class="manual-note">${field.note}${stored?.asOf ? ` · as of ${formatFreshness(stored.asOf)}` : ""}</div>
    <div class="manual-entry-field">
      <input type="number" placeholder="enter value" step="0.1">
      <button>Save</button>
    </div>
  `;

  const input = wrapper.querySelector("input");
  const btn = wrapper.querySelector("button");
  btn.addEventListener("click", async () => {
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const saved = await postManualEntry(field.key, val);
      state.manual[field.key] = saved;
      persistState();
      renderAll();
    } catch {
      btn.textContent = "err";
      setTimeout(() => {
        btn.textContent = "Save";
        btn.disabled = false;
      }, 2000);
    }
  });

  return wrapper;
}

function renderInversionStatus() {
  const t2 = state.fred.T10Y2Y;
  const t3 = state.fred.T10Y3M;
  const inv2 = t2?.value != null && t2.value < 0;
  const inv3 = t3?.value != null && t3.value < 0;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="status-row">
      <span class="metric-label">2s10s Status</span>
      <span class="status-pill ${inv2 ? "inverted" : "normal"}">${t2?.value != null ? (inv2 ? "Inverted" : "Normal") : "No Data"}</span>
    </div>
    <div class="status-row">
      <span class="metric-label">3M10Y Status</span>
      <span class="status-pill ${inv3 ? "inverted" : "normal"}">${t3?.value != null ? (inv3 ? "Inverted" : "Normal") : "No Data"}</span>
    </div>
  `;
  if (inv2 && inv3) {
    const b = document.createElement("div");
    b.className = "panel-badges";
    b.innerHTML = badge("Recession Signal Active", "danger");
    wrap.appendChild(b);
  }
  return wrap;
}

function renderFedFeedBlock() {
  const item = state.fed?.item;
  const wrap = document.createElement("div");
  if (!item) {
    wrap.innerHTML = `<div class="section-label">Latest FOMC Release</div><div class="placeholder">no data</div>`;
    return wrap;
  }
  wrap.innerHTML = `
    <div class="section-label">Latest FOMC Release</div>
    <div class="headline-item">
      <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      <div class="headline-source">${item.pubDate || ""}${state.fed.stale ? " · stale" : ""}</div>
    </div>
  `;
  return wrap;
}

function renderHeadlinesPanel(limit) {
  const { panel, body, freshEl } = createPanel("Geopolitical Headlines");
  const items = (state.news?.items || []).slice(0, limit);

  if (!items.length) {
    body.innerHTML = `<div class="placeholder">no data</div>`;
  } else {
    const ul = document.createElement("ul");
    ul.className = "headline-list";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "headline-item";
      li.innerHTML = `
        <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
        <div class="headline-source">${item.source || ""}${item.pubDate ? " · " + item.pubDate : ""}</div>
      `;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  freshEl.textContent = state.news?.fetchedAt ? `as of ${formatFreshness(state.news.fetchedAt)}` : "—";
  if (state.news?.stale) freshEl.classList.add("stale");

  return panel;
}

// ---------- View renderers ----------

function renderHome() {
  const container = document.getElementById("view-home");
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "hero-grid";
  grid.appendChild(heroCard("VIX", state.fred.VIXCLS, METRICS.VIXCLS));
  grid.appendChild(heroCard("HY OAS Spread", state.fred.BAMLH0A0HYM2, METRICS.BAMLH0A0HYM2));
  grid.appendChild(heroCard("10Y Treasury", state.fred.DGS10, METRICS.DGS10));
  grid.appendChild(heroInversionCard());
  grid.appendChild(heroCard("S&P 500 (Prior Close)", state.fred.SP500, METRICS.SP500));
  grid.appendChild(heroCard("Initial Claims", state.fred.ICSA, METRICS.ICSA));
  container.appendChild(grid);

  const label = document.createElement("div");
  label.className = "section-label";
  label.textContent = "Top Geopolitical Headlines";
  container.appendChild(label);
  container.appendChild(renderHeadlinesPanel(3));
}

function heroCard(label, data, def) {
  const value = data?.value ?? null;
  const delta = data?.delta ?? null;
  const cls = value == null ? "neutral" : metricColorClass(delta, def.good);
  const valStr = value != null ? `${formatNum(value)}${def.unit ? " " + def.unit : ""}` : "no data";
  const deltaStr = delta != null ? `${arrow(delta)} ${formatNum(Math.abs(delta))}` : "";

  let badgeHtml = "";
  if (def.threshold && value != null && def.threshold.gt != null && value > def.threshold.gt) {
    badgeHtml += badge(def.threshold.label, "danger");
  }
  if (def.trendFlag && data?.trend === "up4") badgeHtml += badge("4-Wk Uptrend", "warn");

  const card = document.createElement("div");
  card.className = "hero-card";
  card.innerHTML = `
    <div class="hero-label">${label}</div>
    <div class="hero-value ${cls}">${valStr}</div>
    ${deltaStr ? `<div class="hero-delta ${cls}">${deltaStr}</div>` : ""}
    ${badgeHtml ? `<div class="panel-badges" style="padding-top:6px">${badgeHtml}</div>` : ""}
    <div class="hero-asof">${data?.date ? "as of " + formatFreshness(data.date) : ""}${data?.stale ? " · stale" : ""}</div>
  `;
  return card;
}

function heroInversionCard() {
  const t2 = state.fred.T10Y2Y;
  const t3 = state.fred.T10Y3M;
  const inv2 = t2?.value != null && t2.value < 0;
  const inv3 = t3?.value != null && t3.value < 0;

  const card = document.createElement("div");
  card.className = "hero-card span-2";
  card.innerHTML = `
    <div class="hero-label">Yield Curve</div>
    <div class="status-row"><span class="metric-label">2s10s</span><span class="status-pill ${inv2 ? "inverted" : "normal"}">${t2?.value != null ? (inv2 ? "Inverted" : "Normal") : "No Data"}</span></div>
    <div class="status-row"><span class="metric-label">3M10Y</span><span class="status-pill ${inv3 ? "inverted" : "normal"}">${t3?.value != null ? (inv3 ? "Inverted" : "Normal") : "No Data"}</span></div>
    ${inv2 && inv3 ? `<div class="panel-badges" style="padding-top:8px">${badge("Recession Signal Active", "danger")}</div>` : ""}
  `;
  return card;
}

function renderTabView(tab) {
  const container = document.getElementById(`view-${tab.id}`);
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";

  const { panel, body, freshEl } = createPanel(tab.label);
  const dates = [];
  let stale = false;

  if (tab.inversionCheck) body.appendChild(renderInversionStatus());

  (tab.fred || []).forEach((id) => {
    const data = state.fred[id];
    if (data?.date) dates.push(data.date);
    if (data?.stale) stale = true;
    body.appendChild(renderMetricRow(METRICS[id], data));
  });

  (tab.eia || []).forEach((id) => {
    const data = state.eia[id];
    if (data?.date) dates.push(data.date);
    if (data?.stale) stale = true;
    body.appendChild(renderMetricRow(EIA_METRICS[id], data));
  });

  if (tab.fedFeed) body.appendChild(renderFedFeedBlock());

  if (tab.manual) {
    tab.manual.forEach((key) => {
      body.appendChild(renderManualField(MANUAL_FIELDS[key], state.manual[key]));
    });
  }

  dates.sort();
  freshEl.textContent = dates.length ? `as of ${formatFreshness(dates[dates.length - 1])}` : "—";
  if (stale) freshEl.classList.add("stale");

  grid.appendChild(panel);
  if (tab.news) grid.appendChild(renderHeadlinesPanel(20));

  container.appendChild(grid);
}

function renderAll() {
  renderHome();
  TABS.forEach(renderTabView);
}

// ---------- Navigation ----------

function buildNavAndViews() {
  const tabsNav = document.getElementById("tabs");
  const views = document.getElementById("views");
  tabsNav.innerHTML = "";
  views.innerHTML = "";

  const homeBtn = document.createElement("button");
  homeBtn.className = "tab-btn active";
  homeBtn.textContent = "Home";
  homeBtn.dataset.view = "home";
  tabsNav.appendChild(homeBtn);

  const homeView = document.createElement("div");
  homeView.id = "view-home";
  homeView.className = "view active";
  views.appendChild(homeView);

  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.textContent = tab.label;
    btn.dataset.view = tab.id;
    tabsNav.appendChild(btn);

    const view = document.createElement("div");
    view.id = `view-${tab.id}`;
    view.className = "view";
    views.appendChild(view);
  });

  tabsNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    tabsNav.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    views.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
  });
}

// ---------- Refresh / health / init ----------

async function refreshAll() {
  const icon = document.getElementById("refresh-icon");
  const btn = document.getElementById("refresh-btn");
  icon.classList.add("spinning");
  btn.disabled = true;

  const [fred, eia, news, fed, naaim, umichPrelim, umichFinal] = await Promise.all([
    fetchFred(),
    fetchEia(),
    fetchNews(),
    fetchFedRss(),
    fetchManualEntry("naaim"),
    fetchManualEntry("umich_prelim"),
    fetchManualEntry("umich_final"),
  ]);

  if (fred) state.fred = fred;
  if (eia) state.eia = eia;
  if (news) state.news = news;
  if (fed) state.fed = fed;
  state.manual.naaim = naaim;
  state.manual.umich_prelim = umichPrelim;
  state.manual.umich_final = umichFinal;
  state.fetchedAt = new Date().toISOString();

  persistState();
  renderAll();

  document.getElementById("last-refresh").textContent = `refreshed ${new Date().toLocaleTimeString()}`;
  icon.classList.remove("spinning");
  btn.disabled = false;
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
  buildNavAndViews();

  const persisted = loadPersistedState();
  if (persisted) {
    state = { ...state, ...persisted };
    document.getElementById("last-refresh").textContent = state.fetchedAt
      ? `cached · ${new Date(state.fetchedAt).toLocaleTimeString()}`
      : "—";
  }
  renderAll();

  document.getElementById("refresh-btn").addEventListener("click", refreshAll);

  refreshAll();
  checkHealth();
}

document.addEventListener("DOMContentLoaded", init);
