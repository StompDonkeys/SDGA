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

// ── Rolling averages ──
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

/** Rolling average of last N points for +/- trend line */
function computeRollingAvg(points, windowSize = 10) {
  const series = [];
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - windowSize + 1), i + 1).map(p => p.y);
    const avg = window.reduce((s, v) => s + v, 0) / window.length;
    series.push({ x: points[i].x, y: Number(avg.toFixed(2)) });
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

// ── Metric calculations ──
function calcBirdieToBogey(rounds, parIndex) {
  let birdies = 0, birdieThenBogey = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    for (let i = 1; i <= 17; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      const nextScore = parseInt(round[`Hole${i + 1}`], 10);
      const nextPar = parseInt(pars[`Hole${i + 1}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      if (!Number.isFinite(nextScore) || !Number.isFinite(nextPar)) continue;
      if (score < par) { birdies++; if (nextScore > nextPar) birdieThenBogey++; }
    }
  });
  if (birdies === 0) return { pct: 0, birdies: 0, followedByBogey: 0 };
  return { pct: (birdieThenBogey / birdies) * 100, birdies, followedByBogey: birdieThenBogey };
}

function calcBounceBack(rounds, parIndex) {
  let bogeys = 0, bounceBack = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    for (let i = 1; i <= 17; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      const nextScore = parseInt(round[`Hole${i + 1}`], 10);
      const nextPar = parseInt(pars[`Hole${i + 1}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      if (!Number.isFinite(nextScore) || !Number.isFinite(nextPar)) continue;
      if (score > par) { bogeys++; if (nextScore <= nextPar) bounceBack++; }
    }
  });
  if (bogeys === 0) return { pct: 0, bogeys: 0, bouncedBack: 0 };
  return { pct: (bounceBack / bogeys) * 100, bogeys, bouncedBack: bounceBack };
}

function calcParOrBetter(rounds, parIndex) {
  let total = 0, parOrBetter = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    for (let i = 1; i <= 18; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      total++;
      if (score <= par) parOrBetter++;
    }
  });
  if (total === 0) return { pct: 0, total: 0, parOrBetter: 0 };
  return { pct: (parOrBetter / total) * 100, total, parOrBetter };
}

function calcCleanCardRate(rounds, parIndex) {
  let eligible = 0, clean = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    eligible++;
    let hasBogey = false;
    for (let i = 1; i <= 18; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      if (score > par) { hasBogey = true; break; }
    }
    if (!hasBogey) clean++;
  });
  if (eligible === 0) return { pct: 0, eligible: 0, clean: 0 };
  return { pct: (clean / eligible) * 100, eligible, clean };
}

function calcScoringDistribution(rounds, parIndex) {
  const dist = { ace: 0, eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0 };
  let total = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    for (let i = 1; i <= 18; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      total++;
      const diff = score - par;
      if (score === 1) dist.ace++;
      else if (diff <= -2) dist.eagle++;
      else if (diff === -1) dist.birdie++;
      else if (diff === 0) dist.par++;
      else if (diff === 1) dist.bogey++;
      else dist.doublePlus++;
    }
  });
  return { dist, total };
}

function calcFront9vsBack9(rounds, parIndex) {
  let front9Total = 0, front9Sum = 0, back9Total = 0, back9Sum = 0;
  rounds.forEach(round => {
    const pars = parIndex[`${round.CourseName}|||${round.LayoutName || ""}`];
    if (!pars) return;
    for (let i = 1; i <= 18; i++) {
      const score = parseInt(round[`Hole${i}`], 10);
      const par = parseInt(pars[`Hole${i}`], 10);
      if (!Number.isFinite(score) || !Number.isFinite(par)) continue;
      const diff = score - par;
      if (i <= 9) { front9Sum += diff; front9Total++; }
      else { back9Sum += diff; back9Total++; }
    }
  });
  return {
    front9: front9Total ? (front9Sum / (front9Total / 9)).toFixed(1) : "N/A",
    back9: back9Total ? (back9Sum / (back9Total / 9)).toFixed(1) : "N/A",
    front9Avg: front9Total ? front9Sum / front9Total : null,
    back9Avg: back9Total ? back9Sum / back9Total : null,
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
  let bbChartInstance = null;
  let distChartInstance = null;
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

  // ── Destroy mini charts ──
  function destroyMiniCharts() {
    if (b2bChartInstance) { b2bChartInstance.destroy(); b2bChartInstance = null; }
    if (bbChartInstance) { bbChartInstance.destroy(); bbChartInstance = null; }
    if (distChartInstance) { distChartInstance.destroy(); distChartInstance = null; }
  }

  // ── Ring chart helper ──
  function renderRing(canvasId, filled, total, filledColor, emptyColor) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    const remaining = Math.max(0, total - filled);
    return new Chart(el.getContext("2d"), {
      type: "doughnut",
      data: {
        datasets: [{
          data: total > 0 ? [filled, remaining] : [0, 1],
          backgroundColor: [filledColor, emptyColor],
          borderWidth: 0
        }]
      },
      options: {
        responsive: false,
        cutout: "65%",
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  }

  // ── Tile rendering ──
  function renderTiles(points, metric, filtered, selectedPlayer, selectedCourseLayout) {
    if (!tilesContainer) return;
    destroyMiniCharts();

    const roundCount = points.length;
    const ys = points.map(p => p.y);
    const { course } = parseCourseLayout(selectedCourseLayout);
    const isAllCourses = course === null;

    // Best
    const best = roundCount ? (metric === "rating" ? Math.max(...ys) : Math.min(...ys)) : null;
    const bestText = best !== null ? fmtNumber(best, metric === "rating" ? 0 : 1) : "–";

    // Latest
    const latest = roundCount ? ys[ys.length - 1] : null;
    const latestText = latest !== null ? fmtNumber(latest, metric === "rating" ? 0 : 1) : "–";

    // Current rating / avg +/-
    let ratingHtml = "–";
    if (metric === "rating" && roundCount) {
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
      const avg = ys.reduce((s, v) => s + v, 0) / ys.length;
      const t = trendClassAndSymbol(points, 0.5);
      ratingHtml = `<div class="pp-tile-value">${fmtPlusMinus(avg)} <span class="trend-arrow ${t.cls}">${t.sym}</span></div>`;
    }

    // Metric calcs
    const b2b = calcBirdieToBogey(filtered, parIndex);
    const bb = calcBounceBack(filtered, parIndex);
    const pob = calcParOrBetter(filtered, parIndex);
    const ccr = calcCleanCardRate(filtered, parIndex);
    const dist = calcScoringDistribution(filtered, parIndex);
    const f9b9 = calcFront9vsBack9(filtered, parIndex);

    const b2bPct = b2b.birdies > 0 ? fmtNumber(b2b.pct, 1) + "%" : "N/A";
    const bbPct = bb.bogeys > 0 ? fmtNumber(bb.pct, 1) + "%" : "N/A";
    const pobPct = pob.total > 0 ? fmtNumber(pob.pct, 1) + "%" : "N/A";
    const ccrPct = ccr.eligible > 0 ? fmtNumber(ccr.pct, 1) + "%" : "N/A";

    // Front 9 vs Back 9 — only show for specific course
    const f9b9Html = !isAllCourses
      ? `<div class="pp-tile">
          <div class="pp-tile-label">Front 9 vs Back 9</div>
          <div class="pp-tile-value" style="font-size:1rem;">F: ${fmtPlusMinus(parseFloat(f9b9.front9))} / B: ${fmtPlusMinus(parseFloat(f9b9.back9))}</div>
          <div class="pp-tile-sub">${f9b9.front9Avg !== null && f9b9.back9Avg !== null
            ? (parseFloat(f9b9.back9) > parseFloat(f9b9.front9) ? "Fades on back 9" : parseFloat(f9b9.back9) < parseFloat(f9b9.front9) ? "Stronger on back 9" : "Consistent throughout")
            : ""}</div>
        </div>`
      : "";

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
      <div class="pp-tile">
        <div class="pp-tile-label">Par or Better</div>
        <div class="pp-tile-value">${pobPct}</div>
        <div class="pp-tile-sub">${pob.parOrBetter} of ${pob.total} holes</div>
      </div>
      <div class="pp-tile pp-tile-ring">
        <div class="pp-tile-label">Birdie-to-Bogey</div>
        <div class="pp-tile-ring-content">
          <canvas id="b2bRing" width="80" height="80"></canvas>
          <div>
            <div class="pp-tile-value">${b2bPct}</div>
            <div class="pp-tile-sub">${b2b.birdies > 0 ? `${b2b.followedByBogey} of ${b2b.birdies}` : ""}</div>
          </div>
        </div>
      </div>
      <div class="pp-tile pp-tile-ring">
        <div class="pp-tile-label">Bounce Back</div>
        <div class="pp-tile-ring-content">
          <canvas id="bbRing" width="80" height="80"></canvas>
          <div>
            <div class="pp-tile-value">${bbPct}</div>
            <div class="pp-tile-sub">${bb.bogeys > 0 ? `${bb.bouncedBack} of ${bb.bogeys}` : ""}</div>
          </div>
        </div>
      </div>
      <div class="pp-tile">
        <div class="pp-tile-label">Clean Cards</div>
        <div class="pp-tile-value">${ccrPct}</div>
        <div class="pp-tile-sub">${ccr.clean} of ${ccr.eligible} rounds</div>
      </div>
      <div class="pp-tile pp-tile-dist">
        <div class="pp-tile-label">Scoring Distribution</div>
        <canvas id="distChart" height="100"></canvas>
      </div>
      ${f9b9Html}
    `;

    // Render mini charts
    b2bChartInstance = renderRing("b2bRing", b2b.followedByBogey, b2b.birdies,
      "rgba(244, 67, 54, 0.75)", "rgba(76, 175, 80, 0.75)");
    bbChartInstance = renderRing("bbRing", bb.bouncedBack, bb.bogeys,
      "rgba(76, 175, 80, 0.75)", "rgba(244, 67, 54, 0.75)");
    renderDistChart(dist);
  }

  function renderDistChart(distData) {
    const el = document.getElementById("distChart");
    if (!el) return;
    const { dist, total } = distData;
    distChartInstance = new Chart(el.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Ace", "Eagle", "Birdie", "Par", "Bogey", "Dbl+"],
        datasets: [{
          data: [dist.ace, dist.eagle, dist.birdie, dist.par, dist.bogey, dist.doublePlus],
          backgroundColor: [
            "rgba(76, 175, 80, 0.9)",
            "rgba(76, 175, 80, 0.65)",
            "rgba(76, 175, 80, 0.4)",
            "rgba(255, 193, 7, 0.6)",
            "rgba(244, 67, 54, 0.5)",
            "rgba(244, 67, 54, 0.8)",
          ],
          borderWidth: 0,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return `${val} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: "Oswald" } } },
          y: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 10 }, stepSize: Math.max(1, Math.ceil(Math.max(dist.birdie, dist.par, dist.bogey) / 5)) } }
        }
      }
    });
  }

  // ── Hole table ──
  function renderHoleTable(selectedPlayer, selectedCourseLayout) {
    if (!holeHead || !holeBody || !holeTableSection) return;
    const { course, layout } = parseCourseLayout(selectedCourseLayout);
    if (course === null) { holeTableSection.style.display = "none"; return; }
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
        return `<tr><td><strong>H${i + 1}</strong></td><td>${par}</td><td class="${best === null ? "" : scoreClass(best, par)}">${best ?? "–"}</td><td class="${avg === null ? "" : scoreClass(Math.round(avg), par)}">${avg === null ? "–" : fmtNumber(avg, 1)}</td></tr>`;
      }).join("");
      return;
    }

    holeHead.innerHTML = "<th>Metric</th>" + Array.from({ length: holeCount }, (_, i) => `<th>H${i + 1}</th>`).join("");
    function rowHtml(label, values, formatter, isAvg = false) {
      return `<tr><td>${label}</td>${values.map((v, i) => {
        const cls = v === null ? "" : scoreClass(isAvg ? Math.round(v) : v, parVals[i]);
        return `<td class="${cls}">${v === null ? "–" : formatter(v)}</td>`;
      }).join("")}</tr>`;
    }
    holeBody.innerHTML =
      `<tr><td>Par</td>${parVals.map(p => `<td>${p}</td>`).join("")}</tr>` +
      rowHtml("Best", bestVals, v => String(v)) +
      rowHtml("Avg", avgVals, v => fmtNumber(v, 1), true);
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
      ? "Metric: Rating • Orange = Disc Rating (best 8 of last 20)"
      : "Metric: +/- • Orange = Rolling avg (last 10 rounds)";

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
    } else {
      // +/- metric: add rolling average trend line
      const rollingAvg = computeRollingAvg(points, 10);
      datasets.push({
        label: "Rolling Avg (last 10)",
        data: rollingAvg,
        borderColor: "rgba(255, 152, 0, 1)",
        backgroundColor: "rgba(255, 152, 0, 0.18)",
        fill: { target: 0, above: "rgba(244, 67, 54, 0.08)", below: "rgba(76, 175, 80, 0.08)" },
        tension: 0.3,
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
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${fmtNumber(context.raw.y, 1)}` } },
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
