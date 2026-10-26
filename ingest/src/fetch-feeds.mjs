/**
 * Collecte : lit chaque flux RSS/Atom de feeds.json et renvoie une liste
 * d'articles normalisés. Un flux qui échoue est ignoré (journalisé), jamais
 * bloquant : l'édition sort même si la moitié des sources tombent.
 */
import Parser from 'rss-parser';
import { readFile } from 'node:fs/promises';
import { log } from './util.mjs';

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 8;
/** Au-delà, un article est trop vieux pour une édition « du jour ». */
const MAX_AGE_HOURS = 36;

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: {
    'User-Agent': 'NewsDigestBot/0.1 (+https://github.com/jochsoro/news-digest; digest quotidien, résumé + lien vers la source)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:group', 'mediaGroup'],
      ['content:encoded', 'contentEncoded'],
      ['enclosure', 'enclosure'],
      ['source', 'itemSource'],
    ],
  },
});

/**
 * @typedef {Object} Article
 * @property {string} id         hash stable de l'URL canonique
 * @property {string} title
 * @property {string} summary    chapô nettoyé (texte brut)
 * @property {string} url
 * @property {string} source     nom du média
 * @property {string} publishedAt ISO 8601
 * @property {string=} imageUrl
 * @property {string} regionId   région du flux d'origine
 * @property {string} categoryId thème du flux d'origine
 * @property {string} lang
 */

/** Charge la liste des flux, ou la fixture en mode hors ligne. */
export async function loadFeeds(fixture) {
  if (fixture) {
    return [
      { regionId: 'ci', categoryId: 'general', url: 'fixture:ci-general', source: 'Fixture CI', lang: 'fr' },
      { regionId: 'ci', categoryId: 'sports', url: 'fixture:ci-sports', source: 'Fixture Sport', lang: 'fr' },
      { regionId: 'fr', categoryId: 'general', url: 'fixture:fr-general', source: 'Fixture FR', lang: 'fr' },
      { regionId: 'world', categoryId: 'science', url: 'fixture:world-science', source: 'Fixture Science', lang: 'fr' },
    ];
  }
  const raw = JSON.parse(await readFile(new URL('../feeds.json', import.meta.url), 'utf8'));
  return raw.feeds;
}

/** Lit tous les flux avec une concurrence bornée. */
export async function fetchAll(feeds, { fixture = false } = {}) {
  const results = [];
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < feeds.length) {
      const feed = feeds[cursor++];
      try {
        const items = await fetchOne(feed, fixture);
        results.push(...items);
        log(`✓ ${feed.source} [${feed.regionId}/${feed.categoryId}] ${items.length} articles`);
      } catch (e) {
        failures.push({ feed, error: String(e?.message ?? e) });
        log(`✗ ${feed.source} [${feed.regionId}/${feed.categoryId}] ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, feeds.length) }, worker));
  return { articles: results, failures };
}

async function fetchOne(feed, fixture) {
  const parsed = fixture
    ? await parser.parseString(await readFile(new URL(`../fixtures/${feed.url.replace('fixture:', '')}.xml`, import.meta.url), 'utf8'))
    : await parser.parseURL(feed.url);

  const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;
  const out = [];
  for (const item of parsed.items ?? []) {
    const url = canonicalUrl(item.link ?? item.guid);
    const title = clean(item.title);
    if (!url || !title) continue;

    const published = item.isoDate ? Date.parse(item.isoDate) : item.pubDate ? Date.parse(item.pubDate) : Date.now();
    // En fixture on garde tout (les dates d'exemple peuvent être vieilles).
    if (!fixture && Number.isFinite(published) && published < cutoff) continue;

    out.push({
      id: hash(url),
      title,
      summary: excerpt(item),
      url,
      source: sourceName(item, feed),
      publishedAt: new Date(Number.isFinite(published) ? published : Date.now()).toISOString(),
      imageUrl: pickImage(item),
      regionId: feed.regionId,
      categoryId: feed.categoryId,
      lang: feed.lang ?? 'fr',
    });
  }
  return out;
}

// ---------- normalisation ----------

/** Supprime le tracking et la casse d'hôte : deux liens vers le même article → même id. */
function canonicalUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|xtor|at_|ref$|cmp)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}

function clean(s) {
  if (!s) return '';
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Chapô : description/contenu, limité à ~400 caractères en coupant sur une phrase. */
function excerpt(item) {
  const raw = item.contentSnippet || item.summary || item.content || item.contentEncoded || item.description || '';
  let t = clean(raw);
  // Google News colle « - Source » / une liste de liens : on garde la première phrase utile.
  if (t.length > 420) {
    const cut = t.slice(0, 420);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > 120 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
  }
  return t;
}

/** Google News et consorts mettent le média d'origine dans <source>. */
function sourceName(item, feed) {
  const s = item.itemSource;
  if (typeof s === 'string' && s.trim()) return clean(s);
  if (s && typeof s === 'object') {
    const inner = s._ ?? s['#'] ?? s.$?.title;
    if (inner && String(inner).trim()) return clean(inner);
  }
  // Google News : « Titre - Média » dans le titre.
  if (feed.source === 'Google News') {
    const m = /\s[-–]\s([^-–]{2,60})$/.exec(item.title ?? '');
    if (m) return m[1].trim();
  }
  return feed.source;
}

function pickImage(item) {
  const fromMedia = (arr) => {
    for (const m of arr ?? []) {
      const url = m?.$?.url ?? m?.url;
      const type = m?.$?.type ?? m?.type ?? '';
      const medium = m?.$?.medium ?? '';
      if (url && (medium === 'image' || /^image\//.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) return url;
    }
    return undefined;
  };
  return (
    fromMedia(item.mediaContent) ||
    fromMedia(item.mediaThumbnail) ||
    fromMedia(item.mediaGroup?.['media:content']) ||
    fromMedia(item.mediaGroup?.['media:thumbnail']) ||
    (item.enclosure?.url && /^image\//.test(item.enclosure.type ?? '') ? item.enclosure.url : undefined) ||
    firstImg(item.contentEncoded || item.content || item.description)
  );
}

function firstImg(html) {
  if (!html) return undefined;
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m?.[1];
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** FNV-1a 32 bits, suffisant comme id stable. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
