import { loadRounds } from "../core/data.js";
import { computeAwardsFromDefs, allBadgeCountFromDefs } from "../core/awards.js";

// Standard sidebar toggle
function setupSidebar() {
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
}

const allowedPlayers = ["ArmyGeddon", "Jobby", "Bucis", "Miza", "Youare22"];

function groupByCategory(badges) {
  const map = new Map();
  for (const b of badges) {
    const cat = b.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(b);
  }

  // Preferred display order (anything else gets appended alphabetically).
  const preferred = ["Aces", "No Mugsy", "Birdie Sweep", "Ratings", "Rounds"];
  const remaining = [...map.keys()].filter((k) => !preferred.includes(k)).sort((a, b) => a.localeCompare(b, "en-AU"));
  const orderedCats = preferred.filter((k) => map.has(k)).concat(remaining);

  const parseFirstInt = (s) => {
    const m = String(s || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };

  // Sort items within specific categories.
  for (const cat of orderedCats) {
    const items = map.get(cat) || [];
    if (cat === "Rounds" || cat === "Ratings") {
      // Sort by numeric threshold (e.g., 20, 50, 100 ... or 150/200 rating)
      items.sort((a, b) => {
        const na = parseFirstInt(a.title);
        const nb = parseFirstInt(b.title);
        if (na !== nb) return na - nb;
        // Tie-breaker: show unlocked first, then alpha
        if (!!a.achieved !== !!b.achieved) return a.achieved ? -1 : 1;
        return String(a.title || "").localeCompare(String(b.title || ""), "en-AU");
      });
    } else {
      // Default: unlocked first, then alphabetical
      items.sort((a, b) => {
        if (!!a.achieved !== !!b.achieved) return a.achieved ? -1 : 1;
        return String(a.title || "").localeCompare(String(b.title || ""), "en-AU");
      });
    }
    map.set(cat, items);
  }

  return orderedCats.map((k) => [k, map.get(k)]);
}


function badgeCard(b) {
  const img = b.achieved ? b.img : b.lockedImg;
  const status = b.achieved ? "Unlocked" : "Locked";
  const dateLine =
    b.achieved && b.awardedDate
      ? `<div class="badge-date">${b.awardedDate}</div>`
      : `<div class="badge-date">—</div>`;

  const progress =
    b.progress
      ? `
        <div class="badge-progress" aria-label="${b.progress.label}">
          <div class="badge-progress-bar">
            <div class="badge-progress-fill" style="width:${b.progress.pct.toFixed(0)}%"></div>
          </div>
          <div class="badge-progress-text">${b.progress.label}</div>
        </div>
      `
      : "";

  const desc = b.description || "";
  return `
    <div class="badge-card ${b.achieved ? "unlocked" : "locked"}" tabindex="0" role="button" aria-label="${b.title} badge">
      <div class="badge-img"><img src="${img}" alt="${b.title} (${status})" loading="lazy" /></div>
      <div class="badge-meta">
        <div class="badge-title">${b.title}</div>
        ${dateLine}
        ${progress}
      </div>
      <div class="badge-tooltip">
        <div class="badge-tooltip-title">${b.title}</div>
        <div class="badge-tooltip-text">${desc}</div>
      </div>
    </div>
  `;
}


function renderBadges(playerName, badges, badgeDefs, els) {
  const { awardsContainer, awardsCount, awardsSub } = els;

  const total = allBadgeCountFromDefs(badgeDefs);
  const earned = badges.filter((b) => b.achieved).length;

  awardsCount.textContent = `${earned} / ${total}`;
  awardsSub.textContent = `${playerName} has unlocked ${earned} badges.`;

  const grouped = groupByCategory(badges);

  awardsContainer.innerHTML = grouped
    .map(([cat, items]) => {
      const unlocked = items.filter((b) => b.achieved);
      const locked = items.filter((b) => !b.achieved);

      return `
        <section class="badge-section">
          <h3 class="badge-section-title">${cat}</h3>
          <div class="badge-grid">
            ${unlocked.map(badgeCard).join("")}
            ${locked.map(badgeCard).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

async function initAwards() {
  setupSidebar();

  const playerSelect = document.getElementById("playerSelect");
  const awardsContainer = document.getElementById("awardsContainer");
  const awardsCount = document.getElementById("awardsCount");
  const awardsSub = document.getElementById("awardsSub");

  if (!playerSelect || !awardsContainer || !awardsCount || !awardsSub) return;

  // Always populate dropdown first (even if data load fails)
  const sortedPlayers = allowedPlayers.slice().sort((a, b) => a.localeCompare(b, "en-AU"));
  playerSelect.innerHTML = sortedPlayers.map((p) => `<option value="${p}">${p}</option>`).join("");
  playerSelect.value = sortedPlayers[0];

  try {
    const badgeDefsRes = await fetch('badges.json');
    const badgeDefs = await badgeDefsRes.json();

    const rounds = await loadRounds({
      filterComplete: true,
      includePlayers: [...allowedPlayers, "Par"],
    });

    const update = () => {
      const p = playerSelect.value;
      const badges = computeAwardsFromDefs(rounds, p, badgeDefs);
      renderBadges(p, badges, badgeDefs, { awardsContainer, awardsCount, awardsSub });
    };

    playerSelect.addEventListener("change", update);
    update();
  } catch (e) {
    console.error(e);
    awardsContainer.innerHTML = `<div class="error">Failed to load awards data. Make sure data.csv is accessible from the same site.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", initAwards);
