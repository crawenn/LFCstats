const CSV_URL = new URL("./data/latest.csv", window.location.href).toString();

const statusEl = document.getElementById("status");
const filterInput = document.getElementById("teamFilter");
const deltaToggle = document.getElementById("deltaToggle");

let baseRows = [];
let leagueAvg = null;

function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function mean(values) {
  const nums = values.filter(v => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function convToNum(convStr) {
  return toNumberOrNull(convStr); // "13.16%" -> 13.16
}

function fmtDelta(cell, normalDecimals = 2, deltaDecimals = 2, {forceSignInDelta=true} = {}) {
  const v = cell.getValue();
  if (v === null || v === undefined || v === "") return "";

  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);

  const isDelta = !!cell.getRow().getData()._isDelta;
  const decimals = isDelta ? deltaDecimals : normalDecimals;

  const s = n.toFixed(decimals);

  if (isDelta && forceSignInDelta) {
    if (n > 0) return `+${s}`;
    return s;
  }

  return s;
}



function computeLeagueAvg(rows) {
  return {
    team: "League Average",
    played: null, // keep clean; played is usually identical anyway
    goals: mean(rows.map(r => r.goals)),
    xg: mean(rows.map(r => r.xg)),
    goals_vs_xg: mean(rows.map(r => r.goals_vs_xg)),
    shots: mean(rows.map(r => r.shots)),
    sot: mean(rows.map(r => r.sot)),
    conv: (() => {
      const m = mean(rows.map(r => convToNum(r.conv)));
      return m == null ? "" : `${m.toFixed(2)}%`;
    })(),
    xg_per_shot: mean(rows.map(r => r.xg_per_shot)),
    SOT_per_shot: mean(rows.map(r => r.SOT_per_shot)),
    _isAvg: true,
    _sortKey: 0
  };
}

function withDeltas(rows, avg) {
  return rows.map(r => {
    if (r._isAvg) return r;

    return {
      ...r,
      goals: (r.goals ?? 0) - (avg.goals ?? 0),
      xg: (r.xg ?? 0) - (avg.xg ?? 0),
      goals_vs_xg: (r.goals_vs_xg ?? 0) - (avg.goals_vs_xg ?? 0),
      shots: (r.shots ?? 0) - (avg.shots ?? 0),
      sot: (r.sot ?? 0) - (avg.sot ?? 0),
      conv: (() => {
        const rc = convToNum(r.conv);
        const ac = convToNum(avg.conv);
        if (rc == null || ac == null) return "";
        const d = rc - ac;
        return `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`;
      })(),
      xg_per_shot: (r.xg_per_shot ?? 0) - (avg.xg_per_shot ?? 0),
      SOT_per_shot: (r.SOT_per_shot ?? 0) - (avg.SOT_per_shot ?? 0),
      _isDelta: true,
    };
  });
}

async function loadCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors && parsed.errors.length) {
    console.error("CSV parse errors:", parsed.errors);
    throw new Error("CSV parse error");
  }

  return parsed.data.map(r => ({
    team: (r.team ?? "").toString().trim(),
    played: toNumberOrNull(r.played),
    goals: toNumberOrNull(r.goals),
    xg: toNumberOrNull(r.xg),
    goals_vs_xg: toNumberOrNull(r.goals_vs_xg),
    shots: toNumberOrNull(r.shots),
    sot: toNumberOrNull(r.sot),
    conv: (r.conv ?? "").toString().trim(),
    xg_per_shot: toNumberOrNull(r.xg_per_shot),
    SOT_per_shot: toNumberOrNull(r.SOT_per_shot),
    _sortKey: 1
  })).filter(r => r.team);
}

if (typeof Tabulator === "undefined") throw new Error("Tabulator failed to load (CDN blocked?)");
if (typeof Papa === "undefined") throw new Error("PapaParse failed to load (CDN blocked?)");

const table = new Tabulator("#table", {
  //height: "75vh",
  layout: "fitColumns",
  responsiveLayout: "collapse",
  placeholder: "No data loaded.",
  initialSort: [{ column: "_sortKey", dir: "desc" }],

  rowFormatter: function (row) {
    const d = row.getData();
    if (d._isAvg) {
      row.getElement().style.background = "rgba(255,255,255,0.06)";
      row.getElement().style.fontWeight = "700";
      row.getElement().style.borderTop = "1px solid rgba(255,255,255,0.25)"
    }
  },

  columns: [
    {
      title: "Team",
      field: "team",
      headerSort: true,
      widthGrow: 2,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        if (d._isAvg) return `<strong>${cell.getValue()}</strong>`;
        return cell.getValue();
      }
    },

    { field: "_sortKey", visible: false, sorter: "number" },
    { title: "P", field: "played", sorter: "number", hozAlign: "center"},
    { title: "G", field: "goals", sorter: "number", hozAlign: "center", formatter: (cell) => fmtDelta(cell, 0, 2) },

    { title: "xG", field: "xg", sorter: "number", hozAlign: "center", formatter: (cell) => fmtDelta(cell, 2) },

    { title: "G − xG", field: "goals_vs_xg", sorter: "number", hozAlign: "center", formatter: (cell) => fmtDelta(cell, 2) },

    { title: "Shots", field: "shots", sorter: "number", hozAlign: "center", formatter: fmtDelta },
    { title: "SoT", field: "sot", sorter: "number", hozAlign: "center", formatter: fmtDelta },

    {
      title: "Conv%",
      field: "conv",
      hozAlign: "center",
      sorter: (a, b) => (toNumberOrNull(a) ?? 0) - (toNumberOrNull(b) ?? 0),
      formatter: (cell) => {
        const raw = String(cell.getValue() ?? "").trim();
        if (!raw) return "";
        return raw.includes("%") ? raw : `${toNumberOrNull(raw)?.toFixed(2) ?? ""}%`;
      }
    },

    { title: "xG/Shot", field: "xg_per_shot", sorter: "number", hozAlign: "center", formatter: (cell) => fmtDelta(cell, 2) },
    { title: "Shots/SoT", field: "SOT_per_shot", sorter: "number", hozAlign: "center", formatter: (cell) => fmtDelta(cell, 2) },
  ],
});

let currentQuery = "";

filterInput.addEventListener("input", () => {
  const q = filterInput.value.trim().toLowerCase();

  if (!q) {
    table.clearFilter();
    return;
  }

  table.setFilter((data) => {
    if (data._isAvg === true) return true;              // always keep League Average
    const team = (data.team ?? "").toLowerCase();
    return team.includes(q);
  });
});

function applyFilter() {
  if (!currentQuery) {
    table.clearFilter();
    return;
  }

  table.setFilter([
    [{ field: "_isAvg", type: "=", value: true }],
    [{ field: "team", type: "like", value: currentQuery }],
  ]);
}


function renderTable() {
  const rowsWithAvg = [leagueAvg, ...baseRows];
  const data = (deltaToggle && deltaToggle.checked)
    ? withDeltas(rowsWithAvg, leagueAvg)
    : rowsWithAvg;

  table.setData(data);
}

// Toggle handler (safe if clicked early)
if (deltaToggle) {
  deltaToggle.addEventListener("change", () => {
    if (!leagueAvg || !baseRows.length) return;
    renderTable();
  });
}

// Load + render
(async () => {
  try {
    statusEl.textContent = "Loading…";
    baseRows = await loadCsv(CSV_URL);
    leagueAvg = computeLeagueAvg(baseRows);

    renderTable();
    statusEl.textContent = `Loaded: ${baseRows.length} teams`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Load failed (check CSV path / parse)";
  }
})();
