// ── Time helpers (stateless, no class needed) ─────────────────────────────────
function codeToTimestamp(code) {
  const y    = parseInt(code);
  const tail = code.substring(4).replace(/\D+/, "");
  if (!tail)            return y * 12 + 11;
  const n = parseInt(tail);
  return tail.length === 1 ? y * 12 + (n * 3 - 1) : y * 12 + (n - 1);
}

function timestampToLabel(ts) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[ts % 12] + " " + Math.floor(ts / 12);
}

// ── SSBChart ──────────────────────────────────────────────────────────────────
// Owns one chart panel: its table, metadata, UI controls, and Chart.js instance.

class SSBChart {
  constructor(suffix, initialTable) {
    this.suffix   = suffix;
    this.table    = initialTable;
    this.metadata = null;
    this.chart    = null;
  }

  // ── Getters for DOM elements ------------------------------------------------
  get(id)        { return document.getElementById(id + this.suffix); }
  getVal(id)     { return this.get(id)?.value; }

  // ── Unit extracted from metadata -------------------------------------------
  get unit() {
    const u = Object.values(this.metadata?.dimension?.ContentsCode?.category?.unit ?? {})[0];
    return u?.base || "";
  }

  // ── Metadata + UI population ------------------------------------------------
  async load(table = this.table) {
    this.table    = table;
    this.metadata = await fetch(
      `https://data.ssb.no/api/pxwebapi/v2/tables/${this.table}/metadata`
    ).then(r => r.json());
    this._populateTime();
    this._buildDimensions();
  }

  _populateTime() {
    const times = Object.entries(this.metadata.dimension.Tid.category.label);
    const opts  = times.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    ["Tid_start", "Tid_end"].forEach(id => this.get(id).innerHTML = opts);
    this.get("Tid_start").selectedIndex = Math.max(0, times.length - 6);
    this.get("Tid_end").selectedIndex   = times.length - 1;
  }

  _buildDimensions() {
    const container = this.get("dimensionControls");
    if (!container) return;
    const dims = this.metadata.dimension;
    container.innerHTML = Object.entries(dims)
      .filter(([name]) => name !== "Tid")
      .map(([name, dim]) => `
        <div class="dim">
          <label>${dim.label}</label>
          <select id="${name + this.suffix}">
            ${Object.entries(dim.category.label)
              .map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
          </select>
        </div>`).join("");
  }

  // ── Data fetching -----------------------------------------------------------
  async fetch() {
    const dims = this.metadata.dimension;

    const contents = this.getVal("ContentsCode")
      ?? Object.keys(dims.ContentsCode.category.index)[0];

    const allTimes = Object.keys(dims.Tid.category.index);
    let s = allTimes.indexOf(this.getVal("Tid_start"));
    let e = allTimes.indexOf(this.getVal("Tid_end"));
    if (s > e) [s, e] = [e, s];

    let url = `https://data.ssb.no/api/pxwebapi/v2/tables/${this.table}/data?lang=no`
            + `&valueCodes[Tid]=${allTimes.slice(s, e + 1).join(",")}`
            + `&valueCodes[ContentsCode]=${contents}`;

    const parts = [];
    for (const [dimName, dim] of Object.entries(dims)) {
      if (dimName === "Tid") continue;
      const value = this.getVal(dimName) ?? Object.keys(dim.category.index)[0];
      if (!value) continue;
      if (dimName !== "ContentsCode") url += `&valueCodes[${dimName}]=${value}`;
      const lbl = dim.category.label[value];
      if (lbl) parts.push(lbl.split("(")[0].trim());
    }

    const json     = await fetch(url).then(r => r.json());
    const rawCodes = Object.keys(json.dimension.Tid.category.index);

    return {
      timestamps:  rawCodes.map(codeToTimestamp),
      data:        json.value,
      seriesLabel: parts.join(" - ") + (this.unit ? ` (${this.unit})` : ""),
      unit:        this.unit
    };
  }

  // ── Rendering --------------------------------------------------------------
  destroy() {
    this.chart?.destroy();
    this.chart = null;
  }

  render(canvasId, result) {
    this.destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels:   result.timestamps.map(timestampToLabel),
        datasets: [SSBChart.makeDataset(result, "#3b82f6")]
      },
      options: SSBChart.singleOptions(result.unit)
    });
  }

  // ── Static chart helpers ---------------------------------------------------
  static makeDataset(r, color, yAxisID) {
    return {
      label:           r.seriesLabel,
      data:            r.data,
      tension:         0.3,
      borderColor:     color,
      backgroundColor: color + "33",
      pointRadius:     3,
      ...(yAxisID && { yAxisID, spanGaps: true })
    };
  }

  static singleOptions(unit) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString()} ${unit}` } }
      },
      scales: {
        x: { title: { display: true, text: "Time" } },
        y: { title: { display: true, text: unit || "Value" } }
      }
    };
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
// Owns two SSBChart instances and handles compare mode + UI visibility.

class Dashboard {
  constructor() {
    this.chart1      = new SSBChart("",   "14092");
    this.chart2      = new SSBChart("_2", "14092");
    this.compareChart = null;
  }

  async init() {
    await Promise.all([this.chart1.load(), this.chart2.load()]);
  }

  // ── Visibility helper -------------------------------------------------------
  show(id, visible) {
    document.getElementById(id).style.display = visible ? "block" : "none";
  }

  // ── Run button -------------------------------------------------------------
  async run() {
    const showSecond = document.getElementById("toggleChart2").checked;
    const compare    = document.getElementById("toggleCompare").checked;

    const r1 = await this.chart1.fetch();
    const r2 = (showSecond || compare) ? await this.chart2.fetch() : null;

    this.chart1.destroy();
    this.chart2.destroy();
    this.compareChart?.destroy();
    this.compareChart = null;

    const chart1Card = document.getElementById("chart1").closest(".chart-card");

    if (compare && r2) {
      chart1Card.style.display = "none";
      this.show("chart2Card",       false);
      this.show("chartCompareCard", true);
      this._renderCompare(r1, r2);
    } else {
      this.show("chartCompareCard", false);
      chart1Card.style.display = "block";
      this.chart1.render("chart1", r1);
      this.show("chart2Card", showSecond && !!r2);
      if (showSecond && r2) this.chart2.render("chart2", r2);
    }
  }

  // ── Compare rendering -------------------------------------------------------
  _renderCompare(r1, r2) {
    const ctx = document.getElementById("chartCompare");
    if (!ctx) return;

    const allTs = [...new Set([...r1.timestamps, ...r2.timestamps])].sort((a, b) => a - b);
    const map1  = Object.fromEntries(r1.timestamps.map((ts, i) => [ts, r1.data[i]]));
    const map2  = Object.fromEntries(r2.timestamps.map((ts, i) => [ts, r2.data[i]]));

    const d1 = { ...r1, data: allTs.map(ts => map1[ts] ?? null) };
    const d2 = { ...r2, data: allTs.map(ts => map2[ts] ?? null) };
    const [unit1, unit2] = [r1.unit || "Value", r2.unit || "Value"];

    this.compareChart = new Chart(ctx, {
      type: "line",
      data: {
        labels:   allTs.map(timestampToLabel),
        datasets: [SSBChart.makeDataset(d1, "#3b82f6", "y1"), SSBChart.makeDataset(d2, "#f59e0b", "y2")]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true },
          tooltip: { callbacks: { label: c => {
            if (c.parsed.y === null) return null;
            return `${c.dataset.label}: ${c.parsed.y.toLocaleString()} ${c.datasetIndex === 0 ? unit1 : unit2}`;
          }}}
        },
        scales: {
          x:  { title: { display: true, text: "Time" } },
          y1: { position: "left",  title: { display: true, text: unit1, color: "#3b82f6" }, ticks: { color: "#3b82f6" }, grid: { color: "#33415580" } },
          y2: { position: "right", title: { display: true, text: unit2, color: "#f59e0b" }, ticks: { color: "#f59e0b" }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // ── Toggle handlers (called from HTML) -------------------------------------
  onToggleChart2(cb) {
    document.getElementById("controls_2").style.display = cb.checked ? "block" : "none";
  }

  onToggleCompare(cb) {
    if (cb.checked) {
      document.getElementById("toggleChart2").checked = true;
      document.getElementById("controls_2").style.display = "block";
    }
  }

  async onTableChange(suffix, value) {
    const chart = suffix === "" ? this.chart1 : this.chart2;
    await chart.load(value);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const dashboard = new Dashboard();
dashboard.init();

// Thin global shims so HTML onclick= attributes still work
const handleFetch      = ()       => dashboard.run();
const onToggleChart2   = cb       => dashboard.onToggleChart2(cb);
const onToggleCompare  = cb       => dashboard.onToggleCompare(cb);
const onTableChange    = (s, v)   => dashboard.onTableChange(s, v);
