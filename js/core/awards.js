import { parseUtcTimestampHHmm } from "./dates.js";
import { inferHoleCount, isRoundComplete } from "./rounds.js?v=2";

function parseDate(s) {
  return parseUtcTimestampHHmm(s) || new Date(0);
}

function fmtDate(d) {
  try {
    return d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "";
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function buildParIndex(rounds) {
  const out = new Map();
  const parRows = rounds.filter((r) => r.PlayerName === "Par");
  for (const r of parRows) {
    const key = `${r.CourseName}||${r.LayoutName}`;
    const holeCount = Math.max(18, inferHoleCount(r));
    const pars = [];
    for (let i = 1; i <= holeCount; i++) {
      const v = parseInt(r[`Hole${i}`], 10);
      pars.push(Number.isFinite(v) ? v : 3);
    }
    out.set(key, { holeCount, pars });
  }
  return out;
}

function getParInfo(parIndex, rowOrDef) {
  const course = rowOrDef.CourseName ?? rowOrDef.courseName;
  const layout = rowOrDef.LayoutName ?? rowOrDef.layoutName;
  return parIndex.get(`${course}||${layout}`);
}

function hasBogey(row, parInfo) {
  const holeCount = parInfo?.holeCount || Math.max(18, inferHoleCount(row));
  const pars = parInfo?.pars || [];
  for (let i = 1; i <= holeCount; i++) {
    const s = parseInt(row[`Hole${i}`], 10);
    const p = pars[i - 1] ?? 3;
    if (Number.isFinite(s) && Number.isFinite(p) && s > p) return true;
  }
  return false;
}

function aceEvents(rows) {
  const ev = [];
  for (const r of rows) {
    const holeCount = Math.max(18, inferHoleCount(r));
    for (let i = 1; i <= holeCount; i++) {
      const s = parseInt(r[`Hole${i}`], 10);
      if (s === 1) {
        ev.push({
          date: parseDate(r.StartDate),
          course: r.CourseName,
          layout: r.LayoutName,
          hole: i,
        });
      }
    }
  }
  ev.sort((a, b) => a.date - b.date);
  return ev;
}

function discRatingAt(points, idx) {
  const window = points
    .slice(Math.max(0, idx - 19), idx + 1)
    .map((p) => p.rating)
    .filter((v) => v > 0);
  if (!window.length) return 0;
  const sorted = window.slice().sort((a, b) => b - a);
  const top = sorted.slice(0, Math.min(8, sorted.length));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

function matchCourseLayout(row, def) {
  if (def.courseName && row.CourseName !== def.courseName) return false;
  if (def.layoutName && row.LayoutName !== def.layoutName) return false;
  return true;
}

function computeBirdieSweep(playerRounds, parIndex, def) {
  // For each hole, find first date where score < par on that hole (birdie or better)
  const holesFirst = new Map(); // hole -> date
  const eligible = playerRounds
    .filter((r) => isRoundComplete(r))
    .filter((r) => matchCourseLayout(r, def))
    .slice()
    .sort((a, b) => parseDate(a.StartDate) - parseDate(b.StartDate));

  if (!eligible.length) return { achieved: false, date: null, progress: { current: 0, target: 18 } };

  const parInfo = getParInfo(parIndex, def) || getParInfo(parIndex, eligible[0]);
  const holeCount = parInfo?.holeCount || 18;
  const pars = parInfo?.pars || new Array(holeCount).fill(3);

  for (const r of eligible) {
    const d = parseDate(r.StartDate);
    for (let i = 1; i <= holeCount; i++) {
      if (holesFirst.has(i)) continue;
      const s = parseInt(r[`Hole${i}`], 10);
      const p = pars[i - 1] ?? 3;
      if (Number.isFinite(s) && Number.isFinite(p) && s > 0 && s < p) {
        holesFirst.set(i, d);
      }
    }
    if (holesFirst.size === holeCount) break;
  }

  const progress = { current: holesFirst.size, target: holeCount };

  if (holesFirst.size !== holeCount) return { achieved: false, date: null, progress };

  // Award date = when last missing hole was birdied the first time (max of first-birdie dates)
  let awardDate = new Date(0);
  let lastHole = null;
  for (const [hole, date] of holesFirst.entries()) {
    if (date > awardDate) {
      awardDate = date;
      lastHole = hole;
    }
  }
  return { achieved: true, date: awardDate, progress: { current: holeCount, target: holeCount }, lastHole };
}

export function computeAwardsFromDefs(rounds, playerName, badgeDefs) {
  const allRounds = rounds.filter((r) => r.PlayerName !== "Par");
  const playerRounds = allRounds.filter((r) => r.PlayerName === playerName);

  const parIndex = buildParIndex(rounds);

  const chronological = playerRounds.slice().sort((a, b) => parseDate(a.StartDate) - parseDate(b.StartDate));
  const ratedChron = chronological.filter((r) => (parseInt(r.RoundRating, 10) || 0) > 0);

  const aces = aceEvents(playerRounds);

  const ratedByDate = playerRounds
    .map((r) => ({ row: r, date: parseDate(r.StartDate), rating: parseInt(r.RoundRating, 10) || 0 }))
    .filter((x) => x.rating > 0)
    .sort((a, b) => a.date - b.date);

  const latestDiscRating = (() => {
    if (!ratedByDate.length) return 0;
    return discRatingAt(ratedByDate, ratedByDate.length - 1);
  })();

  const bestRoundRating = ratedByDate.reduce((m, x) => Math.max(m, x.rating), 0);

  const out = [];

  for (const def of badgeDefs) {
    const base = {
      id: def.id,
      category: def.category,
      title: def.title,
      img: def.img,
      lockedImg: def.lockedImg,
      achieved: false,
      awardedDate: null,
      description: "",
      // Progress support (for sliders/bars)
      progress: null, // { current, target, pct, label }
    };

    const setProgress = (current, target, label) => {
      const pct = target > 0 ? clamp((current / target) * 100, 0, 100) : 0;
      base.progress = { current, target, pct, label };
    };

    if (def.type === "ace_count") {
      const target = def.count || 1;
      const current = aces.length;
      const idx = target - 1;
      const event = aces[idx] || null;

      base.achieved = !!event;
      base.awardedDate = event ? fmtDate(event.date) : null;

      if (base.achieved) {
        base.description = `Ace on Hole ${event.hole} at ${event.course} (${event.layout}).`;
        setProgress(target, target, `${target}/${target} aces`);
      } else {
        base.description = `Record ${target} total ace${target === 1 ? "" : "s"} (a hole score of 1).`;
        setProgress(current, target, `${Math.min(current, target)}/${target} aces`);
      }
    }

    if (def.type === "no_mugsy") {
      let achievedRow = null;
      for (const r of chronological) {
        if (!isRoundComplete(r)) continue;
        if (!matchCourseLayout(r, def)) continue;
        const parInfo = getParInfo(parIndex, r);
        if (!hasBogey(r, parInfo)) {
          achievedRow = r;
          break;
        }
      }
      base.achieved = !!achievedRow;
      base.awardedDate = achievedRow ? fmtDate(parseDate(achievedRow.StartDate)) : null;
      base.description = achievedRow
        ? `No bogeys at ${achievedRow.CourseName} (${achievedRow.LayoutName}). Score: ${achievedRow.Total} (${achievedRow["+/-"]}).`
        : `Get a bogey free round at ${def.courseName}.`;
      // No progress bar (binary)
    }

    if (def.type === "round_rating") {
      const threshold = def.threshold || 200;
      const hit = ratedByDate.find((x) => x.rating >= threshold) || null;

      base.achieved = !!hit;
      base.awardedDate = hit ? fmtDate(hit.date) : null;

      if (base.achieved) {
        base.description = `Round rating ${hit.rating} at ${hit.row.CourseName} (${hit.row.LayoutName}).`;
        setProgress(threshold, threshold, `${threshold}+ achieved`);
      } else {
        base.description = `Achieve a round rating of ${threshold}+.`;
        setProgress(bestRoundRating, threshold, `Best: ${bestRoundRating}/${threshold}`);
      }
    }

    if (def.type === "disc_rating") {
      const threshold = def.threshold || 200;
      let discHit = null;
      for (let i = 0; i < ratedByDate.length; i++) {
        const disc = discRatingAt(ratedByDate, i);
        if (disc >= threshold) {
          discHit = { date: ratedByDate[i].date, disc };
          break;
        }
      }

      base.achieved = !!discHit;
      base.awardedDate = discHit ? fmtDate(discHit.date) : null;

      if (base.achieved) {
        base.description = `All‑time rating reached ${Math.round(discHit.disc)} (best 8 of last 20).`;
        setProgress(threshold, threshold, `${threshold}+ achieved`);
      } else {
        base.description = `Reach an all‑time rating of ${threshold} (best 8 of last 20).`;
        setProgress(Math.round(latestDiscRating), threshold, `Current: ${Math.round(latestDiscRating)}/${threshold}`);
      }
    }

    if (def.type === "rounds_milestone") {
      const n = def.count || 0;
      const reached = ratedChron.length >= n;

      base.achieved = reached;
      base.awardedDate = reached ? fmtDate(parseDate(ratedChron[n - 1].StartDate)) : null;

      if (reached) {
        base.description = `Congratulations on your ${n}th round of StompDonkey Disc Golf.`;
        setProgress(n, n, `${n}/${n} rounds`);
      } else {
        base.description = `Play ${n} rounds. You have ${Math.max(0, n - ratedChron.length)} rounds to go.`;
        setProgress(ratedChron.length, n, `${Math.min(ratedChron.length, n)}/${n} rounds`);
      }
    }

    if (def.type === "birdie_sweep") {
      const res = computeBirdieSweep(playerRounds, parIndex, def);
      base.achieved = res.achieved;
      base.awardedDate = res.achieved ? fmtDate(res.date) : null;

      if (base.achieved) {
        base.description = `Birdied every hole at least once at ${def.courseName}. Last new birdie was Hole ${res.lastHole}.`;
        setProgress(res.progress.target, res.progress.target, `${res.progress.target}/${res.progress.target} holes`);
      } else {
        base.description = `Birdie every hole at least once at ${def.courseName}.`;
        setProgress(res.progress.current, res.progress.target, `${res.progress.current}/${res.progress.target} holes`);
      }
    }

    out.push(base);
  }

  return out;
}

export function allBadgeCountFromDefs(badgeDefs) {
  return Array.isArray(badgeDefs) ? badgeDefs.length : 0;
}
