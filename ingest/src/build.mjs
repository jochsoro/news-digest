/**
 * Orchestrateur : fabrique les éditions du jour.
 *
 *   flux RSS ──▶ articles ──▶ (région × thème) ──▶ résumés ──▶ out/digests/…
 *
 * Sortie (servie telle quelle par un CDN statique) :
 *   out/digests/<regionId>/<YYYY-MM-DD>.json   l'édition du jour
 *   out/digests/<regionId>/latest.json         copie de la dernière édition
 *   out/index.json                             régions publiées + horodatage
 *   out/_headers                               CORS pour Cloudflare Pages
 *
 * Le JSON suit exactement le modèle `Digest` de l'app (src/app/core/models).
 *
 * Variables d'environnement :
 *   GEMINI_API_KEY   clé Gemini (sinon résumé extractif)
 *   GEMINI_MODEL     défaut gemini-2.5-flash
 *   DIGEST_FIXTURE=1 mode hors ligne : flux de test dans fixtures/
 *   DIGEST_OUT       dossier de sortie (défaut ./out)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchAll, loadFeeds } from './fetch-feeds.mjs';
import { group, loadTaxonomy } from './group.mjs';
import { summarizeRegion } from './summarize.mjs';
import { dateInZone, log } from './util.mjs';

const FIXTURE = process.env.DIGEST_FIXTURE === '1';
const OUT = resolve(process.env.DIGEST_OUT || 'out');
/** Sous ce nombre d'articles, une région n'a pas d'édition (pas de page vide). */
const MIN_ARTICLES = 3;
/** Essais og:image pour les manchettes sans visuel (requêtes HTML, bornées). */
const OG_IMAGE_BUDGET = 40;

async function main() {
  const started = Date.now();
  const date = dateInZone('Europe/Paris');
  log(`Édition du ${date}${FIXTURE ? ' (FIXTURE)' : ''}`);

  const taxonomy = await loadTaxonomy();
  const feeds = await loadFeeds(FIXTURE);
  log(`${feeds.length} flux à lire`);

  const { articles, failures } = await fetchAll(feeds, { fixture: FIXTURE });
  log(`${articles.length} articles collectés, ${failures.length} flux en échec`);

  const buckets = group(articles, taxonomy);

  let ogBudget = OG_IMAGE_BUDGET;
  const published = [];
  const stats = { llm: 0, extractive: 0 };

  for (const region of taxonomy.regions) {
    const perCategory = buckets.get(region.id);
    if (!perCategory) continue;
    const total = [...perCategory.values()].reduce((n, l) => n + l.length, 0);
    if (total < MIN_ARTICLES) {
      log(`– ${region.name} : ${total} article(s), pas d'édition`);
      continue;
    }

    log(`▶ ${region.name} — ${perCategory.size} thèmes, ${total} articles`);
    const summaries = await summarizeRegion(region.name, perCategory);

    const blocks = [];
    for (const [category, items] of perCategory) {
      const s = summaries.get(category);
      if (!s?.summary) continue;
      stats[s.method]++;

      const lead = items[0];
      let imageUrl = items.find((a) => a.imageUrl)?.imageUrl;
      if (!imageUrl && !FIXTURE && ogBudget > 0) {
        ogBudget--;
        imageUrl = await fetchOgImage(lead.url);
      }

      blocks.push({
        category,
        summary: s.summary,
        sources: items.slice(0, 4).map((a) => ({
          title: a.title,
          url: a.url,
          source: a.source,
          ...(a.imageUrl ? { imageUrl: a.imageUrl } : {}),
        })),
        // Importance éditoriale 0–1 : score du meilleur article, lissé par le volume.
        salience: round(Math.min(1, 0.6 * (lead.score ?? 0.5) + 0.4 * Math.min(1, items.length / 5))),
        ...(imageUrl ? { image: { url: imageUrl, credit: lead.source } } : {}),
      });
    }

    // Les thèmes les plus importants d'abord (l'app re-trie ensuite par profil).
    blocks.sort((a, b) => b.salience - a.salience);

    const digest = {
      regionId: region.id,
      date,
      blocks,
      generatedAt: new Date().toISOString(),
      method: summaries.size ? [...summaries.values()].some((v) => v.method === 'llm') ? 'llm' : 'extractive' : 'extractive',
    };

    const dir = resolve(OUT, 'digests', region.id);
    await mkdir(dir, { recursive: true });
    const json = JSON.stringify(digest);
    await writeFile(resolve(dir, `${date}.json`), json);
    await writeFile(resolve(dir, 'latest.json'), json);
    published.push({ regionId: region.id, name: region.name, blocks: blocks.length, method: digest.method });
  }

  await mkdir(OUT, { recursive: true });
  await writeFile(
    resolve(OUT, 'index.json'),
    JSON.stringify({ date, generatedAt: new Date().toISOString(), regions: published, failures: failures.length }, null, 2),
  );
  // Cloudflare Pages lit _headers ; GitHub Pages envoie déjà CORS * pour les fichiers statiques.
  await writeFile(resolve(OUT, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n');

  log(`Terminé en ${Math.round((Date.now() - started) / 1000)} s : ${published.length} éditions, ${stats.llm} blocs LLM, ${stats.extractive} blocs extractifs → ${OUT}`);
  if (published.length === 0) {
    console.error('Aucune édition produite : échec.');
    process.exit(1);
  }
}

/** og:image d'une page, avec un budget serré : on lit au plus 64 Ko. */
async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NewsDigestBot/0.1', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if (!res.ok || !res.body) return undefined;
    const reader = res.body.getReader();
    let html = '';
    const dec = new TextDecoder();
    while (html.length < 65_536) {
      const { value, done } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const m =
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html) ||
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
    return m?.[1] ? new URL(m[1], url).toString() : undefined;
  } catch {
    return undefined;
  }
}

const round = (n) => Math.round(n * 100) / 100;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
