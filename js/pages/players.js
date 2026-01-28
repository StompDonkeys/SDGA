// players.js
// Players page rendering + charts
// Rating rule:
//   Current Rating = average of best 8 RoundRating values from the most recent 20 rounds.
// Charts (per-round, fixes tooltip + “blue line” mismatch):
//   Blue   = Round Rating (each round)
//   Orange = Rating (best 8 of last 20), recalculated at each round point

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

  // hex -> rgba
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
  // ratingsChrono: numeric ratings in chronological order (old -> new)
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
  // Your legacy behaviour: best 8 excluding the top 1 (slice(1,9))
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
    .map((r) => ({
      rating: normaliseRating(r.RoundRating),
      ...r
    }))
    .filter((r) => r.rating !== null);

  if (!validRatingsChrono.length) {
    return `<p>Journey Overview: ${playerName} first appeared in ${firstMonthYear}. No valid ratings available yet.</p>`;
  }

  const earlyLow = validRatingsChrono[0];
  const peak = validRatingsChrono.reduce((max, cur) => (max.rating > cur.rating ? max : cur), validRatingsChrono[0]);
  const peakPlusMinus = formatPlusMinus(peak["+/-"]);

  return `<p>Journey Overview: ${playerName} first appeared in ${firstMonthYear} and shows improvement. Their RoundRating rose from ${earlyLow.rating} at ${earlyLow.CourseName} in ${new Date(parseCustomDate(earlyLow.StartDate)).toLocaleString(
    "en-US",
    { month: "long", year: "numeric" }
  )} to ${peak.rating} ${peakPlusMinus} at ${peak.CourseName} in ${new Date(parseCustomDate(peak.StartDate)).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  })}.</p>`;
}

// ----------------------
// Chart series builders (PER-ROUND)
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
        date: convertToSydneyDate(r.StartDate), // full date label
        rating,
        round: r
      };
    })
    .filter(Boolean);

  const labels = points.map((p) => p.date);
  const blue = points.map((p) => Number(p.rating.toFixed(2)));

  // Orange = rating metric at each round (best 8 of last 20 up to this round)
  const orange = [];
  const running = [];

  for (const p of points) {
    running.push(p.rating);

    // Gate behaviour:
    // - show metric once at least 8 rated rounds exist
    // If you want STRICT "last 20" behaviour before showing anything, change 8 -> 20.
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
// Render
// ----------------------
function renderPlayers(rounds) {
  const data = rounds || [];
  console.log("Parsed data rows:", data.length);

  const filteredData = data.filter((r) => players.includes(r.PlayerName));
  const playerList = players.slice().sort((a, b) => a.localeCompare(b, "en-AU"));

  console.log("Filtered data rows:", filteredData.length, "players:", playerList.length);

  const playerData = {};
  playerList.forEach((player) => {
    // Store newest -> oldest for profile stats
    playerData[player] = filteredData
      .filter((row) => row.PlayerName === player)
      .sort((a, b) => parseCustomDate(b.StartDate) - parseCustomDate(a.StartDate));

    console.log(`Rounds for ${player}:`, playerData[player].length);
  });

  const container = document.getElementById("player-profiles");
  if (!container) return;

  container.innerHTML = "";
  let hasProfiles = false;

  playerList.forEach((player, index) => {
    const roundsForPlayer = playerData[player];
    if (!roundsForPlayer.length) {
      console.log(`No valid rounds for ${player}, skipping profile`);
      return;
    }

    hasProfiles = true;

    const totalRounds = roundsForPlayer.length;
    const totalScores = roundsForPlayer
      .map((r) => parseInt(r.Total, 10))
      .filter((s) => Number.isFinite(s) && s > 0);

    const avgScore = totalScores.length ? (totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(1) : "N/A";

    const totalPlusMinus = roundsForPlayer
      .map((r) => parseInt(r["+/-"], 10))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => a + b, 0);

    const currentRating = calculateCurrentRating(roundsForPlayer);
    const previousRating = calculatePreviousRating(roundsForPlayer);
    const ratingMovement = getRatingMovement(currentRating, previousRating);

    const aceCount = countAces(roundsForPlayer);
    const bestScores = getBestScoresPerCourse(roundsForPlayer);
    const journeyOverview = getJourneyOverview(player, roundsForPlayer);

    const bestScoresHtml = Object.entries(bestScores)
      .map(([course, d]) => `<li><strong>${course}</strong>: ${d.total} ${formatPlusMinus(d.plusMinus)} on ${d.date}</li>`)
      .join("");

    const card = document.createElement("div");
    card.className = "record-card player-profile";
    card.style.animationDelay = `${index * 0.1}s`;

    const canvasId = `chart-${player.toLowerCase()}`;

    card.innerHTML = `
      <h3>${player}</h3>
      <p><strong>Rounds Played:</strong> ${totalRounds}</p>
      <p><strong>Average Score:</strong> ${avgScore}</p>
      <p><strong>Best Scores by Course:</strong></p>
      <ul>${bestScoresHtml}</ul>
      <p><strong>Total +/-:</strong> ${totalPlusMinus}</p>
      <p><strong>Current Rating:</strong> ${currentRating} ${ratingMovement}</p>
      <p><strong>Ace Count:</strong> ${aceCount}</p>
      ${journeyOverview}
      <div class="chart-container">
        <canvas id="${canvasId}" class="player-chart"></canvas>
      </div>
    `;

    container.appendChild(card);

    // Build per-round series + render chart
    const { labels, blue, orange, points } = buildPerRoundSeries(roundsForPlayer);

    const hasAnyBlue = blue.some((v) => v !== null);
    const hasAnyOrange = orange.some((v) => v !== null);

    if (!hasAnyBlue && !hasAnyOrange) {
      console.log(`No valid ratings for ${player}, skipping chart`);
      return;
    }

    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Round Rating",
            data: blue,
            borderColor: getPlayerColor(player),
            backgroundColor: getPlayerColor(player, 0.2),
            fill: false,
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 5
          },
          {
            label: "Rating (best 8 of last 20)",
            data: orange,
            borderColor: "rgba(255, 159, 64, 1)",
            backgroundColor: "rgba(255, 159, 64, 0.2)",
            fill: false,
            borderWidth: 2,
            tension: 0.1,
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
            ticks: { color: "#2e2e2e", maxRotation: 45, minRotation: 45 }
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
              usePointStyle: false,
              generateLabels: function (chart) {
                const datasets = chart.data.datasets;
                return datasets.map((dataset, i) => ({
                  text: dataset.label,
                  fillStyle: dataset.backgroundColor,
                  strokeStyle: dataset.borderColor,
                  lineWidth: dataset.borderWidth || 1,
                  datasetIndex: i
                }));
              }
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
                tooltipEl.style.background = "rgba(0, 0, 0, 0.8)";
                tooltipEl.style.color = "#fff";
                tooltipEl.style.padding = "8px 12px";
                tooltipEl.style.borderRadius = "4px";
                tooltipEl.style.pointerEvents = "none";
                tooltipEl.style.maxWidth = "320px";
                document.body.appendChild(tooltipEl);
              }

              const content = `
                <strong>Date:</strong> ${p.date}<br>
                <strong>Score:</strong> ${p.round.Total} ${formatPlusMinus(p.round["+/-"])}<br>
                <strong>Round rating:</strong> ${p.round.RoundRating || "N/A"}<br>
                <strong>Course:</strong> ${p.round.CourseName}<br>
                <hr style="border:0;border-top:1px solid rgba(255,255,255,0.2);margin:8px 0;">
                <strong>Rating (best 8 of 20):</strong> ${orange[idx] ?? "N/A"}
              `;

              tooltipEl.innerHTML = content;

              const pos = context.chart.canvas.getBoundingClientRect();
              tooltipEl.style.left = pos.left + window.pageXOffset + tooltip.caretX + "px";
              tooltipEl.style.top = pos.top + window.pageYOffset + tooltip.caretY + "px";
              tooltipEl.style.opacity = 1;
            }
          },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "xy" },
            pan: { enabled: true, mode: "xy" }
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

    const canvas = document.getElementById(canvasId);
    if (canvas) {
      canvas.addEventListener("mouseup", () => {
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update();
      });
      canvas.addEventListener("touchend", () => {
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update();
      });
    }

    // Sanity check: last orange point should match the card current rating (within rounding),
    // provided the chart includes all rated rounds and the gating isn't stricter than the card.
    console.log(`[${player}] Current Rating card: ${currentRating}; Chart last orange: ${orange.at(-1)}`);
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
