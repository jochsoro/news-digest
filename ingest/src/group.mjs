/**
 * Regroupement : à partir des articles bruts, construit pour chaque région
 * et chaque thème la liste des meilleurs articles.
 *
 * Agrégation hiérarchique : un article d'Abidjan nourrit l'édition d'Abidjan,
 * de la Côte d'Ivoire, de l'Afrique et du Monde — pondéré de moins en moins
 * fort à mesure qu'on monte, pour que « Monde » reste dominé par les flux
 * mondiaux et pas par la somme des faits divers locaux.
 */
import { readFile } from 'node:fs/promises';

/** Articles max gardés par (région, thème) pour le résumé. */
const PER_BLOCK = 6;
/** Décote par niveau de remontée dans la hiérarchie (ville → pays → …). */
const CLIMB_PENALTY = 0.75;

export async function loadTaxonomy() {
  const raw = JSON.parse(await readFile(new URL('../regions.json', import.meta.url), 'utf8'));
  const byId = new Map(raw.regions.map((r) => [r.id, r]));
  return { regions: raw.regions, byId, categories: raw.categories };
}

/** Chaîne région → parents, jusqu'à la racine. */
export function ancestry(byId, regionId) {
  const out = [];
  let cur = byId.get(regionId);
  while (cur) {
    out.push(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return out;
}

/**
 * @returns Map<regionId, Map<categoryId, Article[]>>
 */
export function group(articles, taxonomy) {
  const deduped = dedupe(articles);
  const buckets = new Map();

  for (const a of deduped) {
    const chain = ancestry(taxonomy.byId, a.regionId);
    if (chain.length === 0) continue; // région inconnue : on ignore
    chain.forEach((regionId, depth) => {
      const perRegion = buckets.get(regionId) ?? new Map();
      const list = perRegion.get(a.categoryId) ?? [];
      list.push({ ...a, score: score(a, deduped) * Math.pow(CLIMB_PENALTY, depth) });
      perRegion.set(a.categoryId, list);
      buckets.set(regionId, perRegion);
    });
  }

  // Tri + coupe par bloc.
  for (const perRegion of buckets.values()) {
    for (const [cat, list] of perRegion) {
      list.sort((x, y) => y.score - x.score);
      perRegion.set(cat, list.slice(0, PER_BLOCK));
    }
  }
  return buckets;
}

/** Deux flux publient souvent le même papier : on garde celui qui a une image. */
function dedupe(articles) {
  const byId = new Map();
  const byTitle = new Map();
  for (const a of articles) {
    const key = normalizeTitle(a.title);
    const prev = byId.get(a.id) ?? byTitle.get(key);
    if (!prev) {
      byId.set(a.id, a);
      byTitle.set(key, a);
      continue;
    }
    // Même article : on enrichit (image, chapô plus long) et on note la reprise.
    prev.mentions = (prev.mentions ?? 1) + 1;
    if (!prev.imageUrl && a.imageUrl) prev.imageUrl = a.imageUrl;
    if ((a.summary?.length ?? 0) > (prev.summary?.length ?? 0)) prev.summary = a.summary;
  }
  return [...byId.values()];
}

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(le|la|les|un|une|des|du|de|d|l|en|a|au|aux|et|the|of|in|on|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

/**
 * Score 0–1 : fraîcheur (dominante), reprise par plusieurs flux, présence
 * d'une image (on préfère une manchette illustrée), chapô exploitable.
 */
function score(a) {
  const ageH = Math.max(0, (Date.now() - Date.parse(a.publishedAt)) / 3_600_000);
  const freshness = Math.max(0, 1 - ageH / 36); // 1 maintenant → 0 à 36 h
  const mentions = Math.min(1, ((a.mentions ?? 1) - 1) / 3); // 0 → 1 à partir de 4 reprises
  const image = a.imageUrl ? 1 : 0;
  const body = Math.min(1, (a.summary?.length ?? 0) / 200);
  return 0.55 * freshness + 0.25 * mentions + 0.12 * image + 0.08 * body;
}
