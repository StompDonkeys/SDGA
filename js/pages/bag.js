// bag.js — Bag Builder page
// localStorage for live editing + export/import JSON for repo persistence

const PLAYERS = ["ArmyGeddon", "Bucis", "Jobby", "Miza", "Youare22"];
const STORAGE_PREFIX = "sdga_bag_";
const TYPE_COLORS = {
  "Putter": "rgba(76, 175, 80, 0.85)",
  "Midrange": "rgba(255, 193, 7, 0.85)",
  "Fairway Driver": "rgba(255, 152, 0, 0.85)",
  "Distance Driver": "rgba(244, 67, 54, 0.85)",
};
const TYPE_ORDER = ["Putter", "Midrange", "Fairway Driver", "Distance Driver"];

// Sidebar toggle
const sidebar = document.querySelector(".sidebar");
const hamburger = document.querySelector(".hamburger");
if (hamburger && sidebar) {
  hamburger.addEventListener("click", () => {
    sidebar.style.display = sidebar.style.display === "none" ? "block" : "none";
  });
  document.querySelectorAll(".sidebar ul li a").forEach(link => {
    link.addEventListener("click", () => { sidebar.style.display = "none"; });
  });
}

// ── State ──
let allDiscs = [];
let chartInstance = null;

function storageKey(player) { return STORAGE_PREFIX + player; }

function loadBag(player) {
  try {
    const raw = localStorage.getItem(storageKey(player));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBag(player, bag) {
  localStorage.setItem(storageKey(player), JSON.stringify(bag));
}

function addToBag(player, disc) {
  const bag = loadBag(player);
  // Allow duplicates (different plastics etc) but limit to avoid accidents
  bag.push({ name: disc.name, manufacturer: disc.manufacturer, speed: disc.speed, glide: disc.glide, turn: disc.turn, fade: disc.fade, type: disc.type });
  saveBag(player, bag);
}

function removeFromBag(player, index) {
  const bag = loadBag(player);
  bag.splice(index, 1);
  saveBag(player, bag);
}

// ── Chart ──
function renderChart(bag) {
  const canvas = document.getElementById("bagChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // Build data points grouped by type
  const datasets = TYPE_ORDER.map(type => {
    const discs = bag.filter(d => d.type === type);
    return {
      label: type,
      data: discs.map(d => ({ x: d.turn + d.fade, y: d.speed, disc: d })),
      backgroundColor: TYPE_COLORS[type],
      borderColor: TYPE_COLORS[type].replace("0.85", "1"),
      borderWidth: 1.5,
      pointRadius: 8,
      pointHoverRadius: 11,
    };
  }).filter(ds => ds.data.length > 0);

  chartInstance = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Turn + Fade", font: { family: "Oswald", size: 14 } },
          reverse: true,
          min: -4,
          max: 4,
          ticks: { stepSize: 1 },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
        y: {
          title: { display: true, text: "Speed", font: { family: "Oswald", size: 14 } },
          min: 0,
          max: 15,
          ticks: { stepSize: 1 },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
      plugins: {
        legend: {
          position: "top",
          labels: { font: { family: "Oswald", size: 12 }, usePointStyle: true, pointStyle: "circle" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw.disc;
              return `${d.name} (${d.manufacturer}) — ${d.speed}/${d.glide}/${d.turn}/${d.fade}`;
            }
          }
        },
        datalabels: {
          align: "top",
          anchor: "end",
          offset: 4,
          font: { family: "Oswald", size: 11, weight: 600 },
          color: "#2e2e2e",
          formatter: (value) => value.disc.name,
          // Avoid overlap by clipping
          clamp: true,
          clip: false,
        }
      }
    },
    plugins: [ChartDataLabels],
  });
}

// ── Bag list ──
function renderBagList(player) {
  const bag = loadBag(player);
  const container = document.getElementById("bagList");
  const countEl = document.getElementById("bagCount");
  const titleEl = document.getElementById("bagChartTitle");
  if (!container) return;

  if (countEl) countEl.textContent = `(${bag.length})`;
  if (titleEl) titleEl.textContent = `${player}'s Bag`;

  if (!bag.length) {
    container.innerHTML = '<p class="bag-empty">No discs in bag. Search below to add discs.</p>';
    renderChart([]);
    return;
  }

  // Group by type
  const grouped = {};
  bag.forEach((disc, idx) => {
    if (!grouped[disc.type]) grouped[disc.type] = [];
    grouped[disc.type].push({ ...disc, _idx: idx });
  });

  let html = "";
  TYPE_ORDER.forEach(type => {
    const discs = grouped[type];
    if (!discs || !discs.length) return;
    html += `<div class="bag-type-group">
      <div class="bag-type-header" style="border-left: 4px solid ${TYPE_COLORS[type]};">${type} (${discs.length})</div>
      <div class="bag-type-discs">`;
    discs.forEach(d => {
      html += `<div class="bag-disc-card">
        <div class="bag-disc-info">
          <span class="bag-disc-name">${d.name}</span>
          <span class="bag-disc-mfg">${d.manufacturer}</span>
          <span class="bag-disc-flight">${d.speed} / ${d.glide} / ${d.turn} / ${d.fade}</span>
        </div>
        <button class="bag-disc-remove" data-idx="${d._idx}" title="Remove from bag">✕</button>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;

  // Remove buttons
  container.querySelectorAll(".bag-disc-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      removeFromBag(player, idx);
      renderBagList(player);
    });
  });

  renderChart(bag);
}

// ── Disc search / filter ──
const RESULTS_PER_PAGE = 50;

function getFilteredDiscs() {
  const search = (document.getElementById("discSearch")?.value || "").toLowerCase().trim();
  const type = document.getElementById("filterType")?.value || "";
  const mfg = document.getElementById("filterMfg")?.value || "";
  const speed = document.getElementById("filterSpeed")?.value || "";
  const glide = document.getElementById("filterGlide")?.value || "";
  const turn = document.getElementById("filterTurn")?.value || "";
  const fade = document.getElementById("filterFade")?.value || "";

  return allDiscs.filter(d => {
    if (search && !d.name.toLowerCase().includes(search) && !d.manufacturer.toLowerCase().includes(search)) return false;
    if (type && d.type !== type) return false;
    if (mfg && d.manufacturer !== mfg) return false;
    if (speed && d.speed !== parseFloat(speed)) return false;
    if (glide && d.glide !== parseFloat(glide)) return false;
    if (turn && d.turn !== parseFloat(turn)) return false;
    if (fade && d.fade !== parseFloat(fade)) return false;
    return true;
  });
}

function renderDiscResults() {
  const container = document.getElementById("discResults");
  const info = document.getElementById("discResultsInfo");
  if (!container) return;

  const filtered = getFilteredDiscs();
  const shown = filtered.slice(0, RESULTS_PER_PAGE);
  const player = document.getElementById("bagPlayer")?.value;

  if (!filtered.length) {
    container.innerHTML = '<p class="bag-empty">No discs match your filters.</p>';
    if (info) info.textContent = "";
    return;
  }

  let html = '<div class="disc-grid">';
  shown.forEach(d => {
    const typeColor = TYPE_COLORS[d.type] || "#999";
    html += `<div class="disc-card">
      <div class="disc-card-type" style="background: ${typeColor};"></div>
      <div class="disc-card-body">
        <div class="disc-card-name">${d.name}</div>
        <div class="disc-card-mfg">${d.manufacturer}</div>
        <div class="disc-card-flight">${d.speed} / ${d.glide} / ${d.turn} / ${d.fade}</div>
        <div class="disc-card-type-label">${d.type}</div>
      </div>
      <button class="disc-card-add" data-disc='${JSON.stringify(d).replace(/'/g, "&#39;")}' title="Add to bag">+</button>
    </div>`;
  });
  html += "</div>";
  container.innerHTML = html;

  if (info) {
    info.textContent = filtered.length > RESULTS_PER_PAGE
      ? `Showing ${RESULTS_PER_PAGE} of ${filtered.length} discs. Refine your search to see more.`
      : `${filtered.length} disc${filtered.length === 1 ? "" : "s"} found.`;
  }

  // Add buttons
  container.querySelectorAll(".disc-card-add").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!player) return;
      const disc = JSON.parse(btn.dataset.disc);
      addToBag(player, disc);
      renderBagList(player);
      // Flash feedback
      btn.textContent = "✓";
      btn.classList.add("added");
      setTimeout(() => { btn.textContent = "+"; btn.classList.remove("added"); }, 800);
    });
  });
}

// ── Populate filter dropdowns ──
function populateFilterDropdowns() {
  const mfgs = [...new Set(allDiscs.map(d => d.manufacturer))].sort();
  const mfgSelect = document.getElementById("filterMfg");
  if (mfgSelect) {
    mfgSelect.innerHTML = '<option value="">All Manufacturers</option>' +
      mfgs.map(m => `<option value="${m}">${m}</option>`).join("");
  }

  const speeds = [...new Set(allDiscs.map(d => d.speed))].sort((a, b) => a - b);
  const glides = [...new Set(allDiscs.map(d => d.glide))].sort((a, b) => a - b);
  const turns = [...new Set(allDiscs.map(d => d.turn))].sort((a, b) => a - b);
  const fades = [...new Set(allDiscs.map(d => d.fade))].sort((a, b) => a - b);

  populateSelect("filterSpeed", speeds);
  populateSelect("filterGlide", glides);
  populateSelect("filterTurn", turns);
  populateSelect("filterFade", fades);
}

function populateSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">Any</option>' +
    values.map(v => `<option value="${v}">${v}</option>`).join("");
}

// ── Export / Import ──
function exportBag(player) {
  const bag = loadBag(player);
  const blob = new Blob([JSON.stringify({ player, bag }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bag_${player}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBag(player, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const bag = Array.isArray(data.bag) ? data.bag : Array.isArray(data) ? data : [];
      saveBag(player, bag);
      renderBagList(player);
    } catch (err) {
      alert("Invalid bag file: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ── Init ──
async function main() {
  // Load disc database
  try {
    const res = await fetch("discs.json", { cache: "no-store" });
    allDiscs = await res.json();
  } catch (err) {
    console.error("Failed to load disc database:", err);
    allDiscs = [];
  }

  // Player dropdown
  const playerSelect = document.getElementById("bagPlayer");
  if (playerSelect) {
    playerSelect.innerHTML = PLAYERS.map((p, i) =>
      `<option value="${p}" ${i === 0 ? "selected" : ""}>${p}</option>`
    ).join("");
    playerSelect.addEventListener("change", () => renderBagList(playerSelect.value));
  }

  // Export
  document.getElementById("exportBag")?.addEventListener("click", () => {
    if (playerSelect) exportBag(playerSelect.value);
  });

  // Import
  document.getElementById("importBag")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file && playerSelect) importBag(playerSelect.value, file);
    e.target.value = ""; // reset so same file can be re-imported
  });

  // Search/filter events
  const filterEls = ["discSearch", "filterType", "filterMfg", "filterSpeed", "filterGlide", "filterTurn", "filterFade"];
  filterEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === "discSearch" ? "input" : "change", renderDiscResults);
  });

  populateFilterDropdowns();
  renderDiscResults();
  renderBagList(playerSelect?.value || PLAYERS[0]);
}

main();
