import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm } from "../core/dates.js";
import { formatPlusMinus } from "../core/format.js";

// Helper to check if a round is complete (must have 18 holes)
function isRoundComplete(row) {
  for (let i = 1; i <= 18; i++) {
    const val = row[`Hole${i}`];
    if (val === undefined || val === null || val === "" || isNaN(parseInt(val, 10))) {
      return false;
    }
  }
  return true;
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

function formatSydneyDateTime(d) {
  if (!d) return "";
  const datePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", month: "short", day: "numeric", year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

function parseCustomDate(dateStr) {
  return parseUtcTimestampHHmm(dateStr);
}

function buildHoleScores(row) {
  return Object.keys(row)
    .filter((k) => k.startsWith("Hole"))
    .map((k) => ({ hole: k, score: parseInt(row[k], 10) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => parseInt(a.hole.replace("Hole", ""), 10) - parseInt(b.hole.replace("Hole", ""), 10));
}

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  const players = ["ArmyGeddon", "Jobby", "Youare22", "Miza", "Bucis"];

  // Fetch data
  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: [...players, "Par"],
  });

  if (!rows.length) {
    container.innerHTML = "<p>No rounds found.</p>";
    return;
  }

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
  const playableRounds = roundArray.filter((r) => r.players.length);
  const totalRounds = playableRounds.length;

  roundArray.forEach((round) => {
    if (!round.players.length) return;

    const roundNumber = totalRounds - playableRounds.indexOf(round);
    const dateObj = parseCustomDate(round.date);
    const sydneyDate = formatSydneyDateTime(dateObj);

    const playerSummary = round.players
      .map(p => `<p><strong>${p.name}:</strong> ${p.total} ${formatPlusMinus(p.plusMinus)}, Rating: ${p.rating}</p>`)
      .join("");

    let aceNotes = [];
    let hasAce = false;
    round.players.forEach((player) => {
      player.holes.forEach((hole) => {
        if (hole.score === 1) {
          const holeNum = hole.hole.replace("Hole", "");
          aceNotes.push(`<p class="ace-note">${player.name} dropped an ace on Hole ${holeNum}</p>`);
          hasAce = true;
        }
      });
    });

    // Request fulfillment: Display headers as 1, 2, 3...
    const holeHeaders = round.players[0].holes
      .map((h) => `<th>${h.hole.replace("Hole", "")}</th>`)
      .join("");

    const parRow = round.pars && round.pars.length
        ? `<tr><td>Par</td>${round.pars.map((p) => `<td>${p.score}</td>`).join("")}</tr>`
        : "";

    const playerRows = round.players.map((p) => {
        const holeCells = p.holes.map((h) => {
            const hIdx = parseInt(h.hole.replace("Hole", ""), 10) - 1;
            const parS = round.pars && round.pars[hIdx] ? safeInt(round.pars[hIdx].score) : 3;
            let cls = "";
            if (h.score === 1) cls = "ace";
            else if (h.score === parS - 2) cls = "eagle";
            else if (h.score === parS - 1) cls = "birdie";
            else if (h.score > parS) cls = "bogey";
            return `<td class="${cls}">${h.score}</td>`;
          }).join("");
        return `<tr><td>${p.name}</td>${holeCells}</tr>`;
      }).join("");

    const card = document.createElement("div");
    card.className = "round-card";
    card.innerHTML = `
      <h3>Round ${roundNumber} - ${sydneyDate} ${hasAce ? '<span class="ace-alert">[ACE ALERT]</span>' : ""}</h3>
      <p><strong>Course:</strong> ${round.course} (${round.layout})</p>
      <div class="round-summary">${playerSummary}</div>
      ${aceNotes.length ? `<div class="ace-notes">${aceNotes.join("")}</div>` : ""}
      <button class="toggle-details">Show Details</button>
      <div class="round-details" style="display:none;">
        <h4>Hole-by-Hole Scores</h4>
        <table>
          <thead><tr><th>Player</th>${holeHeaders}</tr></thead>
          <tbody>${parRow}${playerRows}</tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll(".toggle-details").forEach((btn) => {
    btn.addEventListener("click", () => {
      const details = btn.nextElementSibling;
      details.style.display = details.style.display === "none" ? "block" : "none";
      btn.textContent = details.style.display === "none" ? "Show Details" : "Hide Details";
    });
  });
}

main().catch((err) => console.error("Rounds page error:", err));