import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";

// Sidebar toggle
const sidebar = document.querySelector(".sidebar");
const hamburger = document.querySelector(".hamburger");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    sidebar.style.display = sidebar.style.display === "none" ? "block" : "none";
  });
  document.querySelectorAll(".sidebar ul li a").forEach((link) => {
    link.addEventListener("click", () => { sidebar.style.display = "none"; });
  });
}

// ── Helpers ──
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
  return String(rounded);
}
function fmtPlusMinus(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n > 0 ? `+${fmtNumber(n, 1)}` : fmtNumber(n, 1);
}

function computeDiscRatingSeries(points) {
  const series = [];
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 19), i + 1).map(p => p.y).filter(v => v > 0);
    if (!window.length) { series.push({ x: points[i].x, y: 0 }); continue; }
    const sorted = window.slice().sort((a, b) => b - a);
    const top = sorted.slice(0, Math.min(8, sorted.length));
    series.push({ x: points[i].x, y: top.reduce((s, v) => s + v, 0) / top.length });
  }
  return series;
}

function extractHoleScores(row) {
  return Object.keys(row)
    .filter(k => k.startsWith("Hole"))
    .map(k => ({ hole: k, score: parseInt(row[k], 10) }))
    .filter(x => Number.isFinite(x.score))
    .sort((a, b) => parseInt(a.hole.replace("Hole", ""), 10) - parseInt(b.hole.replace("Hole", ""), 10));
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
  if (!series || series.length < 6) return { cls: "trend-neutral", sym: "↕" };
  const last = series.slice(-4).map(p => p.y);
  const prev = series.slice(-8, -4).map(p => p.y);
  if (prev.length < 4) return { cls: "trend-neutral", sym: "↕" };
  const lastAvg = last.reduce((s, v) => s + v, 0) / last.length;
  const prevAvg = prev.reduce((s, v) => s + v, 0) / prev.length;
  const diff = lastAvg - prevAvg;
  if (diff > threshold) return { cls: "trend-up", sym: "↑" };
  if (diff < -threshold) return { cls: "trend-down", sym: "↓" };
  return { cls: "trend-neutral", sym: "↕" };
}

// ── Par index ──
function buildParIndex(parRows) {
  const idx = {};
  parRows.forEach(row => {
    const key = `${row.CourseName}|||${row.LayoutName || ""}`;
    idx[key] = row;
  });
  return idx;
}

// ── Birdie-to-Bogey ──
function calcBirdieToBogey(rounds, parIndex) {
  let birdies = 0;
  let birdieThenBogey = 0;

  rounds.forEach(round => {
    const key = `${round.CourseName}|||${round.LayoutName || ""}`;
    const pars = parIndex[key];
    if (!pars) return;

    for (let i = 1; i <= 17; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      const nextScore = parseInt(round[`Hole${i + 1}`], 10);
      const nextPar = parseInt(pars[`Hole${i + 1}`], 10);

      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      if (!Number.isFinite(nextScore) || !Number.isFinite(nextPar)) continue;

      if (score < par) {
        birdies++;
        if (nextScore > nextPar) birdieThenBogey++;
      }
    }
  });

  if (birdies === 0) return { pct: 0, birdies: 0, followedByBogey: 0 };
  return {
    pct: (birdieThenBogey / birdies) * 100,
    birdies,
    followedByBogey: birdieThenBogey
  };
}

// ── Main ──
async function main() {
  const playerFilter = document.getElementById("playerFilter");
  const courseFilter = document.getElementById("courseFilter");
  const metricFilter = document.getElementById("metricFilter");
  const pointsToggle = document.getElementById("pointsToggle");
  const errorMessage = document.getElementById("errorMessage");
  const canvas = document.getElementById("performanceChart");
  const chartTitle = document.getElementById("chartTitle");
  const chartNote = document.getElementById("chartNote");
  const tilesContainer = document.getElementById("trendTiles");
  const holeHead = document.getElementById("holeStatsHead");
  const holeBody = document.getElementById("holeStatsBody");
  const holeTableSection = document.getElementById("holeTableSection");

  if (!playerFilter || !courseFilter || !metricFilter || !pointsToggle || !canvas) return;
  if (!window.Chart) { if (errorMessage) errorMessage.style.display = "block"; return; }

  let chartInstance = null;
  let b2bChartInstance = null;
  const ctx = canvas.getContext("2d");

  const allowedPlayers = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

  let rows = await loadRounds({ filterComplete: true, includePlayers: [...allowedPlayers, "Par"] });
  rows = rows.filter(r => !/Gold Creek Course 1-9/i.test(r.CourseName));

  const playerRows = rows.filter(r => r.PlayerName !== "Par");
  const parRows = rows.filter(r => r.PlayerName === "Par");
  const parIndex = buildParIndex(parRows);

  const players = uniqSorted(playerRows.map(r => r.PlayerName));
  playerFilter.innerHTML = players.map(p => `<option value="${p}">${p}</option>`).join("");

  const courseLayoutValues = uniqSorted(playerRows.map(r => `${r.CourseName} — ${r.LayoutName}`));
  courseFilter.innerHTML = `<option value="__ALL__">All Courses</option>` +
    courseLayoutValues.map(v => `<option value="${v}">${v}</option>`).join("");

  playerFilter.value = players[0] || "";
  courseFilter.value = "__ALL__";

  const playerColours = {
    ArmyGeddon: "rgba(25, 118, 210, 1)",
    Jobby: "rgba(56, 142, 60, 1)",
    Youare22: "rgba(245, 124, 0, 1)",
    Miza: "rgba(123, 31, 162, 1)",
    Bucis: "rgba(198, 40, 40, 1)",
  };

  function parseCourseLayout(value) {
    if (value === "__ALL__") return { course: null, layout: null };
    const parts = String(value).split(" — ");
    return { course: parts[0] || "", layout: parts.slice(1).join(" — ") || "" };
  }

  function getFilteredRounds(selectedPlayer, selectedCourseLayout) {
    const { course, layout } = parseCourseLayout(selectedCourseLayout);
    return playerRows.filter(r => {
      if (r.PlayerName !== selectedPlayer) return false;
      if (course !== null && (r.CourseName !== course || r.LayoutName !== layout)) return false;
      return true;
    });
  }

  function buildPoints(filtered, metric) {
    return filtered
      .map(r => {
        const x = parseCustomDate(r.StartDate);
        const y = metric === "rating" ? parseInt(r.RoundRating, 10) || 0 : parseInt(r["+/-"], 10) || 0;
        return { x, y };
      })
      .sort((a, b) => a.x - b.x);
  }

  // ── Tile rendering ──
  function statTile(label, value, sub, extraHtml) {
    return `<div class="pp-tile">
      <div class="pp-tile-label">${label}</div>
      <div class="pp-tile-value">${value}</div>
      ${sub ? `<div class="pp-tile-sub">${sub}</div>` : ""}
      ${extraHtml || ""}
    </div>`;
  }

  function renderTiles(points, metric, filtered, selectedPlayer, selectedCourseLayout) {
    if (!tilesContainer) return;

    const roundCount = points.length;
    const ys = points.map(p => p.y);

    // Best
    const best = roundCount ? (metric === "rating" ? Math.max(...ys) : Math.min(...ys)) : null;
    const bestText = best !== null ? fmtNumber(best, metric === "rating" ? 0 : 1) : "–";

    // Latest
    const latest = roundCount ? ys[ys.length - 1] : null;
    const latestText = latest !== null ? fmtNumber(latest, metric === "rating" ? 0 : 1) : "–";

    // Average +/-
    const avg = roundCount ? ys.reduce((s, v) => s + v, 0) / ys.length : null;

    // Current rating
    let ratingHtml = "–";
    if (metric === "rating" && roundCount) {
      const { course } = parseCourseLayout(selectedCourseLayout);
      const courseDisc = computeDiscRatingSeries(points);
      const courseCurrent = courseDisc.length ? courseDisc[courseDisc.length - 1].y : 0;
      const courseTrend = trendClassAndSymbol(courseDisc, 1);

      const overallPoints = playerRows
        .filter(r => r.PlayerName === selectedPlayer)
        .map(r => ({ x: parseCustomDate(r.StartDate), y: parseInt(r.RoundRating, 10) || 0 }))
        .sort((a, b) => a.x - b.x);
      const overallDisc = computeDiscRatingSeries(overallPoints);
      const overallCurrent = overallDisc.length ? overallDisc[overallDisc.length - 1].y : 0;
      const overallTrend = trendClassAndSymbol(overallDisc, 1);

      const courseLabel = course || "All Courses";
      ratingHtml = `
        <div class="pp-tile-value">${fmtNumber(courseCurrent, 0)} <span class="trend-arrow ${courseTrend.cls}">${courseTrend.sym}</span></div>
        <div class="pp-tile-sub">${courseLabel}</div>
        <div class="pp-tile-sub" style="margin-top:4px;">Overall: ${fmtNumber(overallCurrent, 0)} <span class="trend-arrow ${overallTrend.cls}">${overallTrend.sym}</span></div>
      `;
    } else if (metric !== "rating" && roundCount) {
      const t = trendClassAndSymbol(points, 0.5);
      ratingHtml = `<div class="pp-tile-value">${fmtPlusMinus(avg)} <span class="trend-arrow ${t.cls}">${t.sym}</span></div>`;
    }

    // Birdie-to-Bogey
    const b2b = calcBirdieToBogey(filtered, parIndex);
    const b2bPctText = b2b.birdies > 0 ? fmtNumber(b2b.pct, 1) + "%" : "N/A";
    const b2bSub = b2b.birdies > 0 ? `${b2b.followedByBogey} of ${b2b.birdies} birdies` : "";

    tilesContainer.innerHTML = `
      <div class="pp-tile">
        <div class="pp-tile-label">Rounds</div>
        <div class="pp-tile-value">${roundCount}</div>
      </div>
      <div class="pp-tile">
        <div class="pp-tile-label">Best</div>
        <div class="pp-tile-value">${bestText}</div>
      </div>
      <div class="pp-tile">
        <div class="pp-tile-label">${metric === "rating" ? "Current Rating" : "Avg +/-"}</div>
        ${ratingHtml}
      </div>
      <div class="pp-tile">
        <div class="pp-tile-label">Latest</div>
        <div class="pp-tile-value">${latestText}</div>
      </div>
      <div class="pp-tile pp-tile-b2b">
        <div class="pp-tile-label">Birdie-to-Bogey</div>
        <div class="pp-tile-b2b-content">
          <canvas id="b2bRingChart" width="90" height="90"></canvas>
          <div class="pp-tile-b2b-text">
            <div class="pp-tile-value">${b2bPctText}</div>
            <div class="pp-tile-sub">${b2bSub}</div>
          </div>
        </div>
      </div>
    `;

    // Render ring chart
    renderB2bRing(b2b);
  }

  function renderB2bRing(b2b) {
    if (b2bChartInstance) { b2bChartInstance.destroy(); b2bChartInstance = null; }
    const ringCanvas = document.getElementById("b2bRingChart");
    if (!ringCanvas) return;
    const ringCtx = ringCanvas.getContext("2d");

    const followed = b2b.followedByBogey;
    const kept = Math.max(0, b2b.birdies - followed);

    b2bChartInstance = new Chart(ringCtx, {
      type: "doughnut",
      data: {
        labels: ["Followed by Bogey", "Kept"],
        datasets: [{
          data: b2b.birdies > 0 ? [followed, kept] : [0, 1],
          backgroundColor: ["rgba(244, 67, 54, 0.75)", "rgba(76, 175, 80, 0.75)"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: false,
        cutout: "65%",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  // ── Hole table ──
  function renderHoleTable(selectedPlayer, selectedCourseLayout) {
    if (!holeHead || !holeBody || !holeTableSection) return;

    const { course, layout } = parseCourseLayout(selectedCourseLayout);

    // Hide hole table for "All Courses"
    if (course === null) {
      holeTableSection.style.display = "none";
      return;
    }
    holeTableSection.style.display = "";

    const titleEl = document.getElementById("holeTableTitle");
    if (titleEl) titleEl.textContent = `Hole stats — ${course} (${layout})`;

    const playerCourseRows = playerRows
      .filter(r => r.PlayerName === selectedPlayer && r.CourseName === course && r.LayoutName === layout);
    const parRow = parRows.find(r => r.CourseName === course && r.LayoutName === layout);

    const parHoles = parRow ? extractHoleScores(parRow) : [];
    const holeCount = parHoles.length || 18;
    const parVals = Array.from({ length: holeCount }, (_, i) => parHoles[i]?.score ?? 3);

    const scoresByHole = Array.from({ length: holeCount }, () => []);
    playerCourseRows.forEach(r => {
      const holes = extractHoleScores(r);
      holes.forEach((h, idx) => { if (idx < holeCount) scoresByHole[idx].push(h.score); });
    });

    const bestVals = scoresByHole.map(arr => arr.length ? Math.min(...arr) : null);
    const avgVals = scoresByHole.map(arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) : null);

    const isMobile = window.innerWidth <= 600;

    if (isMobile) {
      holeHead.innerHTML = "<tr><th>Hole</th><th>Par</th><th>Best</th><th>Avg</th></tr>";
      holeBody.innerHTML = Array.from({ length: holeCount }, (_, i) => {
        const par = parVals[i], best = bestVals[i], avg = avgVals[i];
        const bestCls = best === null ? "" : scoreClass(best, par);
        const avgCls = avg === null ? "" : scoreClass(Math.round(avg), par);
        return `<tr><td><strong>H${i + 1}</strong></td><td>${par}</td><td class="${bestCls}">${best ?? "–"}</td><td class="${avgCls}">${avg === null ? "–" : fmtNumber(avg, 1)}</td></tr>`;
      }).join("");
      return;
    }

    holeHead.innerHTML = "<th>Metric</th>" + Array.from({ length: holeCount }, (_, i) => `<th>H${i + 1}</th>`).join("");

    function rowHtml(label, values, formatter, isAvg = false) {
      const tds = values.map((v, i) => {
        const cls = v === null ? "" : scoreClass(isAvg ? Math.round(v) : v, parVals[i]);
        return `<td class="${cls}">${v === null ? "–" : formatter(v)}</td>`;
      }).join("");
      return `<tr><td>${label}</td>${tds}</tr>`;
    }

    const parRowHtml = `<tr><td>Par</td>${parVals.map(p => `<td>${p}</td>`).join("")}</tr>`;
    holeBody.innerHTML = parRowHtml + rowHtml("Best", bestVals, v => String(v)) + rowHtml("Avg", avgVals, v => fmtNumber(v, 1), true);
  }

  // ── Chart update ──
  function updateChart() {
    const selectedPlayer = playerFilter.value;
    const selectedCourseLayout = courseFilter.value;
    const metric = metricFilter.value === "rating" ? "rating" : "+/-";
    const showPoints = !!pointsToggle.checked;

    if (errorMessage) errorMessage.style.display = "none";

    const filtered = getFilteredRounds(selectedPlayer, selectedCourseLayout);
    const points = buildPoints(filtered, metric);

    const { course, layout } = parseCourseLayout(selectedCourseLayout);
    const courseLabel = course ? `${course} (${layout})` : "All Courses";
    if (chartTitle) chartTitle.textContent = `${selectedPlayer} • ${courseLabel}`;
    if (chartNote) chartNote.textContent = metric === "rating"
      ? "Metric: Rating • Includes Disc Rating (best 8 of last 20)"
      : "Metric: +/-";

    // Tiles
    renderTiles(points, metric, filtered, selectedPlayer, selectedCourseLayout);

    // Hole table
    renderHoleTable(selectedPlayer, selectedCourseLayout);

    // Main chart
    const colour = playerColours[selectedPlayer] || "rgba(25, 118, 210, 1)";
    const fill = colour.replace("1)", "0.18)");

    const datasets = [{
      label: metric === "rating" ? "Round Rating" : "+/-",
      data: points,
      borderColor: colour,
      backgroundColor: fill,
      fill: false,
      tension: 0.15,
      pointRadius: showPoints ? 4 : 0,
      pointHoverRadius: showPoints ? 6 : 0,
      borderWidth: 2,
    }];

    if (metric === "rating") {
      datasets.push({
        label: "Disc Rating (best 8 of last 20)",
        data: computeDiscRatingSeries(points),
        borderColor: "rgba(255, 152, 0, 1)",
        backgroundColor: "rgba(255, 152, 0, 0.18)",
        fill: false,
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 3,
      });
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
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

  [playerFilter, courseFilter, metricFilter, pointsToggle].forEach(el => el.addEventListener("change", updateChart));
  updateChart();
}

main().catch(err => {
  console.error("Trends page error:", err);
  const msg = document.getElementById("errorMessage");
  if (msg) msg.style.display = "block";
});
