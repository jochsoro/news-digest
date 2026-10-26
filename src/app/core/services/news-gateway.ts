import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { Digest } from '../models/digest.model';
import { GeoTaxonomyService } from './geo-taxonomy.service';
import { buildMockDigest } from '../data/mock-digests.data';
import { DIGEST_BASE_URL } from '../config';

/**
 * Contrat d'accès aux digests. L'app dépend de cette abstraction, pas d'une
 * source concrète : mock en démo, HTTP + cache en réel (voir app.config.ts).
 */
export abstract class NewsGateway {
  /**
   * Renvoie le digest mutualisé d'une région pour une date (YYYY-MM-DD).
   * `fromCache` est vrai quand l'édition vient du cache de l'appareil
   * (hors ligne, ou CDN injoignable) : l'UI peut le signaler.
   */
  abstract fetchDigest(regionId: string, date: string): Promise<Digest & { fromCache?: boolean }>;
}

/**
 * Implémentation de démonstration : fabrique un digest localement.
 */
@Injectable()
export class MockNewsGateway extends NewsGateway {
  private readonly geo = inject(GeoTaxonomyService);

  async fetchDigest(regionId: string, date: string): Promise<Digest> {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 400));
    const region = this.geo.getById(regionId) ?? this.geo.root;
    return buildMockDigest(region.id, region.name, region.level === 'world', date);
  }
}

/**
 * Implémentation réelle : lit les JSON publiés par le pipeline `ingest/` sur
 * le CDN, et garde la dernière édition de chaque région SUR L'APPAREIL.
 *
 * C'est ce cache qui rend la lecture possible dans le métro : l'édition
 * chargée au réveil (à la notification) reste disponible sans réseau. Si le
 * CDN est injoignable, on sert le cache même s'il date de la veille, et on le
 * signale (`fromCache`). Si une région n'a pas d'édition, on remonte à son
 * parent (une ville sans flux affiche l'édition de son pays).
 */
@Injectable()
export class HttpNewsGateway extends NewsGateway {
  private readonly http = inject(HttpClient);
  private readonly geo = inject(GeoTaxonomyService);

  async fetchDigest(regionId: string, date: string): Promise<Digest & { fromCache?: boolean }> {
    // 1. Réseau : latest.json de la région, puis des parents si elle n'a pas d'édition.
    const chain = this.geo.getPath(regionId).map((r) => r.id).reverse(); // région → … → monde
    for (const id of chain) {
      const digest = await this.fetchRemote(id);
      if (digest) {
        // On stocke sous la région DEMANDÉE : hors ligne, la ville retrouve bien son édition.
        await this.store(regionId, digest);
        return { ...digest, regionId: digest.regionId, fromCache: false };
      }
    }

    // 2. Hors ligne ou CDN muet : cache de l'appareil, même ancien.
    const cached = await this.load(regionId);
    if (cached) return { ...cached, fromCache: true };

    throw new Error(`Aucune édition disponible pour ${regionId} (${date})`);
  }

  private async fetchRemote(regionId: string): Promise<Digest | null> {
    const url = `${DIGEST_BASE_URL}/digests/${encodeURIComponent(regionId)}/latest.json`;
    try {
      const d = await firstValueFrom(
        this.http.get<Digest>(url, { params: { t: String(Math.floor(Date.now() / 300_000)) } }).pipe(timeout(10_000)),
      );
      return d && Array.isArray(d.blocks) && d.blocks.length > 0 ? d : null;
    } catch {
      return null;
    }
  }

  private key(regionId: string): string {
    return `digest:${regionId}`;
  }

  private async store(regionId: string, digest: Digest): Promise<void> {
    try {
      await Preferences.set({ key: this.key(regionId), value: JSON.stringify(digest) });
    } catch {
      /* stockage plein ou indisponible : on vit sans cache */
    }
  }

  private async load(regionId: string): Promise<Digest | null> {
    try {
      const { value } = await Preferences.get({ key: this.key(regionId) });
      return value ? (JSON.parse(value) as Digest) : null;
    } catch {
      return null;
    }
  }
}
