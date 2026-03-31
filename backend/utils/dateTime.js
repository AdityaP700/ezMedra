function normalizeDateUTC(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeTimeHHMM(timeLike) {
  if (!timeLike) return null;
  const match = String(timeLike).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

module.exports = { normalizeDateUTC, normalizeTimeHHMM };
