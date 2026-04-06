import { loadRounds } from "../core/data.js";
import { parseUtcTimestampHHmm, formatShortDate } from "../core/dates.js";

async function main() {
  const tableHead = document.getElementById("roundsHead");
  const tableBody = document.getElementById("roundsBody");

  if (!tableHead || !tableBody) return;

  // Load complete rounds for all players
  const rows = await loadRounds({ filterComplete: true });
  
  // Sort by date descending
  const sorted = rows.sort((a, b) => {
    return parseUtcTimestampHHmm(b.StartDate) - parseUtcTimestampHHmm(a.StartDate);
  });

  /**
   * Extracts keys starting with "Hole", parses the score, 
   * and sorts them numerically by hole number.
   */
  function extractHoleScores(row) {
    return Object.keys(row)
      .filter(k => k.startsWith("Hole"))
      .map(k => ({ hole: k, score: parseInt(row[k], 10) }))
      .filter(x => Number.isFinite(x.score))
      .sort((a, b) => parseInt(a.hole.replace("Hole", ""), 10) - parseInt(b.hole.replace("Hole", ""), 10));
  }

  function renderTable() {
    if (sorted.length === 0) {
      tableBody.innerHTML = "<tr><td colspan='100%'>No rounds found.</td></tr>";
      return;
    }

    // Use the first row to determine the number of holes for the header
    const firstHoles = extractHoleScores(sorted[0]);
    
    // Updated: Remove "Hole" prefix for display (e.g., "Hole1" becomes "1")
    const holeHeaders = firstHoles.map(h => `<th>${h.hole.replace("Hole", "")}</th>`).join("");

    tableHead.innerHTML = `
      <tr>
        <th>Date</th>
        <th>Player</th>
        <th>Course</th>
        <th>Layout</th>
        ${holeHeaders}
        <th>Total</th>
        <th>+/-</th>
      </tr>
    `;

    tableBody.innerHTML = sorted.map(r => {
      const holes = extractHoleScores(r);
      const holeCells = holes.map(h => `<td>${h.score}</td>`).join("");
      const dateStr = formatShortDate(parseUtcTimestampHHmm(r.StartDate));

      return `
        <tr>
          <td>${dateStr}</td>
          <td><strong>${r.PlayerName}</strong></td>
          <td>${r.CourseName}</td>
          <td>${r.LayoutName}</td>
          ${holeCells}
          <td>${r.Total}</td>
          <td>${r["+/-"]}</td>
        </tr>
      `;
    }).join("");
  }

  renderTable();
}

main().catch(err => console.error("Rounds page error:", err));