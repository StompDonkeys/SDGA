/**
 * Data loading and normalisation.
 * Relies on PapaParse being available globally (window.Papa).
 */

import { isRoundComplete } from "./rounds.js?v=2";

export async function loadCsvText(path = "data.csv") {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  return await res.text();
}

export async function loadRounds(options = {}) {
  const {
    path = "data.csv",
    filterComplete = true,
    includePlayers = null,     // array of player names, or null for all
    excludePlayers = [],       // array of player names
  } = options;

  if (!window.Papa) throw new Error("PapaParse not found. Make sure papaparse is loaded before your module.");

  const csvText = await loadCsvText(path);

  const parsed = await new Promise((resolve, reject) => {
    window.Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: resolve,
      error: reject,
    });
  });

  const rows = Array.isArray(parsed.data) ? parsed.data : [];

  let out = rows;

  if (includePlayers && Array.isArray(includePlayers) && includePlayers.length) {
    const set = new Set(includePlayers);
    out = out.filter(r => set.has(r.PlayerName));
  }

  if (excludePlayers && excludePlayers.length) {
    const set = new Set(excludePlayers);
    out = out.filter(r => !set.has(r.PlayerName));
  }

  if (filterComplete) {
    out = out.filter(isRoundComplete);
  }

  return out;
}
