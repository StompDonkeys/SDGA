/**
 * Round helpers.
 */

export function inferHoleCount(row) {
  // Find the highest HoleN column with a valid numeric score.
  let max = 0;
  for (const key of Object.keys(row)) {
    const m = /^Hole(\d+)$/.exec(key);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const v = parseInt(row[key], 10);
    if (!Number.isNaN(v) && v > 0) max = Math.max(max, n);
  }
  // Default to 18 if we couldn't infer.
  return max || 18;
}

export function isRoundComplete(row) {
  const holes = inferHoleCount(row);

  // Only treat 18+ hole rounds as complete (filters out short layouts like Gold Creek 1–9).
  if (holes < 18) return false;

  // Explicitly exclude known short layouts even if played multiple loops.
  const course = String(row.CourseName || "").toLowerCase();
  const layout = String(row.LayoutName || "").toLowerCase();
  if (course.includes("1-9") || course.includes("1–9") || layout.includes("1-9") || layout.includes("1–9")) return false;

  for (let i = 1; i <= holes; i++) {
    const v = parseInt(row[`Hole${i}`], 10);
    if (Number.isNaN(v) || v <= 0) return false;
  }
  return true;
}

export function countAces(rounds) {
  let aceCount = 0;
  for (const round of rounds) {
    const holes = inferHoleCount(round);
    for (let i = 1; i <= holes; i++) {
      if (parseInt(round[`Hole${i}`], 10) === 1) aceCount++;
    }
  }
  return aceCount;
}