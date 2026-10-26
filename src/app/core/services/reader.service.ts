import { Injectable, signal } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Readability } from '@mozilla/readability';

/**
 * Article extrait et nettoyé, prêt à lire dans l'app.
 * Stocké SUR L'APPAREIL uniquement (cache de lecture), jamais republié.
 */
export interface ReadableArticle {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  /** HTML épuré (titres, paragraphes, images, citations, listes, liens). */
  html: string;
  /** Texte brut, pour le temps de lecture et la synthèse vocale à venir. */
  text: string;
  excerpt: string | null;
  /** Image d'en-tête (og:image de la page), si trouvée. */
  image: string | null;
  /** Minutes de lecture estimées (≈ 200 mots/min). */
  readingMinutes: number;
  fetchedAt: string;
}

const CACHE_PREFIX = 'article:';
const CACHE_INDEX = 'articles_index_v1';
/** Articles gardés hors ligne ; au-delà, les plus anciens partent. */
const CACHE_MAX = 40;
/** Au-delà, on tronque le HTML stocké (un article de presse fait rarement plus de 60 Ko). */
const CACHE_MAX_HTML = 200_000;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Lecteur intégré : va chercher la page chez l'éditeur (requête native, à la
 * demande du lecteur — comme le mode Lecteur de Safari), en extrait le corps
 * avec Readability, l'épure, et le met en cache pour une relecture sans réseau.
 *
 * Tout se passe sur l'appareil : le pipeline ne touche jamais au texte
 * intégral, le CDN ne sert que résumés + liens.
 */
@Injectable({ providedIn: 'root' })
export class ReaderService {
  /** Urls en cours de préchargement (évite les doublons). */
  private readonly inflight = new Map<string, Promise<ReadableArticle>>();
  readonly prefetching = signal(0);

  /** Article depuis le cache si présent, sinon depuis le réseau (puis mis en cache). */
  async load(url: string, { preferCache = true } = {}): Promise<ReadableArticle> {
    if (preferCache) {
      const cached = await this.fromCache(url);
      if (cached) return cached;
    }
    const pending = this.inflight.get(url);
    if (pending) return pending;

    const task = this.fetchAndExtract(url)
      .then(async (article) => {
        await this.store(article);
        return article;
      })
      .finally(() => this.inflight.delete(url));
    this.inflight.set(url, task);
    return task;
  }

  /** Précharge en arrière-plan (métro) : silencieux, borné, jamais bloquant. */
  async prefetch(urls: string[], max = 6): Promise<void> {
    if (!Capacitor.isNativePlatform()) return; // en web, CORS bloquerait de toute façon
    const todo = [...new Set(urls)].slice(0, max);
    const queue = [...todo];
    this.prefetching.update((n) => n + queue.length);
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift()!;
        try {
          if (!(await this.fromCache(u))) await this.load(u, { preferCache: false });
        } catch {
          /* page récalcitrante : on verra au tap */
        } finally {
          this.prefetching.update((n) => Math.max(0, n - 1));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
  }

  async isCached(url: string): Promise<boolean> {
    return (await this.fromCache(url)) !== null;
  }

  // ---------- réseau + extraction ----------

  private async fetchAndExtract(url: string): Promise<ReadableArticle> {
    const html = await this.fetchHtml(url);
    const article = this.extract(html, url);
    if (!article) throw new Error('Impossible d\'extraire le contenu de cette page');
    return article;
  }

  /** Requête native (hors CORS) sur mobile ; fetch classique en web (dev). */
  private async fetchHtml(url: string): Promise<string> {
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
      // Un UA de navigateur mobile : les sites servent alors leur page normale.
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    };
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        headers,
        responseType: 'text',
        connectTimeout: FETCH_TIMEOUT_MS,
        readTimeout: FETCH_TIMEOUT_MS,
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      return typeof res.data === 'string' ? res.data : String(res.data ?? '');
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** Readability + épuration. Rendu via [innerHTML], qu'Angular assainit encore. */
  private extract(html: string, url: string): ReadableArticle | null {
    // <base> pour que Readability résolve les liens et images relatifs.
    const withBase = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1><base href="${url.replace(/"/g, '&quot;')}">`)
      : `<head><base href="${url.replace(/"/g, '&quot;')}"></head>${html}`;
    const doc = new DOMParser().parseFromString(withBase, 'text/html');

    const image =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      null;

    // Le <h1> de la page est un meilleur titre que <title> (souvent « Titre - Site »).
    const h1 = doc.querySelector('article h1, main h1, h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    const parsed = new Readability(doc, { charThreshold: 300 }).parse();
    if (!parsed?.content || !parsed.textContent || parsed.textContent.trim().length < 300) return null;

    const title = (h1.length > 10 ? h1 : parsed.title || doc.title || '').trim();
    const cleaned = this.clean(parsed.content, url, title);
    const text = parsed.textContent.replace(/\s+/g, ' ').trim();
    const words = text.split(' ').length;

    return {
      url,
      title,
      byline: parsed.byline?.trim() || null,
      siteName: parsed.siteName?.trim() || new URL(url).hostname.replace(/^www\./, ''),
      html: cleaned.length > CACHE_MAX_HTML ? cleaned.slice(0, CACHE_MAX_HTML) + '<p>…</p>' : cleaned,
      text,
      excerpt: parsed.excerpt?.trim() || null,
      image: image ? new URL(image, url).toString() : null,
      readingMinutes: Math.max(1, Math.round(words / 200)),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Épuration : liste blanche de balises, attributs réduits au strict utile,
   * images paresseuses réveillées, liens ouverts hors de l'app, résidus
   * (partage, newsletters, « lire aussi ») retirés.
   */
  private clean(contentHtml: string, baseUrl: string, title = ''): string {
    const ALLOWED = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'IMG', 'A', 'STRONG', 'B', 'EM', 'I', 'BR', 'HR', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SUB', 'SUP']);
    const JUNK = /(share|partag|newsletter|related|lire-aussi|read-more|a-lire|social|comment|cookie|promo|advert|pub-|sponsor)/i;

    const root = new DOMParser().parseFromString(`<div id="r">${contentHtml}</div>`, 'text/html').getElementById('r')!;

    const walk = (el: Element) => {
      for (const child of [...el.children]) {
        const cls = `${child.getAttribute('class') ?? ''} ${child.getAttribute('id') ?? ''}`;
        if (JUNK.test(cls) || child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'IFRAME' || child.tagName === 'FORM' || child.tagName === 'BUTTON' || child.tagName === 'SVG') {
          child.remove();
          continue;
        }
        walk(child);
        if (child.tagName === 'IMG') {
          const img = child as HTMLImageElement;
          const src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('src') || '';
          const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset') || '';
          const best = srcset ? srcset.split(',').pop()?.trim().split(' ')[0] ?? '' : '';
          const finalSrc = best || src;
          if (!finalSrc || finalSrc.startsWith('data:') || /\.(svg|gif)(\?|$)/i.test(finalSrc) || /pixel|tracker|1x1/i.test(finalSrc)) {
            img.remove();
            continue;
          }
          [...img.attributes].forEach((a) => img.removeAttribute(a.name));
          try { img.setAttribute('src', new URL(finalSrc, baseUrl).toString()); } catch { img.remove(); continue; }
          img.setAttribute('loading', 'lazy');
          img.setAttribute('alt', '');
        } else if (child.tagName === 'A') {
          const href = child.getAttribute('href') ?? '';
          [...child.attributes].forEach((a) => child.removeAttribute(a.name));
          try { child.setAttribute('href', new URL(href, baseUrl).toString()); } catch { /* lien cassé : simple texte */ }
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        } else if (ALLOWED.has(child.tagName)) {
          [...child.attributes].forEach((a) => child.removeAttribute(a.name));
        } else {
          // Balise hors liste (div, span, section…) : on garde le contenu, pas la balise.
          child.replaceWith(...child.childNodes);
        }
      }
    };
    walk(root);

    // Paragraphes vides et figures sans image.
    root.querySelectorAll('p, figure, li, blockquote').forEach((n) => {
      if (!n.textContent?.trim() && !n.querySelector('img')) n.remove();
    });

    // Le titre est déjà affiché au-dessus : pas de doublon en tête du corps.
    const first = root.querySelector('h2, h3, h4');
    if (first && title && first === firstMeaningful(root) && similar(first.textContent ?? '', title)) first.remove();

    return root.innerHTML;
  }

  // ---------- cache sur l'appareil ----------

  private key(url: string): string {
    return CACHE_PREFIX + hash(url);
  }

  private async fromCache(url: string): Promise<ReadableArticle | null> {
    try {
      const { value } = await Preferences.get({ key: this.key(url) });
      return value ? (JSON.parse(value) as ReadableArticle) : null;
    } catch {
      return null;
    }
  }

  private async store(article: ReadableArticle): Promise<void> {
    try {
      await Preferences.set({ key: this.key(article.url), value: JSON.stringify(article) });
      const { value } = await Preferences.get({ key: CACHE_INDEX });
      const index: string[] = value ? JSON.parse(value) : [];
      const next = [article.url, ...index.filter((u) => u !== article.url)];
      for (const old of next.slice(CACHE_MAX)) {
        await Preferences.remove({ key: this.key(old) }).catch(() => undefined);
      }
      await Preferences.set({ key: CACHE_INDEX, value: JSON.stringify(next.slice(0, CACHE_MAX)) });
    } catch {
      /* stockage saturé : la lecture marche quand même, sans cache */
    }
  }
}

/** Premier élément porteur de contenu (on saute les blocs vides). */
function firstMeaningful(root: Element): Element | null {
  for (const el of root.querySelectorAll('*')) {
    if (el.textContent?.trim() || el.tagName === 'IMG') return el;
  }
  return null;
}

function similar(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const x = n(a), y = n(b);
  return x === y || x.includes(y) || y.includes(x);
}

/** FNV-1a — identifiant court et stable d'une URL. */
function hash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
