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

function rollingAverage(points, windowSize) {
  if (!windowSize || windowSize <= 1) return [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = points.slice(start, i + 1);
    const avg = slice.reduce((s, p) => s + p.y, 0) / slice.length;
    out.push({ x: points[i].x, y: avg });
  }
  return out;
}

function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

async function main() {
  const playerFilter = document.getElementById("playerFilter");
  const courseFilter = document.getElementById("courseFilter");
  const metricFilter = document.getElementById("metricFilter");
  const windowFilter = document.getElementById("windowFilter");
  const pointsToggle = document.getElementById("pointsToggle");
  const errorMessage = document.getElementById("errorMessage");
  const canvas = document.getElementById("performanceChart");

  const summaryRounds = document.getElementById("summaryRounds");
  const summaryBest = document.getElementById("summaryBest");
  const summaryAvg = document.getElementById("summaryAvg");
  const summaryLatest = document.getElementById("summaryLatest");
  const chartTitle = document.getElementById("chartTitle");
  const chartNote = document.getElementById("chartNote");

  if (!playerFilter || !courseFilter || !metricFilter || !windowFilter || !pointsToggle || !canvas) return;

  if (!window.Chart) {
    console.error("Chart.js not found.");
    if (errorMessage) errorMessage.style.display = "block";
    return;
  }

  let chartInstance = null;
  const ctx = canvas.getContext("2d");

  const allowedPlayers = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: allowedPlayers,
  });

  const players = uniqSorted(rows.map((r) => r.PlayerName));
  const courses = uniqSorted(rows.map((r) => r.CourseName));

  playerFilter.innerHTML = '<option value="">All Players</option>' + players.map(p => `<option value="${p}">${p}</option>`).join("");
  courseFilter.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${c}">${c}</option>`).join("");

  const playerColours = {
    ArmyGeddon: "rgba(25, 118, 210, 1)",
    Jobby: "rgba(56, 142, 60, 1)",
    Youare22: "rgba(245, 124, 0, 1)",
    Miza: "rgba(123, 31, 162, 1)",
    Bucis: "rgba(198, 40, 40, 1)",
  };

  function buildPoints(selectedPlayer, selectedCourse, metric) {
    const filtered = rows.filter(
      (r) =>
        (!selectedPlayer || r.PlayerName === selectedPlayer) &&
        (!selectedCourse || r.CourseName === selectedCourse)
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

    const best = metric === "rating" ? Math.max(...ys) : Math.min(...ys);
    const latest = points[points.length - 1].y;

    summaryBest.textContent = fmtNumber(best);
    summaryAvg.textContent = fmtNumber(avg);
    summaryLatest.textContent = fmtNumber(latest);
  }

  function updateChart() {
    const selectedPlayer = playerFilter.value;
    const selectedCourse = courseFilter.value;
    const metric = metricFilter.value === "rating" ? "rating" : "+/-";
    const windowSize = parseInt(windowFilter.value, 10) || 0;
    const showPoints = !!pointsToggle.checked;

    if (errorMessage) errorMessage.style.display = "none";

    const points = buildPoints(selectedPlayer, selectedCourse, metric);
    updateSummary(points, metric);

    if (chartTitle) chartTitle.textContent = `${selectedPlayer || "All Players"} • ${selectedCourse || "All Courses"}`;
    if (chartNote) chartNote.textContent = `Metric: ${metric}${windowSize ? ` • Rolling avg: ${windowSize}` : ""}`;

    const colour = playerColours[selectedPlayer] || "rgba(25, 118, 210, 1)";
    const fill = colour.replace("1)", "0.18)");

    const datasets = [
      {
        label: metric === "rating" ? "Rating" : "+/-",
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

    if (windowSize) {
      const avg = rollingAverage(points, windowSize);
      datasets.push({
        label: `Rolling Avg (${windowSize})`,
        data: avg,
        borderColor: "rgba(0,0,0,0.55)",
        backgroundColor: "rgba(0,0,0,0.12)",
        fill: false,
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 2,
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

  [playerFilter, courseFilter, metricFilter, windowFilter, pointsToggle].forEach((el) => el.addEventListener("change", updateChart));

  updateChart();
}

main().catch((err) => {
  console.error("Trends page error:", err);
  const msg = document.getElementById("errorMessage");
  if (msg) msg.style.display = "block";
});
