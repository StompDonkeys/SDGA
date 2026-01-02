import { parseUtcTimestampHHmm } from "./dates.js";
import { inferHoleCount } from "./rounds.js";

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

function buildParIndex(rounds) {
  // key: course||layout -> { holeCount, pars[] }
  const out = new Map();
  const parRows = rounds.filter(r => r.PlayerName === "Par");
  for (const r of parRows) {
    const key = `${r.CourseName}||${r.LayoutName}`;
    const holeCount = inferHoleCount(r);
    const pars = [];
    for (let i=1;i<=holeCount;i++){
      const v = parseInt(r[`Hole${i}`],10);
      pars.push(Number.isFinite(v) ? v : 3);
    }
    out.set(key, { holeCount, pars });
  }
  return out;
}

function hasBogey(row, parInfo) {
  const holeCount = parInfo?.holeCount || inferHoleCount(row) || 18;
  const pars = parInfo?.pars || [];
  for (let i=1;i<=holeCount;i++){
    const s = parseInt(row[`Hole${i}`],10);
    const p = pars[i-1] ?? 3;
    if (Number.isFinite(s) && Number.isFinite(p) && s > p) return true;
  }
  return false;
}

function aceEvents(rows) {
  // returns [{date, course, layout, hole}]
  const ev = [];
  for (const r of rows) {
    const holeCount = inferHoleCount(r);
    for (let i=1;i<=holeCount;i++){
      const s = parseInt(r[`Hole${i}`],10);
      if (s === 1) {
        ev.push({ date: parseDate(r.StartDate), course: r.CourseName, layout: r.LayoutName, hole: i });
      }
    }
  }
  ev.sort((a,b)=>a.date-b.date);
  return ev;
}

function discRatingAt(points, idx) {
  // points sorted asc: [{date, rating}]
  const window = points.slice(Math.max(0, idx-19), idx+1).map(p=>p.rating).filter(v=>v>0);
  if (!window.length) return 0;
  const sorted = window.slice().sort((a,b)=>b-a);
  const top = sorted.slice(0, Math.min(8, sorted.length));
  return top.reduce((s,v)=>s+v,0)/top.length;
}

export function computeAwards(rounds, playerName) {
  const playerRounds = rounds.filter(r => r.PlayerName === playerName);
  const allRoundsNoPar = rounds.filter(r => r.PlayerName !== "Par");

  const parIndex = buildParIndex(rounds);

  // helper to find milestone date (Nth round)
  const chronological = playerRounds.slice().sort((a,b)=>parseDate(a.StartDate)-parseDate(b.StartDate));

  // Count rounds that have a rating (per earlier decisions)
  const ratedChron = chronological.filter(r => (parseInt(r.RoundRating,10) || 0) > 0);

  const awards = [];

  // --- Aces ---
  const aces = aceEvents(playerRounds);
  const firstAce = aces[0] || null;
  awards.push({
    id: "AceClub_1",
    category: "Aces",
    title: "First Ace",
    achieved: !!firstAce,
    awardedDate: firstAce ? fmtDate(firstAce.date) : null,
    description: firstAce ? `Ace on Hole ${firstAce.hole} at ${firstAce.course} (${firstAce.layout}).` : "Record an ace (a hole score of 1).",
    img: "images/badges/Badge_AceClub_1.png",
    lockedImg: "images/Badges_locked/Locked_AceClub_1.png"
  });

  const fifthAce = aces.length >= 5 ? aces[4] : null;
  awards.push({
    id: "AceClub_5",
    category: "Aces",
    title: "5 Aces",
    achieved: !!fifthAce,
    awardedDate: fifthAce ? fmtDate(fifthAce.date) : null,
    description: fifthAce ? `Your 5th ace was on Hole ${fifthAce.hole} at ${fifthAce.course} (${fifthAce.layout}).` : "Record 5 total aces.",
    img: "images/badges/Badge_AceClub_5.png",
    lockedImg: "images/Badges_locked/Locked_AceClub_5.png"
  });

  // --- No Mugsy (no bogeys) per course badge ---
  const mugsyBadges = [
    { id:"Mugsy_BelcoA", title:"No Mugsy – Belco (A)", match:(c,l)=>/John Knight Memorial Park/i.test(c) && /\(A-Pin Position\)|A-Pin|Layout.*A/i.test(l) },
    { id:"Mugsy_BelcoB", title:"No Mugsy – Belco (B)", match:(c,l)=>/John Knight Memorial Park/i.test(c) && /\(B-Pin Position\)|B-Pin|Layout.*B/i.test(l) },
    { id:"Mugsy_Tuggies", title:"No Mugsy – Tuggies", match:(c,l)=>/Athllon Park/i.test(c) },
    { id:"Mugsy_WestonParkWhite", title:"No Mugsy – Weston Park (White Tees)", match:(c,l)=>/Weston Park White Tees/i.test(c) || /Weston Park/i.test(c) && /White/i.test(l) },
    { id:"Mugsy_Woden", title:"No Mugsy – Woden", match:(c,l)=>/Edison Park/i.test(c) || /Woden/i.test(c) },
  ];

  for (const b of mugsyBadges) {
    let achievedRow = null;
    for (const r of chronological) {
      const key = `${r.CourseName}||${r.LayoutName}`;
      const parInfo = parIndex.get(key);
      if (!b.match(r.CourseName, r.LayoutName)) continue;
      if (!hasBogey(r, parInfo)) { achievedRow = r; break; }
    }
    const d = achievedRow ? parseDate(achievedRow.StartDate) : null;
    awards.push({
      id: b.id,
      category: "No Mugsy",
      title: b.title,
      achieved: !!achievedRow,
      awardedDate: d ? fmtDate(d) : null,
      description: achievedRow
        ? `No bogeys at ${achievedRow.CourseName} (${achievedRow.LayoutName}). Score: ${achievedRow.Total} (${achievedRow["+/-"]}).`
        : "First round on this course with no bogeys (no hole worse than par).",
      img: `images/badges/Badge_${b.id}.png`,
      lockedImg: `images/Badges_locked/Locked_${b.id}.png`
    });
  }

  // --- Ratings ---
  // Round rating 200+
  const ratedByDate = playerRounds
    .map(r => ({ row:r, date: parseDate(r.StartDate), rating: parseInt(r.RoundRating,10)||0 }))
    .filter(x => x.rating > 0)
    .sort((a,b)=>a.date-b.date);

  const round200 = ratedByDate.find(x => x.rating >= 200) || null;
  awards.push({
    id: "Rating_200_Round",
    category: "Ratings",
    title: "200 Round Rating",
    achieved: !!round200,
    awardedDate: round200 ? fmtDate(round200.date) : null,
    description: round200 ? `Round rating ${round200.rating} at ${round200.row.CourseName} (${round200.row.LayoutName}).` : "Achieve a round rating of 200+.",
    img: "images/badges/Badge_Rating_200_Round.png",
    lockedImg: "images/Badges_locked/Locked_Rating_200_Round.png"
  });

  // Disc rating 200+ (best 8 of last 20)
  let disc200 = null;
  for (let i=0;i<ratedByDate.length;i++){
    const disc = discRatingAt(ratedByDate, i);
    if (disc >= 200) { disc200 = { date: ratedByDate[i].date, disc }; break; }
  }
  awards.push({
    id: "Rating_200_AllTime",
    category: "Ratings",
    title: "200 All‑Time Rating",
    achieved: !!disc200,
    awardedDate: disc200 ? fmtDate(disc200.date) : null,
    description: disc200 ? `All‑time rating reached ${Math.round(disc200.disc)} (best 8 of last 20).` : "Reach an all‑time rating of 200 (best 8 of last 20 rounds).",
    img: "images/badges/Badge_Rating_200_AllTime.png",
    lockedImg: "images/Badges_locked/Locked_Rating_200_AllTime.png"
  });

  // --- Round milestones (rated rounds) ---
  const milestones = [20, 50, 100, 150, 200, 250, 300];
  for (const n of milestones) {
    const reached = ratedChron.length >= n;
    const row = reached ? ratedChron[n-1] : null;
    const d = row ? parseDate(row.StartDate) : null;
    awards.push({
      id: `Rounds_${n}`,
      category: "Rounds",
      title: `${n} Rounds`,
      achieved: reached,
      awardedDate: d ? fmtDate(d) : null,
      description: reached ? `Reached ${n} rated rounds at ${row.CourseName} (${row.LayoutName}).` : `Play ${n} rated rounds.`,
      img: `images/badges/Badge_Rounds_${n}.png`,
      lockedImg: `images/Badges_locked/Locked_Rounds_${n}.png`
    });
  }

  return awards;
}

export function allBadgeCount(badges) {
  return Array.isArray(badges) ? badges.length : 0;
}
