import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm, toSydneyISODate } from "../core/dates.js";

/**
 * Records page (refactored)
 * - Uses shared CSV loader + normalisation
 * - Preserves existing "course records" + "personal bests" logic
 */

// Sidebar toggle
const sidebar = document.querySelector(".sidebar");
const hamburger = document.querySelector(".hamburger");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    sidebar.style.display = sidebar.style.display === "none" ? "block" : "none";
  });
}

function parseCustomDate(dateStr) {
  // For tie-breaking recency in personal bests we only need a Date.
  return parseUtcTimestampHHmm(dateStr) || new Date(String(dateStr).split(" ")[0]);
}

function convertToSydneyDate(utcDateStr) {
  // Keep the existing display style "YYYY-MM-DD"
  return toSydneyISODate(utcDateStr) || "";
}

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const courseContainer = document.getElementById("course-records");
  const personalContainer = document.getElementById("personal-bests");
  if (!courseContainer || !personalContainer) return;

  const players = ["ArmyGeddon", "Jobby", "Youare22", "Bucis", "Miza"];

  const rows = await loadRounds({
    filterComplete: true,
    includePlayers: players,
  });

  // Course records: best score (min Total), tie-breaker min +/-; keep multiple holders on exact ties
  const courseRecords = {};
  rows.forEach((row) => {
    const key = `${row.CourseName}-${row.LayoutName}`;
    const total = safeInt(row.Total);
    const plusMinus = safeInt(row["+/-"]);
    const date = parseCustomDate(row.StartDate);
    const displayDate = convertToSydneyDate(row.StartDate);

    if (!courseRecords[key]) {
      courseRecords[key] = {
        minTotal: total,
        minPlusMinus: plusMinus,
        records: [{ player: row.PlayerName, date, displayDate }],
      };
      return;
    }

    const rec = courseRecords[key];
    if (total < rec.minTotal || (total === rec.minTotal && plusMinus < rec.minPlusMinus)) {
      rec.minTotal = total;
      rec.minPlusMinus = plusMinus;
      rec.records = [{ player: row.PlayerName, date, displayDate }];
    } else if (total === rec.minTotal && plusMinus === rec.minPlusMinus) {
      rec.records.push({ player: row.PlayerName, date, displayDate });
    }
  });

  
  const courseRecordsHtml = Object.entries(courseRecords).map(([key, record]) => {
    const [course, layout] = key.split("-");
    const rows = record.records
      .sort((a,b) => b.date - a.date)
      .map(r => `<tr><td>${r.displayDate}</td><td>${r.player}</td><td>${record.minTotal} (${record.minPlusMinus})</td></tr>`)
      .join("");
    return `
      <div class="record-card course-record">
        <h3>${course} - ${layout}</h3>
        <table>
          <thead><tr><th>Date</th><th>Player</th><th>Score</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
  courseContainer.innerHTML = courseRecordsHtml;


  // Personal bests: best score per player+course+layout; tie-breaker min +/-; if exact tie keep most recent date display
  const personalBests = {};
  rows.forEach((row) => {
    const key = `${row.PlayerName}-${row.CourseName}-${row.LayoutName}`;
    const total = safeInt(row.Total);
    const plusMinus = safeInt(row["+/-"]);
    const date = parseCustomDate(row.StartDate);
    const displayDate = convertToSydneyDate(row.StartDate);

    if (!personalBests[key] || total < personalBests[key].minTotal) {
      personalBests[key] = { minTotal: total, minPlusMinus: plusMinus, date, displayDate };
      return;
    }

    if (total === personalBests[key].minTotal && plusMinus < personalBests[key].minPlusMinus) {
      personalBests[key] = { minTotal: total, minPlusMinus: plusMinus, date, displayDate };
      return;
    }

    if (
      total === personalBests[key].minTotal &&
      plusMinus === personalBests[key].minPlusMinus &&
      date > personalBests[key].date
    ) {
      personalBests[key].date = date;
      personalBests[key].displayDate = displayDate;
    }
  });

  const playerBests = {};
  for (const key in personalBests) {
    const [player, course, layout] = key.split("-");
    if (!playerBests[player]) playerBests[player] = [];
    playerBests[player].push({
      course,
      layout,
      minTotal: personalBests[key].minTotal,
      minPlusMinus: personalBests[key].minPlusMinus,
      date: personalBests[key].date,
      displayDate: personalBests[key].displayDate,
    });
  }

  const personalBestsHtml = Object.entries(playerBests)
    .map(([player, bests]) => {
      const bestsList = bests
        .map(
          (b) =>
            `<li><strong>${b.course} - ${b.layout}:</strong> ${b.minTotal} (${b.minPlusMinus}) on ${b.displayDate}</li>`
        )
        .join("");
      return `
        <div class="record-card personal-best ${player.toLowerCase()}">
          <h3>${player}</h3>
          <ul>${bestsList}</ul>
        </div>
      `;
    })
    .join("");

  personalContainer.innerHTML = personalBestsHtml;
}

main().catch((err) => console.error("Records page error:", err));
