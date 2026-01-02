import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";
import { formatPlusMinus } from "../core/format.js";

/**
 * Rounds page (refactored)
 * - Uses shared CSV loader + normalisation
 * - Keeps the existing HTML/CSS structure and rendering behaviour
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

/** Format a Date as "MMM D, YYYY at HH:mm" in Australia/Sydney */
function formatSydneyDateTime(d) {
  if (!d) return "";
  const datePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${datePart} at ${timePart}`;
}


function parseCustomDate(dateStr) {
  // CSV stored as "YYYY-MM-DD HHmm" in UTC; parse to a real Date
  return parseUtcTimestampHHmm(dateStr);
}

function buildHoleScores(row) {
  return Object.keys(row)
    .filter((k) => k.startsWith("Hole"))
    .map((k) => ({ hole: k, score: parseInt(row[k], 10) }))
    .filter((x) => Number.isFinite(x.score));
}

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // Keep the legacy player set for now (matches previous behaviour).
  const players = ["ArmyGeddon", "Jobby", "Youare22", "Miza", "Bucis"];

  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: [...players, "Par"],
  });

  // Group rows into rounds
  const rounds = {};
  rows.forEach((row) => {
    const key = `${row.StartDate}-${row.CourseName}-${row.LayoutName}`;
    if (!rounds[key]) {
      rounds[key] = {
        date: row.StartDate,
        course: row.CourseName,
        layout: row.LayoutName,
        players: [],
        pars: [],
      };
    }

    const holeScores = buildHoleScores(row);

    if (row.PlayerName === "Par") {
      rounds[key].pars = holeScores;
    } else if (players.includes(row.PlayerName)) {
      rounds[key].players.push({
        name: row.PlayerName,
        total: row.Total,
        plusMinus: row["+/-"],
        rating: row.RoundRating || "N/A",
        holes: holeScores,
      });
    }
  });

  const roundArray = Object.values(rounds).sort((a, b) => {
    const da = parseCustomDate(a.date);
    const db = parseCustomDate(b.date);
    return (db?.getTime?.() ?? 0) - (da?.getTime?.() ?? 0);
  });

  container.innerHTML = "";

  roundArray.forEach((round, index) => {
    if (!round.players.length) return;

    const dateObj = parseCustomDate(round.date);
    const sydneyDate = formatSydneyDateTime(dateObj);

    const playerSummary = round.players
      .map(
        (p) =>
          `<p><strong>${p.name}:</strong> ${p.total} ${formatPlusMinus(
            p.plusMinus
          )}, Rating: ${p.rating}</p>`
      )
      .join("");

    // Check for aces in this round
    let aceNotes = [];
    let hasAce = false;
    round.players.forEach((player) => {
      player.holes.forEach((hole) => {
        if (hole.score === 1) {
          const holeNumber = hole.hole.replace("Hole", "");
          aceNotes.push(
            `<p class="ace-note">${player.name} dropped an ace on Hole ${holeNumber}</p>`
          );
          hasAce = true;
        }
      });
    });
    const aceAlert = hasAce
      ? '<span class="ace-alert">[ACE ALERT]</span>'
      : "";
    const aceNotesHtml = aceNotes.join("");

    const holeHeaders = round.players[0].holes
      .map((h) => `<th>${h.hole}</th>`)
      .join("");

    const parRow =
      round.pars && round.pars.length
        ? `<tr><td>Par</td>${round.pars
            .map((p) => `<td>${p.score}</td>`)
            .join("")}</tr>`
        : "";

    const playerRows = round.players
      .map((p) => {
        const holeScores = p.holes
          .map((h) => {
            const holeIndex = parseInt(h.hole.replace("Hole", ""), 10) - 1;
            const parScore =
              round.pars && round.pars[holeIndex]
                ? safeInt(round.pars[holeIndex].score)
                : 3; // default

            let className = "";
            if (h.score === 1) className = "ace";
            else if (h.score === parScore - 2) className = "eagle";
            else if (h.score === parScore - 1) className = "birdie";
            else if (h.score > parScore) className = "bogey";

            return `<td class="${className}">${h.score}</td>`;
          })
          .join("");

        return `<tr><td>${p.name}</td>${holeScores}</tr>`;
      })
      .join("");

    const card = document.createElement("div");
    card.className = "round-card";
    card.innerHTML = `
      <h3>Round ${index + 1} - ${sydneyDate} ${aceAlert}</h3>
      <p><strong>Course:</strong> ${round.course} (${round.layout})</p>
      <div class="round-summary">${playerSummary}</div>
      ${aceNotesHtml ? `<div class="ace-notes">${aceNotesHtml}</div>` : ""}
      <button class="toggle-details">Show Details</button>
      <div class="round-details" style="display:none;">
        <h4>Hole-by-Hole Scores</h4>
        <table>
          <thead>
            <tr><th>Player</th>${holeHeaders}</tr>
          </thead>
          <tbody>
            ${parRow}
            ${playerRows}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });

  // Toggle buttons
  const buttons = document.querySelectorAll(".toggle-details");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const details = button.nextElementSibling;
      if (!details) return;
      details.style.display = details.style.display === "none" ? "block" : "none";
      button.textContent =
        details.style.display === "none" ? "Show Details" : "Hide Details";
    });
  });
}

main().catch((err) => console.error("Rounds page error:", err));
