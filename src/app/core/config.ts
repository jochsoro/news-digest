/**
 * Configuration de l'app.
 *
 * DIGEST_BASE_URL : racine où le pipeline `ingest/` publie les éditions
 * (voir ingest/README.md).
 *
 *  - Production (app native, site déployé) : le CDN — GitHub Pages sur la
 *    branche `digests` : https://<user>.github.io/<repo>
 *    C'est la source PAR DÉFAUT partout — web, mobile, dev — pour que tous
 *    les écrans montrent la même édition.
 *  - Édition locale (tester un changement du pipeline avant de pousser) :
 *    `npm run digest:local` puis, dans la console du navigateur,
 *    localStorage.setItem('nd.digestBase', '') et recharger. Chaîne vide =
 *    même origine : le serveur Angular proxifie /digests vers localhost:8787
 *    (proxy.conf.json). localStorage.removeItem('nd.digestBase') pour revenir.
 *  - Autre source : localStorage.setItem('nd.digestBase', 'https://…').
 *
 * null → données de démonstration (MockNewsGateway).
 */
const PRODUCTION_BASE_URL = 'https://jochsoro.github.io/news-digest';

export const DIGEST_BASE_URL: string | null = resolveBaseUrl();

function resolveBaseUrl(): string | null {
  try {
    const override = localStorage.getItem('nd.digestBase');
    if (override === 'mock') return null;
    if (override !== null) return override.trim();
  } catch {
    /* pas de window (tests) : défaut production */
  }
  return PRODUCTION_BASE_URL;
}

