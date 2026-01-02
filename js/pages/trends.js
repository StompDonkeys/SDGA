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

function trendClassAndSymbol(series, threshold = 1) {
  // series: [{x,y}] sorted asc
  if (!series || series.length < 6) return { cls: "trend-neutral", sym: "↕" };
  const last = series.slice(-4).map(p => p.y);
  const prev = series.slice(-8, -4).map(p => p.y);
  if (prev.length < 4) return { cls: "trend-neutral", sym: "↕" };
  const lastAvg = last.reduce((s,v)=>s+v,0) / last.length;
  const prevAvg = prev.reduce((s,v)=>s+v,0) / prev.length;
  const diff = lastAvg - prevAvg;
  if (diff > threshold) return { cls: "trend-up", sym: "↑" };
  if (diff < -threshold) return { cls: "trend-down", sym: "↓" };
  return { cls: "trend-neutral", sym: "↕" };
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

  function updateSummary(points, metric, selectedPlayer, selectedCourseLayout) {
    if (!points.length) {
      summaryRounds.textContent = "0";
      summaryBest.textContent = "–";
      summaryAvg.innerHTML = "–";
      summaryLatest.textContent = "–";
      return;
    }

    summaryRounds.textContent = String(points.length);

    const ys = points.map((p) => p.y);

    // Best + Latest remain metric-specific
    const best = metric === "rating" ? Math.max(...ys) : Math.min(...ys);
    const latest = ys[ys.length - 1];

    summaryBest.textContent = fmtNumber(best, metric === "rating" ? 0 : 1);
    summaryLatest.textContent = fmtNumber(latest, metric === "rating" ? 0 : 1);

    if (metric !== "rating") {
      // For +/- keep the "Average" card as average +/- with a trend arrow
      const avg = ys.reduce((s, v) => s + v, 0) / ys.length;
      const series = points.map(p => ({ x: p.x, y: p.y }));
      const t = trendClassAndSymbol(series, 0.5);
      summaryAvg.innerHTML = `${fmtNumber(avg, 1)} <span class="trend-arrow ${t.cls}">${t.sym}</span>`;
      return;
    }

    // Rating metric: show "current rating" for selected course + overall (all courses) for player.
    const courseDisc = computeDiscRatingSeries(points);
    const courseCurrent = courseDisc.length ? courseDisc[courseDisc.length - 1].y : 0;
    const courseTrend = trendClassAndSymbol(courseDisc, 1);

    const { course, layout } = parseCourseLayout(selectedCourseLayout);

    // Overall ratings for the player across all courses/layouts
    const overallPoints = playerRows
      .filter(r => r.PlayerName === selectedPlayer)
      .map(r => ({ x: parseCustomDate(r.StartDate), y: parseInt(r.RoundRating, 10) || 0 }))
      .sort((a,b) => a.x - b.x);

    const overallDisc = computeDiscRatingSeries(overallPoints);
    const overallCurrent = overallDisc.length ? overallDisc[overallDisc.length - 1].y : 0;
    const overallTrend = trendClassAndSymbol(overallDisc, 1);

    summaryAvg.innerHTML = `
      <div class="summary-split">
        <div class="summary-line">
          <span class="summary-sub">${course}</span>
          <span class="value">${fmtNumber(courseCurrent, 0)} <span class="trend-arrow ${courseTrend.cls}">${courseTrend.sym}</span></span>
        </div>
        <div class="summary-line">
          <span class="summary-sub">Overall</span>
          <span class="value">${fmtNumber(overallCurrent, 0)} <span class="trend-arrow ${overallTrend.cls}">${overallTrend.sym}</span></span>
        </div>
      </div>
    `;
  }

  
  function renderHoleTable(selectedPlayer, selectedCourseLayout) {
    if (!holeHead || !holeBody) return;

    const { course, layout } = parseCourseLayout(selectedCourseLayout);

    const titleEl = document.getElementById("holeTableTitle");
    if (titleEl) titleEl.textContent = `Hole stats — ${course} (${layout})`;

    const playerCourseRows = playerRows
      .filter(r => r.PlayerName === selectedPlayer && r.CourseName === course && r.LayoutName === layout);

    const parRow = parRows.find(r => r.CourseName === course && r.LayoutName === layout);

    const parHoles = parRow ? extractHoleScores(parRow) : [];
    const holeCount = parHoles.length ? parHoles.length : 18;

    const parVals = Array.from({length: holeCount}, (_,i) => parHoles[i]?.score ?? 3);

    // Collect per-hole stats
    const scoresByHole = Array.from({length: holeCount}, () => []);
    playerCourseRows.forEach(r => {
      const holes = extractHoleScores(r);
      holes.forEach((h, idx) => {
        if (idx < holeCount) scoresByHole[idx].push(h.score);
      });
    });

    const bestVals = scoresByHole.map(arr => arr.length ? Math.min(...arr) : null);
    const avgVals = scoresByHole.map(arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length) : null);

    const isMobile = window.innerWidth <= 600;

    if (isMobile) {
      // Vertical layout: one row per hole (better on iPhone)
      holeHead.innerHTML = "<tr><th>Hole</th><th>Par</th><th>Best</th><th>Avg</th></tr>";
      const rows = Array.from({length: holeCount}, (_,i) => {
        const par = parVals[i];
        const best = bestVals[i];
        const avg = avgVals[i];

        const bestCls = best === null ? "" : scoreClass(best, par);
        // For avg, round for class, but display 1dp
        const avgCls = avg === null ? "" : scoreClass(Math.round(avg), par);

        return `<tr>
          <td><strong>H${i+1}</strong></td>
          <td>${par}</td>
          <td class="${bestCls}">${best === null ? "–" : best}</td>
          <td class="${avgCls}">${avg === null ? "–" : fmtNumber(avg, 1)}</td>
        </tr>`;
      }).join("");
      holeBody.innerHTML = rows;
      return;
    }

    // Desktop/tablet: wide horizontal layout
    holeHead.innerHTML = "<th>Metric</th>" + Array.from({length: holeCount}, (_,i) => `<th>H${i+1}</th>`).join("");

    function rowHtml(label, values, formatter, isAvg=false) {
      const tds = values.map((v, i) => {
        const par = parVals[i];
        const cls = v === null ? "" : scoreClass(isAvg ? Math.round(v) : v, par);
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
    updateSummary(points, metric, selectedPlayer, selectedCourseLayout);

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
