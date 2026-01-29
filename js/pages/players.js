// players.js
// Players page rendering + charts
// Rating rule:
//   Rating = average of best 8 RoundRating values from the most recent 20 rounds.
// Chart (clean default):
//   Blue   = Round Rating as SCATTER (no line) to avoid clutter
//   Orange = Rating (best 8 of last 20) as LINE
// Year filter:
//   Default "All", can drill into each year. Filter updates chart + current rating display.

import { toSydneyISODate, parseCalendarDate } from "../core/dates.js";
import { formatPlusMinus } from "../core/format.js";
import { loadRounds } from "../core/data.js";

// ----------------------
// Config
// ----------------------
const players = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

// ----------------------
// UI helpers
// ----------------------
function getPlayerColor(name, alpha = 1) {
  const colors = {
    ArmyGeddon: "#1976d2",
    Jobby: "#388e3c",
    Youare22: "#f57c00",
    Miza: "#7b1fa2",
    Bucis: "#c62828"
  };

  const hex = colors[name] || "#555";
  if (alpha === 1) return hex;

  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function convertToSydneyDate(utcDateStr) {
  return toSydneyISODate(utcDateStr); // expected YYYY-MM-DD
}
function parseCustomDate(dateStr) {
  return parseCalendarDate(dateStr);
}

function getYearFromRound(round) {
  // Use the converted ISO date for consistent year extraction
  const iso = convertToSydneyDate(round.StartDate);
  // iso is YYYY-MM-DD
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
    link.addEventListener("click", () => {
      sidebar.style.display = "none";
    });
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
  const ratings = last20
    .map((r) => normaliseRating(r.RoundRating))
    .filter((n) => n !== null);

  if (!ratings.length) return "N/A";
  const best8 = ratings.slice().sort((a, b) => b - a).slice(0, 8);
  if (!best8.length) return "N/A";

  const avg = best8.reduce((sum, v) => sum + v, 0) / best8.length;
  return avg.toFixed(2);
}

function calculatePreviousRating(roundsNewestFirst) {
  // Legacy behaviour kept: best 8 excluding top 1 (slice(1,9))
  const last20 = roundsNewestFirst.slice(0, 20);
  const ratings = last20
    .map((r) => normaliseRating(r.RoundRating))
    .filter((n) => n !== null);

  if (!ratings.length) return "N/A";

  const sorted = ratings.slice().sort((a, b) => b - a);
  const alt8 = sorted.slice(1, 9);
  if (!alt8.length) return "N/A";

  const avg = alt8.reduce((sum, v) => sum + v, 0) / alt8.length;
  return avg.toFixed(2);
}

function getRatingMovement(current, previous) {
  if (current === "N/A" || previous === "N/A") return "";
  const diff = Number.parseFloat(current) - Number.parseFloat(previous);
  if (!Number.isFinite(diff)) return "";
  return diff > 0 ? `(+${diff.toFixed(2)})` : diff < 0 ? `(${diff.toFixed(2)})` : "(±0.00)";
}

// ----------------------
// Stats helpers
// ----------------------
function countAces(rounds) {
  let aceCount = 0;
  rounds.forEach((round) => {
    for (let i = 1; i <= 18; i++) {
      if (parseInt(round[`Hole${i}`], 10) === 1) aceCount++;
    }
  });
  return aceCount;
}

function getBestScoresPerCourse(rounds) {
  const bestScores = {};
  rounds.forEach((round) => {
    const course = round.CourseName;
    const total = parseInt(round.Total, 10);
    const plusMinus = parseInt(round["+/-"], 10);
    const date = convertToSydneyDate(round.StartDate);

    if (!Number.isFinite(total)) return;

    if (!bestScores[course] || total < parseInt(bestScores[course].total, 10)) {
      bestScores[course] = { total, plusMinus, date };
    }
  });
  return bestScores;
}

function getJourneyOverview(playerName, roundsNewestFirst) {
  if (!roundsNewestFirst.length) return "";

  const firstRound = roundsNewestFirst[roundsNewestFirst.length - 1];
  const firstMonthYear = new Date(parseCustomDate(firstRound.StartDate)).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });

  const validRatingsChrono = roundsNewestFirst
    .slice()
    .sort((a, b) => parseCustomDate(a.StartDate) - parseCustomDate(b.StartDate))
    .map((r) => ({ rating: normaliseRating(r.RoundRating), ...r }))
    .filter((r) => r.rating !== null);

  if (!validRatingsChrono.length) {
    return `<p>Journey Overview: ${playerName} first appeared in ${firstMonthYear}. No valid ratings available yet.</p>`;
  }

  const earlyLow = validRatingsChrono[0];
  const peak = validRatingsChrono.reduce((max, cur) => (max.rating > cur.rating ? max : cur), validRatingsChrono[0]);
  const peakPlusMinus = formatPlusMinus(peak["+/-"]);

  return `<p>Journey Overview: ${playerName} first appeared in ${firstMonthYear} and shows improvement. Their RoundRating rose from ${
    earlyLow.rating
  } at ${earlyLow.CourseName} in ${new Date(parseCustomDate(earlyLow.StartDate)).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  })} to ${peak.rating} ${peakPlusMinus} at ${peak.CourseName} in ${new Date(parseCustomDate(peak.StartDate)).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  })}.</p>`;
}

// ----------------------
// Filtering
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
  return Array.from(years).sort(); // ascending
}

// ----------------------
// Chart series builders (PER-ROUND, clean)
// ----------------------
function buildPerRoundSeries(roundsNewestFirst) {
  const roundsChrono = roundsNewestFirst
    .slice()
    .sort((a, b) => parseCustomDate(a.StartDate) - parseCustomDate(b.StartDate));

  const points = roundsChrono
    .map((r) => {
      const rating = normaliseRating(r.RoundRating);
      if (rating === null) return null;
      return {
        date: convertToSydneyDate(r.StartDate), // YYYY-MM-DD
        rating,
        round: r
      };
    })
    .filter(Boolean);

  const labels = points.map((p) => p.date);

  // Blue: round rating (dots only)
  const blue = points.map((p) => Number(p.rating.toFixed(2)));

  // Orange: rating metric at each round (best 8 of last 20 up to this round)
  const orange = [];
  const running = [];
  for (const p of points) {
    running.push(p.rating);
    if (running.length < 8) {
      orange.push(null); // change 8 -> 20 if you want strict last-20 before showing anything
    } else {
      const metric = best8OfLast20Average(running);
      orange.push(metric === null ? null : Number(metric.toFixed(2)));
    }
  }

  return { labels, blue, orange, points };
}

// ----------------------
// Chart creation / update
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
          tension: 0,            // no smoothing for dots
          showLine: false,       // KEY: dots only (scatter style)
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
          ticks: {
            color: "#2e2e2e",
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10
          }
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
          labels: {
            color: "#2e2e2e",
            font: { family: "Oswald", size: 12 },
            usePointStyle: false
          }
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
              tooltipEl.style.position = "absolute";
              tooltipEl.style.background = "rgba(0, 0, 0, 0.85)";
              tooltipEl.style.color = "#fff";
              tooltipEl.style.padding = "8px 12px";
              tooltipEl.style.borderRadius = "4px";
              tooltipEl.style.pointerEvents = "none";
              tooltipEl.style.maxWidth = "320px";
              tooltipEl.style.zIndex = 9999;
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
      // Click-to-lock tooltip (blue dataset)
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: event.x, y: event.y });
          chart.update();
        }
      }
    }
  });

  // Clear tooltip on mouse/touch end
  const canvas = ctx.canvas;
  canvas.addEventListener("mouseup", () => {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  });
  canvas.addEventListener("touchend", () => {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  });

  return chart;
}

function updatePlayerChart(chart, series) {
  const { labels, blue, orange, points } = series;
  chart.data.labels = labels;
  chart.data.datasets[0].data = blue;
  chart.data.datasets[1].data = orange;

  // Update tooltip closure data by reattaching a reference
  // (We store points on chart instance for access in external tooltip)
  chart.$points = points;
  chart.$orange = orange;

  chart.update();
}

// ----------------------
// Render
// ----------------------
function renderPlayers(rounds) {
  const data = rounds || [];
  const filteredData = data.filter((r) => players.includes(r.PlayerName));
  const playerList = players.slice().sort((a, b) => a.localeCompare(b, "en-AU"));

  const playerData = {};
  playerList.forEach((player) => {
    // newest -> oldest
    playerData[player] = filteredData
      .filter((row) => row.PlayerName === player)
      .sort((a, b) => parseCustomDate(b.StartDate) - parseCustomDate(a.StartDate));
  });

  const container = document.getElementById("player-profiles");
  if (!container) return;

  container.innerHTML = "";
  let hasProfiles = false;

  playerList.forEach((player, index) => {
    const allRoundsForPlayer = playerData[player];
    if (!allRoundsForPlayer.length) return;

    hasProfiles = true;

    // Build card shell
    const card = document.createElement("div");
    card.className = "record-card player-profile";
    card.style.animationDelay = `${index * 0.1}s`;

    const canvasId = `chart-${player.toLowerCase()}`;
    const ratingId = `current-rating-${player.toLowerCase()}`;
    const movementId = `rating-movement-${player.toLowerCase()}`;
    const filterId = `year-filter-${player.toLowerCase()}`;

    // Static stats (not filtered) — keep these as lifetime stats
    const totalRounds = allRoundsForPlayer.length;
    const totalScores = allRoundsForPlayer
      .map((r) => parseInt(r.Total, 10))
      .filter((s) => Number.isFinite(s) && s > 0);
    const avgScore = totalScores.length ? (totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(1) : "N/A";
    const totalPlusMinus = allRoundsForPlayer
      .map((r) => parseInt(r["+/-"], 10))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => a + b, 0);
    const aceCount = countAces(allRoundsForPlayer);
    const bestScores = getBestScoresPerCourse(allRoundsForPlayer);
    const bestScoresHtml = Object.entries(bestScores)
      .map(([course, d]) => `<li><strong>${course}</strong>: ${d.total} ${formatPlusMinus(d.plusMinus)} on ${d.date}</li>`)
      .join("");
    const journeyOverview = getJourneyOverview(player, allRoundsForPlayer);

    // Year filter options
    const years = getAvailableYears(allRoundsForPlayer);
    const yearOptions = ["All", ...years].map((y) => `<option value="${y}">${y}</option>`).join("");

    card.innerHTML = `
      <h3>${player}</h3>

      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin: 6px 0 10px;">
        <label for="${filterId}" style="font-weight:700;">Year:</label>
        <select id="${filterId}" style="padding:6px 10px; border-radius:6px;">
          ${yearOptions}
        </select>
        <span style="opacity:0.85;">(Default: All)</span>
      </div>

      <p><strong>Rounds Played:</strong> ${totalRounds}</p>
      <p><strong>Average Score:</strong> ${avgScore}</p>
      <p><strong>Best Scores by Course:</strong></p>
      <ul>${bestScoresHtml}</ul>
      <p><strong>Total +/-:</strong> ${totalPlusMinus}</p>

      <p><strong>Current Rating:</strong>
        <span id="${ratingId}">...</span>
        <span id="${movementId}"></span>
      </p>

      <p><strong>Ace Count:</strong> ${aceCount}</p>
      ${journeyOverview}

      <div class="chart-container">
        <canvas id="${canvasId}" class="player-chart"></canvas>
      </div>
    `;

    container.appendChild(card);

    // Chart init with default filter "All"
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx) return;

    const applyFilterAndUpdate = (year) => {
      const filteredRounds = filterRoundsByYear(allRoundsForPlayer, year);

      // Update rating display based on FILTERED view
      const currentRating = calculateCurrentRating(filteredRounds);
      const previousRating = calculatePreviousRating(filteredRounds);
      const movement = getRatingMovement(currentRating, previousRating);

      const ratingEl = document.getElementById(ratingId);
      const movementEl = document.getElementById(movementId);
      if (ratingEl) ratingEl.textContent = currentRating;
      if (movementEl) movementEl.textContent = ` ${movement}`;

      // Build chart series based on FILTERED rounds
      const series = buildPerRoundSeries(filteredRounds);

      // If chart already exists, update; else create
      if (applyFilterAndUpdate._chart) {
        // store points/orange on chart for tooltip use
        applyFilterAndUpdate._chart.$points = series.points;
        applyFilterAndUpdate._chart.$orange = series.orange;

        // Update series data
        applyFilterAndUpdate._chart.data.labels = series.labels;
        applyFilterAndUpdate._chart.data.datasets[0].data = series.blue;
        applyFilterAndUpdate._chart.data.datasets[1].data = series.orange;

        applyFilterAndUpdate._chart.update();
      } else {
        // Create chart with closures
        const chart = createPlayerChart(ctx, player, series);

        // Attach series for tooltip access (optional for future use)
        chart.$points = series.points;
        chart.$orange = series.orange;

        // Patch tooltip external handler to use attached series when chart updates
        // (We can’t easily rewrite the function inside Chart.js, so we keep it stable.
        //  It already uses the series closure created at instantiation. To avoid that,
        //  we rely on re-creation OR accept that the closure is for this chart instance.)
        // Simpler: recreate on filter changes would also work, but update is faster.
        // Our external tooltip currently closes over initial series, so instead we:
        // - keep the tooltip “round details” driven by BLUE dataset point index
        // - rebuild the whole chart on filter change (most robust).
        //
        // Therefore: we will recreate on each filter change (small cost, best correctness).

        applyFilterAndUpdate._chart = chart;
        applyFilterAndUpdate._series = series;
      }

      // If the filtered dataset is huge and still crowded, user can zoom/pan.
    };

    // Important: to avoid the external tooltip closure becoming stale after updates,
    // we recreate the chart on each filter change (robust + still fast for these sizes).
    const recreateChartForYear = (year) => {
      const filteredRounds = filterRoundsByYear(allRoundsForPlayer, year);

      const currentRating = calculateCurrentRating(filteredRounds);
      const previousRating = calculatePreviousRating(filteredRounds);
      const movement = getRatingMovement(currentRating, previousRating);

      const ratingEl = document.getElementById(ratingId);
      const movementEl = document.getElementById(movementId);
      if (ratingEl) ratingEl.textContent = currentRating;
      if (movementEl) movementEl.textContent = ` ${movement}`;

      const series = buildPerRoundSeries(filteredRounds);

      // Destroy prior chart if exists
      if (applyFilterAndUpdate._chart) {
        applyFilterAndUpdate._chart.destroy();
        applyFilterAndUpdate._chart = null;
      }

      // Create fresh chart with correct tooltip closures
      applyFilterAndUpdate._chart = createPlayerChart(ctx, player, series);
    };

    // Initial load (All)
    recreateChartForYear("All");

    // Hook dropdown
    const select = document.getElementById(filterId);
    if (select) {
      select.addEventListener("change", (e) => {
        recreateChartForYear(e.target.value);
      });
    }
  });

  if (!hasProfiles) {
    container.innerHTML = "<p>No player data available. Please check data.csv.</p>";
  }
}

// ----------------------
// Boot
// ----------------------
async function main() {
  const container = document.getElementById("player-profiles");
  try {
    const rounds = await loadRounds({ path: "data.csv", filterComplete: true, includePlayers: players });
    renderPlayers(rounds);
  } catch (e) {
    console.error(e);
    if (container) {
      container.innerHTML = `<div class="error">Failed to load data: ${String(e.message || e)}</div>`;
    }
  }
}

main();
