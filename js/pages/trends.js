import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";

/**
 * Trends page (refactored)
 * - Uses shared CSV loader + normalisation (complete rounds only)
 * - Preserves the existing Chart.js look/feel and filters
 */

// Sidebar toggle
const sidebar = document.querySelector(".sidebar");
const hamburger = document.querySelector(".hamburger");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    const current = window.getComputedStyle(sidebar).display;
    sidebar.style.display = current === "none" ? "block" : "none";
  });
}

function parseCustomDate(dateStr) {
  // CSV is "YYYY-MM-DD HHmm" in UTC
  return parseUtcTimestampHHmm(dateStr) || new Date();
}

function uniqSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
}

async function main() {
  const playerFilter = document.getElementById("playerFilter");
  const courseFilter = document.getElementById("courseFilter");
  const errorMessage = document.getElementById("errorMessage");
  const canvas = document.getElementById("performanceChart");

  if (!playerFilter || !courseFilter || !canvas) return;

  if (!window.Chart) {
    console.error("Chart.js not found. Ensure chart.js is loaded before this module.");
    if (errorMessage) errorMessage.style.display = "block";
    return;
  }

  let chartInstance = null;
  const ctx = canvas.getContext("2d");

  // Keep legacy "allowed players" behaviour
  const allowedPlayers = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: allowedPlayers, // excludes Par implicitly
  });

  // Populate filters
  const players = uniqSorted(rows.map((r) => r.PlayerName));
  const courses = uniqSorted(rows.map((r) => r.CourseName));

  // Reset options
  playerFilter.innerHTML = '<option value="">All Players</option>' + players.map(p => `<option value="${p}">${p}</option>`).join("");
  courseFilter.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${c}">${c}</option>`).join("");

  function updateChart() {
    const selectedPlayer = playerFilter.value;
    const selectedCourse = courseFilter.value;
    if (errorMessage) errorMessage.style.display = "none";

    const chartData = rows
      .filter(
        (row) =>
          (!selectedPlayer || row.PlayerName === selectedPlayer) &&
          (!selectedCourse || row.CourseName === selectedCourse)
      )
      .map((row) => ({
        x: parseCustomDate(row.StartDate),
        y: parseInt(row["+/-"], 10) || 0,
      }))
      .sort((a, b) => a.x - b.x);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new window.Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: selectedPlayer || "All Players",
            data: chartData,
            borderColor: "rgba(25, 118, 210, 1)",
            backgroundColor: "rgba(25, 118, 210, 0.2)",
            fill: false,
            tension: 0.1,
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              unit: "month",
              tooltipFormat: "MMM dd, yyyy",
              displayFormats: { month: "MMM yyyy" },
            },
            title: {
              display: true,
              text: "Date",
              color: "#2e2e2e",
              font: { family: "Oswald", size: 14 },
            },
            ticks: { color: "#2e2e2e" },
          },
          y: {
            title: {
              display: true,
              text: "+/-",
              color: "#2e2e2e",
              font: { family: "Oswald", size: 14 },
            },
            suggestedMin: -15,
            suggestedMax: 40,
            ticks: { color: "#2e2e2e", stepSize: 5 },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#2e2e2e",
              font: { family: "Oswald", size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.raw.y}`,
            },
          },
        },
      },
    });
  }

  playerFilter.addEventListener("change", updateChart);
  courseFilter.addEventListener("change", updateChart);

  updateChart();
}

main().catch((err) => {
  console.error("Trends page error:", err);
  const msg = document.getElementById("errorMessage");
  if (msg) msg.style.display = "block";
});
