export function log(...args) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}]`, ...args);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** YYYY-MM-DD dans un fuseau donné (l'édition est datée à l'heure de Paris). */
export function dateInZone(tz = 'Europe/Paris', d = new Date()) {
  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
