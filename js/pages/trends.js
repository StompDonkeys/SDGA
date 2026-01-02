import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";

// Standard sidebar toggle (shared behaviour)
const sidebar = document.querySelector(".sidebar");
const hamburger = document.querySelector(".hamburger");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    sidebar.style.display = sidebar.style.display === "none" ? "block" : "none";
  });

  document.querySelectorAll(".sidebar ul li a").forEach((link) => {
    link.addEventListener("click", () => {
      sidebar.style.display = "none";
    });
  });
}

function parseCustomDate(dateStr) {
  return parseUtcTimestampHHmm(dateStr) || new Date();
}

function uniqSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
}

function fmtNumber(n, dp = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const factor = Math.pow(10, dp);
  const rounded = Math.round(n * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function computeDiscRatingSeries(points) {
  // points: [{x: Date, y: roundRating}] sorted ascending
  // Disc rating: best 8 ratings from last 20 rounds (rolling per point)
  const series = [];
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 19), i + 1).map(p => p.y).filter(v => v > 0);
    if (!window.length) {
      series.push({ x: points[i].x, y: 0 });
      continue;
    }
    const sorted = window.slice().sort((a,b) => b - a); // high to low
    const top = sorted.slice(0, Math.min(8, sorted.length));
    const avg = top.reduce((s,v) => s + v, 0) / top.length;
    series.push({ x: points[i].x, y: avg });
  }
  return series;
}

function extractHoleScores(row) {
  return Object.keys(row)
    .filter((k) => k.startsWith("Hole"))
    .map((k) => ({ hole: k, score: parseInt(row[k], 10) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a,b) => parseInt(a.hole.replace("Hole",""),10) - parseInt(b.hole.replace("Hole",""),10));
}

function scoreClass(score, par) {
  if (!Number.isFinite(score) || !Number.isFinite(par)) return "";
  if (score === 1) return "ace";
  if (score === par - 2) return "eagle";
  if (score === par - 1) return "birdie";
  if (score > par) return "bogey";
  return "";
}

async function main() {
  const playerFilter = document.getElementById("playerFilter");
  const courseFilter = document.getElementById("courseFilter");
  const metricFilter = document.getElementById("metricFilter");
  const pointsToggle = document.getElementById("pointsToggle");
  const errorMessage = document.getElementById("errorMessage");
  const canvas = document.getElementById("performanceChart");

  const summaryRounds = document.getElementById("summaryRounds");
  const summaryBest = document.getElementById("summaryBest");
  const summaryAvg = document.getElementById("summaryAvg");
  const summaryLatest = document.getElementById("summaryLatest");
  const chartTitle = document.getElementById("chartTitle");
  const chartNote = document.getElementById("chartNote");

  const holeHead = document.getElementById("holeStatsHead");
  const holeBody = document.getElementById("holeStatsBody");

  if (!playerFilter || !courseFilter || !metricFilter || !pointsToggle || !canvas) return;

  if (!window.Chart) {
    console.error("Chart.js not found.");
    if (errorMessage) errorMessage.style.display = "block";
    return;
  }

  let chartInstance = null;
  const ctx = canvas.getContext("2d");

  const allowedPlayers = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

  // Load player rounds + Par rows (needed for hole table)
  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: [...allowedPlayers, "Par"],
  });

  const playerRows = rows.filter(r => r.PlayerName !== "Par");
  const parRows = rows.filter(r => r.PlayerName === "Par");

  // Players: required (no "All")
  const players = uniqSorted(playerRows.map((r) => r.PlayerName));
  playerFilter.innerHTML = players.map(p => `<option value="${p}">${p}</option>`).join("");

  // Course/Layout options: required (no "All")
  const courseLayoutValues = uniqSorted(playerRows.map((r) => `${r.CourseName} — ${r.LayoutName}`));
  courseFilter.innerHTML = courseLayoutValues.map(v => `<option value="${v}">${v}</option>`).join("");

  // Default to first alphabetic
  playerFilter.value = players[0] || "";
  courseFilter.value = courseLayoutValues[0] || "";

  const playerColours = {
    ArmyGeddon: "rgba(25, 118, 210, 1)",
    Jobby: "rgba(56, 142, 60, 1)",
    Youare22: "rgba(245, 124, 0, 1)",
    Miza: "rgba(123, 31, 162, 1)",
    Bucis: "rgba(198, 40, 40, 1)",
  };

  function parseCourseLayout(value) {
    const parts = String(value).split(" — ");
    return { course: parts[0] || "", layout: parts.slice(1).join(" — ") || "" };
  }

  function buildPoints(selectedPlayer, selectedCourseLayout, metric) {
    const { course, layout } = parseCourseLayout(selectedCourseLayout);

    const filtered = playerRows.filter(
      (r) =>
        r.PlayerName === selectedPlayer &&
        r.CourseName === course &&
        r.LayoutName === layout
    );

    return filtered
      .map((r) => {
        const x = parseCustomDate(r.StartDate);
        const y =
          metric === "rating"
            ? parseInt(r.RoundRating, 10) || 0
            : parseInt(r["+/-"], 10) || 0;
        return { x, y };
      })
      .sort((a, b) => a.x - b.x);
  }

  function updateSummary(points, metric) {
    if (!points.length) {
      summaryRounds.textContent = "0";
      summaryBest.textContent = "–";
      summaryAvg.textContent = "–";
      summaryLatest.textContent = "–";
      return;
    }

    summaryRounds.textContent = String(points.length);

    const ys = points.map((p) => p.y);
    const avg = ys.reduce((s, v) => s + v, 0) / ys.length;

    // For +/- "best" is lowest value; for rating it's highest
    const best = metric === "rating" ? Math.max(...ys) : Math.min(...ys);
    const latest = points[points.length - 1].y;

    summaryBest.textContent = fmtNumber(best, metric === "rating" ? 0 : 1);
    summaryAvg.textContent = fmtNumber(avg, metric === "rating" ? 0 : 1);
    summaryLatest.textContent = fmtNumber(latest, metric === "rating" ? 0 : 1);
  }

  function renderHoleTable(selectedPlayer, selectedCourseLayout) {
    if (!holeHead || !holeBody) return;

    const { course, layout } = parseCourseLayout(selectedCourseLayout);

    const playerCourseRows = playerRows
      .filter(r => r.PlayerName === selectedPlayer && r.CourseName === course && r.LayoutName === layout);

    const parRow = parRows.find(r => r.CourseName === course && r.LayoutName === layout);

    const parHoles = parRow ? extractHoleScores(parRow) : [];
    const holeCount = parHoles.length ? parHoles.length : 18;

    // Build head
    holeHead.innerHTML = "<th>Metric</th>" + Array.from({length: holeCount}, (_,i) => `<th>H${i+1}</th>`).join("");

    // Collect per-hole stats
    const scoresByHole = Array.from({length: holeCount}, () => []);
    playerCourseRows.forEach(r => {
      const holes = extractHoleScores(r);
      holes.forEach((h, idx) => {
        if (idx < holeCount) scoresByHole[idx].push(h.score);
      });
    });

    const parVals = Array.from({length: holeCount}, (_,i) => parHoles[i]?.score ?? 3);

    const bestVals = scoresByHole.map(arr => arr.length ? Math.min(...arr) : null);
    const avgVals = scoresByHole.map(arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length) : null);

    function rowHtml(label, values, formatter, isAvg=false) {
      const tds = values.map((v, i) => {
        const par = parVals[i];
        const scoreForClass = isAvg && v !== null ? v : v;
        const cls = v === null ? "" : scoreClass(Math.round(scoreForClass), par);
        const display = v === null ? "–" : formatter(v);
        return `<td class="${cls}">${display}</td>`;
      }).join("");
      return `<tr><td>${label}</td>${tds}</tr>`;
    }

    const parRowHtml = `<tr><td>Par</td>${parVals.map(p => `<td>${p}</td>`).join("")}</tr>`;
    const bestRowHtml = rowHtml("Best", bestVals, (v) => String(v));
    const avgRowHtml = rowHtml("Avg", avgVals, (v) => fmtNumber(v, 1), true);

    holeBody.innerHTML = parRowHtml + bestRowHtml + avgRowHtml;
  }

  function updateChart() {
    const selectedPlayer = playerFilter.value;
    const selectedCourseLayout = courseFilter.value;
    const metric = metricFilter.value === "rating" ? "rating" : "+/-";
    const showPoints = !!pointsToggle.checked;

    if (errorMessage) errorMessage.style.display = "none";

    const points = buildPoints(selectedPlayer, selectedCourseLayout, metric);
    updateSummary(points, metric);

    const { course, layout } = parseCourseLayout(selectedCourseLayout);
    if (chartTitle) chartTitle.textContent = `${selectedPlayer} • ${course} (${layout})`;
    if (chartNote) chartNote.textContent = metric === "rating"
      ? "Metric: Rating • Includes Disc Rating (best 8 of last 20)"
      : "Metric: +/-";

    renderHoleTable(selectedPlayer, selectedCourseLayout);

    const colour = playerColours[selectedPlayer] || "rgba(25, 118, 210, 1)";
    const fill = colour.replace("1)", "0.18)");

    const datasets = [
      {
        label: metric === "rating" ? "Round Rating" : "+/-",
        data: points,
        borderColor: colour,
        backgroundColor: fill,
        fill: false,
        tension: 0.15,
        pointRadius: showPoints ? 4 : 0,
        pointHoverRadius: showPoints ? 6 : 0,
        borderWidth: 2,
      },
    ];

    if (metric === "rating") {
      const discSeries = computeDiscRatingSeries(points);
      datasets.push({
        label: "Disc Rating (best 8 of last 20)",
        data: discSeries,
        borderColor: "rgba(255, 152, 0, 1)",
        backgroundColor: "rgba(255, 152, 0, 0.18)",
        fill: false,
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 3,
      });
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new window.Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: { unit: "month", tooltipFormat: "MMM dd, yyyy", displayFormats: { month: "MMM yyyy" } },
            title: { display: true, text: "Date" },
          },
          y: {
            title: { display: true, text: metric === "rating" ? "Rating" : "+/-" },
            ticks: { stepSize: metric === "rating" ? 50 : 5 },
          },
        },
        plugins: {
          legend: { position: "top" },
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw.y}` } },
        },
      },
    });
  }

  [playerFilter, courseFilter, metricFilter, pointsToggle].forEach((el) => el.addEventListener("change", updateChart));

  updateChart();
}

main().catch((err) => {
  console.error("Trends page error:", err);
  const msg = document.getElementById("errorMessage");
  if (msg) msg.style.display = "block";
});
