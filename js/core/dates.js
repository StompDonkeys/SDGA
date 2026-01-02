/**
 * Date helpers.
 * The CSV stores UTC timestamps like "2025-03-09 2052" (HHmm with no colon).
 */

export function parseUtcTimestampHHmm(utcDateStr) {
  if (!utcDateStr) return null;
  const [datePart, timePart = "0000"] = String(utcDateStr).trim().split(" ");
  const hh = timePart.slice(0, 2);
  const mm = timePart.slice(2).padEnd(2, "0");
  // Force UTC parse.
  const d = new Date(`${datePart}T${hh}:${mm}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toSydneyISODate(utcDateStr) {
  const d = parseUtcTimestampHHmm(utcDateStr);
  if (!d) return (utcDateStr || "").split(" ")[0] || "";
  try {
    // Returns dd/mm/yyyy under en-AU; convert to yyyy-mm-dd
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d).split("/").reverse().join("-");
  } catch {
    return (utcDateStr || "").split(" ")[0] || "";
  }
}

/**
 * Loose date parse used for sorting/grouping by calendar date only.
 * Accepts the CSV timestamp or yyyy-mm-dd.
 */
export function parseCalendarDate(dateStr) {
  if (!dateStr) return null;
  const [datePart] = String(dateStr).trim().split(" ");
  const d = new Date(datePart);
  return Number.isNaN(d.getTime()) ? null : d;
}
