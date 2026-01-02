import { loadRounds } from "../core/data.js";
import { computeAwards, allBadgeCount } from "../core/awards.js";

// Standard sidebar toggle
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

const playerSelect = document.getElementById("playerSelect");
const awardsContainer = document.getElementById("awardsContainer");
const awardsCount = document.getElementById("awardsCount");
const awardsSub = document.getElementById("awardsSub");

const allowedPlayers = ["ArmyGeddon","Jobby","Bucis","Miza","Youare22"];

function groupByCategory(badges) {
  const map = new Map();
  for (const b of badges) {
    if (!map.has(b.category)) map.set(b.category, []);
    map.get(b.category).push(b);
  }
  // stable category order
  const order = ["Aces", "No Mugsy", "Ratings", "Rounds"];
  return order
    .filter(k => map.has(k))
    .map(k => [k, map.get(k)]);
}

function badgeCard(b) {
  const img = b.achieved ? b.img : b.lockedImg;
  const status = b.achieved ? "Unlocked" : "Locked";
  const dateLine = b.achieved && b.awardedDate ? `<div class="badge-date">${b.awardedDate}</div>` : `<div class="badge-date">—</div>`;
  const desc = b.description || "";
  return `
    <div class="badge-card ${b.achieved ? "unlocked" : "locked"}" tabindex="0" role="button" aria-label="${b.title} badge">
      <img src="${img}" alt="${b.title} (${status})" loading="lazy" />
      <div class="badge-meta">
        <div class="badge-title">${b.title}</div>
        ${dateLine}
      </div>
      <div class="badge-tooltip">
        <div class="badge-tooltip-title">${b.title}</div>
        <div class="badge-tooltip-text">${desc}</div>
      </div>
    </div>
  `;
}

function renderBadges(playerName, badges) {
  const total = allBadgeCount(badges);
  const earned = badges.filter(b => b.achieved).length;
  awardsCount.textContent = `${earned} / ${total}`;
  awardsSub.textContent = `${playerName} has unlocked ${earned} badges.`;

  const grouped = groupByCategory(badges);

  awardsContainer.innerHTML = grouped.map(([cat, items]) => {
    const unlocked = items.filter(b => b.achieved);
    const locked = items.filter(b => !b.achieved);

    return `
      <section class="badge-section">
        <h3 class="badge-section-title">${cat}</h3>

        <div class="badge-grid">
          ${unlocked.map(badgeCard).join("")}
          ${locked.map(badgeCard).join("")}
        </div>
      </section>
    `;
  }).join("");
}

async function main() {
  try {
    const rounds = await loadRounds({ filterComplete: true, includePlayers: [...allowedPlayers, "Par"] });

    playerSelect.innerHTML = allowedPlayers
      .slice()
      .sort((a,b)=>a.localeCompare(b,'en-AU'))
      .map(p => `<option value="${p}">${p}</option>`)
      .join("");

    playerSelect.value = allowedPlayers.slice().sort((a,b)=>a.localeCompare(b,'en-AU'))[0];

    const update = () => {
      const p = playerSelect.value;
      const badges = computeAwards(rounds, p);
      renderBadges(p, badges);
    };

    playerSelect.addEventListener("change", update);
    update();
  } catch (e) {
    console.error(e);
    if (awardsContainer) {
      awardsContainer.innerHTML = `<div class="error">Failed to load awards: ${String(e.message || e)}</div>`;
    }
  }
}

main();
