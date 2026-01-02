import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";

/**
 * Index/Home page (refactored)
 * - Uses shared CSV loader + normalisation
 * - Preserves "Latest Round" card behaviour
 */

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

function formatSydneyDateTime(d) {
  if (!d) return "";
  const datePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

async function main() {
  const container = document.getElementById("latest-round");
  if (!container) return;

  const players = ["ArmyGeddon", "Jobby", "Youare22", "Miza", "Bucis"];

  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: players,
  });

  if (!rows.length) return;

  // Find latest StartDate (UTC timestamp string)
  let latest = null;
  for (const r of rows) {
    const d = parseUtcTimestampHHmm(r.StartDate);
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  if (!latest) return;

  const latestKey = rows
    .filter(r => {
      const d = parseUtcTimestampHHmm(r.StartDate);
      return d && d.getTime() === latest.getTime();
    });

  // Fallback: if multiple rounds in same timestamp, just use those rows
  const latestRounds = latestKey.length ? latestKey : rows;

  // Build card
  const card = document.createElement("div");
  card.className = "record-card course-record";

  const title = formatSydneyDateTime(latest);
  const courseName = latestRounds[0]?.CourseName || 'Unknown Course';

  let roundHtml = `
    <h3>Latest Round - ${courseName}</h3>
    <p><strong>Date:</strong> ${title}</p>
    <div class="round-summary">
  `;

  players.forEach((player) => {
    const playerRound = latestRounds.find((row) => row.PlayerName === player);
    if (playerRound) {
      const total = parseInt(playerRound.Total, 10) || 0;
      const pm = parseInt(playerRound["+/-"], 10) || 0;
      const pmTxt = pm >= 0 ? `+${pm}` : `${pm}`;
      roundHtml += `
        <p><strong>${player}:</strong> ${total} (${pmTxt}), Rating: ${playerRound.RoundRating || "N/A"}</p>
      `;
    }
  });

  roundHtml += `</div>`;

  card.innerHTML = roundHtml;
  container.innerHTML = "";
  container.appendChild(card);
}

main().catch((err) => console.error("Index page error:", err));
