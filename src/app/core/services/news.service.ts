import { Injectable, computed, inject, signal } from '@angular/core';
import { Digest } from '../models/digest.model';
import { NewsGateway } from './news-gateway';

/**
 * Façade d'accès aux digests côté UI. Cache en mémoire (un digest par clé
 * region+date) et états de chargement/erreur exposés en signals.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly gateway = inject(NewsGateway);
  private readonly cache = new Map<string, Digest>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly digest = signal<Digest | null>(null);
  /** Vrai quand l'édition affichée vient du cache de l'appareil (hors ligne). */
  readonly fromCache = signal(false);

  /** Vrai si l'édition affichée n'est pas celle du jour (pas encore publiée, ou cache ancien). */
  readonly isStale = computed(() => {
    const d = this.digest();
    return !!d && d.date !== NewsService.today();
  });

  /** Date du jour au format YYYY-MM-DD (fuseau local). */
  static today(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  async loadDigest(regionId: string, date = NewsService.today()): Promise<void> {
    const key = `${regionId}|${date}`;
    this.error.set(null);

    const cached = this.cache.get(key);
    if (cached) {
      this.digest.set(cached);
      return;
    }

    this.loading.set(true);
    try {
      const { fromCache, ...d } = await this.gateway.fetchDigest(regionId, date);
      // On ne mémorise en RAM que ce qui vient du réseau : une édition servie
      // depuis le cache disque doit être retentée à la prochaine ouverture.
      if (!fromCache) this.cache.set(key, d);
      this.fromCache.set(!!fromCache);
      this.digest.set(d);
    } catch (e) {
      this.error.set("Pas d'édition disponible. Vérifie ta connexion et réessaie.");
      this.digest.set(null);
      this.fromCache.set(false);
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  /** Force le rechargement (pull-to-refresh). */
  async refresh(regionId: string, date = NewsService.today()): Promise<void> {
    this.cache.delete(`${regionId}|${date}`);
    await this.loadDigest(regionId, date);
  }
}
