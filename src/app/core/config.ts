/**
 * Configuration de l'app.
 *
 * DIGEST_BASE_URL : racine où le pipeline `ingest/` publie les éditions
 * (voir ingest/README.md).
 *
 *  - Production (app native, site déployé) : le CDN — GitHub Pages sur la
 *    branche `digests` : https://<user>.github.io/<repo>
 *  - Développement (`npm start` sur localhost) : chaîne vide = même origine.
 *    Le serveur Angular proxifie /digests vers http://localhost:8787
 *    (proxy.conf.json), où `npm run digest:serve` sert `ingest/out`.
 *    Pas de CORS, mêmes chemins qu'en production.
 *  - Surcharge ponctuelle sans rebuild : dans la console du navigateur,
 *    localStorage.setItem('nd.digestBase', 'https://…') puis recharger ;
 *    localStorage.removeItem('nd.digestBase') pour revenir au défaut.
 *
 * null → données de démonstration (MockNewsGateway).
 */
import { Capacitor } from '@capacitor/core';

const PRODUCTION_BASE_URL = 'https://jochsoro.github.io/news-digest';
const LOCAL_BASE_URL = '';

export const DIGEST_BASE_URL: string | null = resolveBaseUrl();

function resolveBaseUrl(): string | null {
  try {
    const override = localStorage.getItem('nd.digestBase');
    if (override === 'mock') return null;
    if (override !== null) return override.trim();
    // App native (iOS/Android) : Capacitor sert le bundle depuis
    // capacitor://localhost — ce « localhost » n'est PAS le serveur de dev.
    // Sauf live reload (http:// depuis le Mac), c'est la production.
    if (Capacitor.isNativePlatform() && location.protocol !== 'http:') return PRODUCTION_BASE_URL;

    const host = location.hostname;
    // localhost (npm start) ou IP privée du Mac (live reload sur téléphone) :
    // l'app est servie par ng serve, dont le proxy expose /digests.
    if (host === 'localhost' || host === '127.0.0.1' || isPrivateIp(host)) return LOCAL_BASE_URL;
  } catch {
    /* pas de window (tests) : défaut production */
  }
  return PRODUCTION_BASE_URL;
}

/** 10.x, 172.16–31.x, 192.168.x — le réseau local, où tourne `ng serve --host 0.0.0.0`. */
function isPrivateIp(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+$/.test(host);
}
