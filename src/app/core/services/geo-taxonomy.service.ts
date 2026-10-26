import { Injectable } from '@angular/core';
import { Region, RegionPath } from '../models/region.model';
import { REGIONS } from '../data/regions.data';

/**
 * Accès et navigation dans la hiérarchie géographique
 * Monde → Continent → Pays → Ville.
 * En production, remplacer la source statique par un chargement backend.
 */
@Injectable({ providedIn: 'root' })
export class GeoTaxonomyService {
  private readonly byId = new Map<string, Region>(REGIONS.map((r) => [r.id, r]));
  private readonly childrenByParent = new Map<string, Region[]>();

  constructor() {
    for (const r of REGIONS) {
      if (r.parentId) {
        const list = this.childrenByParent.get(r.parentId) ?? [];
        list.push(r);
        this.childrenByParent.set(r.parentId, list);
      }
    }
    // Tri alphabétique des enfants pour un affichage stable.
    for (const list of this.childrenByParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }
  }

  get root(): Region {
    return this.byId.get('world')!;
  }

  getById(id: string): Region | undefined {
    return this.byId.get(id);
  }

  /** Sous-régions directes (ex: continents sous 'world', pays sous 'africa'). */
  getChildren(parentId: string): Region[] {
    return this.childrenByParent.get(parentId) ?? [];
  }

  hasChildren(id: string): boolean {
    return this.childrenByParent.has(id);
  }

  /** Chemin racine → région, pour le fil d'Ariane. */
  getPath(id: string): RegionPath {
    const path: RegionPath = [];
    let current = this.byId.get(id);
    while (current) {
      path.unshift(current);
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }
    return path;
  }

  /**
   * Tous les codes pays couverts par une région — descend la hiérarchie.
   * Pour un continent, renvoie les codes de tous ses pays ; c'est ce qui
   * permet d'agréger les actus d'un continent en combinant ses pays côté API.
   */
  getCountryCodes(id: string): string[] {
    const region = this.byId.get(id);
    if (!region) return [];
    if (region.level === 'country' || region.level === 'city') {
      return region.countryCode ? [region.countryCode] : [];
    }
    const codes = new Set<string>();
    const walk = (parentId: string) => {
      for (const child of this.getChildren(parentId)) {
        if (child.countryCode) codes.add(child.countryCode);
        if (this.hasChildren(child.id)) walk(child.id);
      }
    };
    walk(id);
    return [...codes];
  }
}
