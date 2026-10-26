/**
 * Diagnostic : lit chaque flux de feeds.json et affiche ce qu'il rend
 * (nombre d'articles, date du plus récent, présence d'images).
 * À lancer après avoir modifié la liste : `npm run check-feeds`.
 */
import { fetchAll, loadFeeds } from './fetch-feeds.mjs';

const feeds = await loadFeeds(false);
const { articles, failures } = await fetchAll(feeds);

const byFeed = new Map();
for (const a of articles) {
  const k = `${a.regionId}/${a.categoryId}`;
  const s = byFeed.get(k) ?? { n: 0, img: 0, newest: 0 };
  s.n++;
  if (a.imageUrl) s.img++;
  s.newest = Math.max(s.newest, Date.parse(a.publishedAt));
  byFeed.set(k, s);
}

console.log('\nRésumé par (région/thème) :');
for (const [k, s] of [...byFeed].sort()) {
  const age = s.newest ? `${Math.round((Date.now() - s.newest) / 3_600_000)} h` : '?';
  console.log(`  ${k.padEnd(26)} ${String(s.n).padStart(3)} art.  ${String(s.img).padStart(3)} avec image  plus récent : il y a ${age}`);
}

if (failures.length) {
  console.log('\nFlux en échec (à corriger ou retirer) :');
  for (const f of failures) console.log(`  ✗ ${f.feed.source} [${f.feed.regionId}/${f.feed.categoryId}] ${f.feed.url}\n     ${f.error}`);
}
console.log(`\n${articles.length} articles, ${failures.length}/${feeds.length} flux en échec.`);
