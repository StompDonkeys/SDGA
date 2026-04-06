// players.js
// Player profiles with dropdown select, compare mode, tiled stats, and charts.
// Rating rule: best 8 of last 20 RoundRating values.

import { toSydneyISODate, parseCalendarDate } from "../core/dates.js";
import { formatPlusMinus } from "../core/format.js";
import { loadRounds } from "../core/data.js";

// ----------------------
// Config
// ----------------------
const PLAYERS = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

const PLAYER_COLORS = {
  ArmyGeddon: "#1976d2",
  Jobby: "#388e3c",
  Youare22: "#f57c00",
  Miza: "#7b1fa2",
  Bucis: "#c62828"
};

// ----------------------
// UI helpers
// ----------------------
function getPlayerColor(name, alpha = 1) {
  const hex = PLAYER_COLORS[name] || "#555";
  if (alpha === 1) return hex;
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function convertToSydneyDate(utcDateStr) {
  return toSydneyISODate(utcDateStr);
}

function parseCustomDate(dateStr) {
  return parseCalendarDate(dateStr);
}

function getYearFromRound(round) {
  const iso = convertToSydneyDate(round.StartDate);
  return iso ? iso.slice(0, 4) : "";
}

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

// ----------------------
// Rating logic
// ----------------------
function normaliseRating(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function best8OfLast20Average(ratingsChrono) {
  const last20 = ratingsChrono.slice(-20);
  const best8 = last20.slice().sort((a, b) => b - a).slice(0, 8);
  if (!best8.length) return null;
  return best8.reduce((sum, v) => sum + v, 0) / best8.length;
}

function calculateCurrentRating(roundsNewestFirst) {
  const last20 = roundsNewestFirst.slice(0, 20);
  const ratings = last20.map((r) => normaliseRating(r.RoundRating)).filter((n) => n !== null);
  if (!ratings.length) return "N/A";
  const best8 = ratings.slice().sort((a, b) => b - a).slice(0, 8);
  if (!best8.length) return "N/A";
  return (best8.reduce((sum, v) => sum + v, 0) / best8.length).toFixed(1);
}

function calculatePreviousRating(roundsNewestFirst) {
  const last20 = roundsNewestFirst.slice(0, 20);
  const ratings = last20.map((r) => normaliseRating(r.RoundRating)).filter((n) => n !== null);
  if (!ratings.length) return "N/A";
  const sorted = ratings.slice().sort((a, b) => b - a);
  const alt8 = sorted.slice(1, 9);
  if (!alt8.length) return "N/A";
  return (alt8.reduce((sum, v) => sum + v, 0) / alt8.length).toFixed(1);
}

function getRatingMovement(current, previous) {
  if (current === "N/A" || previous === "N/A") return { text: "", cls: "" };
  const diff = Number.parseFloat(current) - Number.parseFloat(previous);
  if (!Number.isFinite(diff)) return { text: "", cls: "" };
  if (diff > 0) return { text: `+${diff.toFixed(1)}`, cls: "trend-up" };
  if (diff < 0) return { text: diff.toFixed(1), cls: "trend-down" };
  return { text: "0.0", cls: "trend-neutral" };
}

// ----------------------
// Course filter config
// ----------------------
const COURSE_FILTERS = [
  { label: "Belco", course: "John Knight Memorial Park", layout: null },
  { label: "Woden", course: "Eddison Park", layout: null },
  { label: "Weston", course: "Weston Park Disc Golf Course", layout: "White Tees" },
];

function filterByCourse(rounds, filter) {
  return rounds.filter((r) => {
    if (r.CourseName !== filter.course) return false;
    if (filter.layout && (r.LayoutName || "").trim() !== filter.layout) return false;
    return true;
  });
}

// ----------------------
// Stats helpers
// ----------------------
function countAces(rounds) {
  let count = 0;
  rounds.forEach((round) => {
    for (let i = 1; i <= 18; i++) {
      if (parseInt(round[`Hole${i}`], 10) === 1) count++;
    }
  });
  return count;
}

function getAvgPlusMinus(rounds) {
  const vals = rounds.map((r) => parseInt(r["+/-"], 10)).filter((n) => Number.isFinite(n));
  if (!vals.length) return "N/A";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function getTotalPlusMinus(rounds) {
  return rounds.map((r) => parseInt(r["+/-"], 10)).filter((n) => Number.isFinite(n)).reduce((a, b) => a + b, 0);
}

function getAvgScore(rounds) {
  const scores = rounds.map((r) => parseInt(r.Total, 10)).filter((s) => Number.isFinite(s) && s > 0);
  if (!scores.length) return "N/A";
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

/** Best round = highest rated round (not lowest score) */
function getBestRound(rounds) {
  let best = null;
  rounds.forEach((r) => {
    const rating = normaliseRating(r.RoundRating);
    if (rating === null) return;
    const total = parseInt(r.Total, 10);
    const pm = parseInt(r["+/-"], 10);
    if (!best || rating > best.rating) {
      best = {
        rating,
        total: Number.isFinite(total) ? total : null,
        pm: Number.isFinite(pm) ? pm : null,
        course: r.CourseName,
        date: convertToSydneyDate(r.StartDate)
      };
    }
  });
  return best;
}

/** Build course breakdown sub-text for a stat */
function courseBreakdownSub(rounds, statFn) {
  const lines = COURSE_FILTERS.map((f) => {
    const filtered = filterByCourse(rounds, f);
    if (!filtered.length) return null;
    const val = statFn(filtered);
    return `${f.label}: ${val}`;
  }).filter(Boolean);
  return lines.join(" · ");
}

/** Build per-course best round (highest rated) sub-text */
function courseBestRoundSub(rounds) {
  const lines = COURSE_FILTERS.map((f) => {
    const filtered = filterByCourse(rounds, f);
    const best = getBestRound(filtered);
    if (!best) return null;
    const scoreText = best.total != null ? `${best.total} ${formatPlusMinus(best.pm)}` : "";
    return `${f.label}: ${scoreText} (${best.rating})`;
  }).filter(Boolean);
  return lines.join("<br>");
}

/**
 * Birdie-to-Bogey %: Of all birdies scored, what % are immediately followed
 * by a bogey on the next hole (within the same round).
 * Requires par data from the CSV.
 */
function calcBirdieToBogey(rounds, parIndex) {
  let birdies = 0;
  let birdieThenBogey = 0;

  rounds.forEach((round) => {
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
        // This hole was a birdie (or better)
        birdies++;
        if (nextScore > nextPar) {
          // Next hole was a bogey (or worse)
          birdieThenBogey++;
        }
      }
    }
  });

  if (birdies === 0) return { pct: "N/A", birdies: 0, followedByBogey: 0 };
  return {
    pct: ((birdieThenBogey / birdies) * 100).toFixed(1) + "%",
    birdies,
    followedByBogey: birdieThenBogey
  };
}

// ----------------------
// Par index builder
// ----------------------
function buildParIndex(allRows) {
  const idx = {};
  allRows.forEach((row) => {
    if (row.PlayerName !== "Par") return;
    const key = `${row.CourseName}|||${row.LayoutName || ""}`;
    idx[key] = row;
  });
  return idx;
}

// ----------------------
// Year filtering
// ----------------------
function filterRoundsByYear(roundsNewestFirst, year) {
  if (!year || year === "All") return roundsNewestFirst;
  return roundsNewestFirst.filter((r) => getYearFromRound(r) === year);
}

function getAvailableYears(roundsNewestFirst) {
  const years = new Set();
  roundsNewestFirst.forEach((r) => {
    const y = getYearFromRound(r);
    if (y) years.add(y);
  });
  return Array.from(years).sort();
}

// ----------------------
// Chart series
// ----------------------
function buildPerRoundSeries(roundsNewestFirst) {
  const roundsChrono = roundsNewestFirst
    .slice()
    .sort((a, b) => parseCustomDate(a.StartDate) - parseCustomDate(b.StartDate));

  const points = roundsChrono
    .map((r) => {
      const rating = normaliseRating(r.RoundRating);
      if (rating === null) return null;
      return { date: convertToSydneyDate(r.StartDate), rating, round: r };
    })
    .filter(Boolean);

  const labels = points.map((p) => p.date);
  const blue = points.map((p) => Number(p.rating.toFixed(2)));

  const orange = [];
  const running = [];
  for (const p of points) {
    running.push(p.rating);
    if (running.length < 8) {
      orange.push(null);
    } else {
      const metric = best8OfLast20Average(running);
      orange.push(metric === null ? null : Number(metric.toFixed(2)));
    }
  }

  return { labels, blue, orange, points };
}

// ----------------------
// Chart creation
// ----------------------
function createPlayerChart(ctx, player, series) {
  const { labels, blue, orange, points } = series;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Round Rating",
          data: blue,
          borderColor: getPlayerColor(player),
          backgroundColor: getPlayerColor(player, 0.25),
          fill: false,
          tension: 0,
          showLine: false,
          pointRadius: 3,
          pointHoverRadius: 6
        },
        {
          label: "Rating (best 8 of last 20)",
          data: orange,
          borderColor: "rgba(255, 159, 64, 1)",
          backgroundColor: "rgba(255, 159, 64, 0.15)",
          fill: false,
          borderWidth: 3,
          tension: 0.15,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Date", color: "#2e2e2e", font: { family: "Oswald", size: 14 } },
          ticks: { color: "#2e2e2e", maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: "Rating", color: "#2e2e2e", font: { family: "Oswald", size: 14 } },
          beginAtZero: false,
          min: 90,
          max: 210,
          ticks: { color: "#2e2e2e" }
        }
      },
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#2e2e2e", font: { family: "Oswald", size: 12 } }
        },
        tooltip: {
          enabled: false,
          external: function (context) {
            const tooltip = context.tooltip;
            if (!tooltip || tooltip.opacity === 0) return;
            const dp = tooltip.dataPoints?.[0];
            if (!dp) return;
            const idx = dp.dataIndex;
            const p = points[idx];
            if (!p) return;

            let tooltipEl = document.getElementById("chartjs-tooltip");
            if (!tooltipEl) {
              tooltipEl = document.createElement("div");
              tooltipEl.id = "chartjs-tooltip";
              tooltipEl.style.cssText = "position:absolute;background:rgba(0,0,0,0.85);color:#fff;padding:8px 12px;border-radius:4px;pointer-events:none;max-width:320px;z-index:9999;";
              document.body.appendChild(tooltipEl);
            }

            tooltipEl.innerHTML = `
              <strong>Date:</strong> ${p.date}<br>
              <strong>Score:</strong> ${p.round.Total} ${formatPlusMinus(p.round["+/-"])}<br>
              <strong>Round rating:</strong> ${p.round.RoundRating || "N/A"}<br>
              <strong>Course:</strong> ${p.round.CourseName}<br>
              <hr style="border:0;border-top:1px solid rgba(255,255,255,0.2);margin:8px 0;">
              <strong>Rating (best 8 of 20):</strong> ${orange[idx] ?? "N/A"}
            `;

            const pos = context.chart.canvas.getBoundingClientRect();
            tooltipEl.style.left = pos.left + window.pageXOffset + tooltip.caretX + "px";
            tooltipEl.style.top = pos.top + window.pageYOffset + tooltip.caretY + "px";
            tooltipEl.style.opacity = 1;
          }
        },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
          pan: { enabled: true, mode: "x" }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: event.x, y: event.y });
          chart.update();
        }
      }
    }
  });

  const canvas = ctx.canvas;
  canvas.addEventListener("mouseup", () => { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update(); });
  canvas.addEventListener("touchend", () => { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update(); });

  return chart;
}

// ----------------------
// Stat tile builder
// ----------------------
function statTile(label, value, sub) {
  return `<div class="pp-tile">
    <div class="pp-tile-label">${label}</div>
    <div class="pp-tile-value">${value}</div>
    ${sub ? `<div class="pp-tile-sub">${sub}</div>` : ""}
  </div>`;
}

// ----------------------
// Render a single player panel
// ----------------------
function renderPlayerPanel(player, rounds, parIndex, panelId, chartId) {
  const container = document.getElementById(panelId);
  if (!container) return;

  const color = getPlayerColor(player);

  // Stats
  const totalRounds = rounds.length;
  const avgScore = getAvgScore(rounds);
  const avgPM = getAvgPlusMinus(rounds);
  const totalPM = getTotalPlusMinus(rounds);
  const aceCount = countAces(rounds);
  const bestRound = getBestRound(rounds);
  const currentRating = calculateCurrentRating(rounds);
  const previousRating = calculatePreviousRating(rounds);
  const movement = getRatingMovement(currentRating, previousRating);
  const b2b = calcBirdieToBogey(rounds, parIndex);

  // Course breakdowns
  const avgScoreCourses = courseBreakdownSub(rounds, getAvgScore);
  const avgPMCourses = courseBreakdownSub(rounds, getAvgPlusMinus);
  const totalPMCourses = courseBreakdownSub(rounds, (r) => formatPlusMinus(getTotalPlusMinus(r)));

  // Best round = highest rated
  const bestRoundText = bestRound
    ? `${bestRound.total} ${formatPlusMinus(bestRound.pm)}`
    : "N/A";
  const bestRoundRating = bestRound ? `Rating: ${bestRound.rating}` : "";
  const bestRoundCourseLine = bestRound ? `${bestRound.course} · ${bestRound.date}` : "";
  const bestRoundCourseSub = courseBestRoundSub(rounds);
  const bestRoundSubFull = [bestRoundRating, bestRoundCourseLine, bestRoundCourseSub].filter(Boolean).join("<br>");

  const movementHtml = movement.text
    ? `<span class="trend-arrow ${movement.cls}">${movement.text}</span>`
    : "";

  const b2bSub = b2b.birdies > 0
    ? `${b2b.followedByBogey} of ${b2b.birdies} birdies`
    : "";

  container.innerHTML = `
    <div class="pp-header" style="border-left: 4px solid ${color};">
      <h3 style="color: ${color};">${player}</h3>
    </div>
    <div class="pp-tiles">
      ${statTile("Rounds", totalRounds)}
      ${statTile("Avg Score", avgScore, avgScoreCourses)}
      ${statTile("Avg +/-", avgPM, avgPMCourses)}
      ${statTile("Total +/-", formatPlusMinus(totalPM), totalPMCourses)}
      ${statTile("Current Rating", currentRating + " " + movementHtml)}
      ${statTile("Best Round", bestRoundText, bestRoundSubFull)}
      ${statTile("Aces", aceCount)}
      ${statTile("Birdie-to-Bogey", b2b.pct, b2bSub)}
    </div>
    <div class="pp-chart-wrap">
      <canvas id="${chartId}" class="player-chart"></canvas>
    </div>
  `;

  // Create chart
  const ctx = document.getElementById(chartId)?.getContext("2d");
  if (!ctx) return null;
  const series = buildPerRoundSeries(rounds);
  return createPlayerChart(ctx, player, series);
}

// ----------------------
// Main app state
// ----------------------
let allRounds = [];
let parIndex = {};
let playerData = {};  // { name: rounds newest first }
let activeCharts = [];

function destroyCharts() {
  activeCharts.forEach((c) => c && c.destroy());
  activeCharts = [];
}

function getRoundsForPlayer(player, year) {
  const rounds = playerData[player] || [];
  return filterRoundsByYear(rounds, year);
}

function render() {
  const playerSelect = document.getElementById("playerSelect");
  const yearFilter = document.getElementById("yearFilter");
  const compareSelect = document.getElementById("compareSelect");
  const container = document.getElementById("player-profiles");

  const player = playerSelect.value;
  const year = yearFilter.value;
  const comparePlayer = compareSelect.value;

  destroyCharts();
  container.innerHTML = "";

  if (!player) return;

  const isCompare = comparePlayer && comparePlayer !== "None" && comparePlayer !== player;

  if (isCompare) {
    container.className = "pp-compare-layout";
    container.innerHTML = `
      <div class="pp-panel" id="pp-panel-left"></div>
      <div class="pp-panel" id="pp-panel-right"></div>
    `;
    const roundsLeft = getRoundsForPlayer(player, year);
    const roundsRight = getRoundsForPlayer(comparePlayer, year);

    const c1 = renderPlayerPanel(player, roundsLeft, parIndex, "pp-panel-left", "chart-left");
    const c2 = renderPlayerPanel(comparePlayer, roundsRight, parIndex, "pp-panel-right", "chart-right");
    if (c1) activeCharts.push(c1);
    if (c2) activeCharts.push(c2);
  } else {
    container.className = "pp-single-layout";
    container.innerHTML = `<div class="pp-panel pp-panel-single" id="pp-panel-main"></div>`;
    const rounds = getRoundsForPlayer(player, year);
    const c = renderPlayerPanel(player, rounds, parIndex, "pp-panel-main", "chart-main");
    if (c) activeCharts.push(c);
  }
}

// ----------------------
// Populate dropdowns
// ----------------------
function populateDropdowns() {
  const playerSelect = document.getElementById("playerSelect");
  const compareSelect = document.getElementById("compareSelect");
  const yearFilter = document.getElementById("yearFilter");

  const sorted = PLAYERS.slice().sort((a, b) => a.localeCompare(b, "en-AU"));

  // Player select
  playerSelect.innerHTML = sorted.map((p, i) =>
    `<option value="${p}" ${i === 0 ? "selected" : ""}>${p}</option>`
  ).join("");

  // Compare select
  compareSelect.innerHTML = `<option value="None">None</option>` +
    sorted.map((p) => `<option value="${p}">${p}</option>`).join("");

  // Year select — union of all years across all players
  const allYears = new Set();
  Object.values(playerData).forEach((rounds) => {
    getAvailableYears(rounds).forEach((y) => allYears.add(y));
  });
  const years = Array.from(allYears).sort();
  yearFilter.innerHTML = `<option value="All">All</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");

  // Event listeners
  playerSelect.addEventListener("change", render);
  yearFilter.addEventListener("change", render);
  compareSelect.addEventListener("change", render);
}

// ----------------------
// Boot
// ----------------------
async function main() {
  const container = document.getElementById("player-profiles");
  try {
    // Load all rows (including Par) for par index
    const allRows = await loadRounds({ path: "data.csv", filterComplete: false });
    parIndex = buildParIndex(allRows);

    // Load player rounds
    const rounds = await loadRounds({ path: "data.csv", filterComplete: true, includePlayers: PLAYERS });
    allRounds = rounds;

    // Group by player, newest first
    PLAYERS.forEach((player) => {
      playerData[player] = rounds
        .filter((r) => r.PlayerName === player)
        .sort((a, b) => parseCustomDate(b.StartDate) - parseCustomDate(a.StartDate));
    });

    populateDropdowns();
    render();
  } catch (e) {
    console.error(e);
    if (container) {
      container.innerHTML = `<div class="error">Failed to load data: ${String(e.message || e)}</div>`;
    }
  }
}

main();
