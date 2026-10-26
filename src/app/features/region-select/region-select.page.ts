import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { GeoTaxonomyService } from '../../core/services/geo-taxonomy.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { Region } from '../../core/models/region.model';
import { Scrolled } from '../../shared/directives/scrolled';
import { HapticsService } from '../../core/services/haptics.service';

/**
 * Exploration de la hiérarchie géographique. On « descend » dans les niveaux
 * (Monde → Continent → Pays → Ville) et on peut sélectionner n'importe quel
 * niveau comme région active du digest.
 */
@Component({
  selector: 'app-region-select-page',
  imports: [Scrolled, RouterLink],
  templateUrl: './region-select.page.html',
  styleUrl: './region-select.page.scss',
})
export class RegionSelectPage {
  private readonly geo = inject(GeoTaxonomyService);
  private readonly prefs = inject(PreferencesService);
  private readonly router = inject(Router);
  private readonly haptics = inject(HapticsService);

  /** Nœud dont on affiche les enfants. */
  private readonly browsingId = signal<string>('world');

  readonly current = computed(() => this.geo.getById(this.browsingId())!);
  readonly breadcrumb = computed(() => this.geo.getPath(this.browsingId()));
  readonly children = computed(() => this.geo.getChildren(this.browsingId()));
  readonly activeId = computed(() => this.prefs.activeRegionId());

  readonly levelLabel: Record<string, string> = {
    world: 'Continents',
    continent: 'Pays',
    country: 'Villes',
    city: '',
  };

  /** Ouvre un sous-niveau s'il existe. */
  drillInto(region: Region): void {
    this.haptics.tap();
    if (this.geo.hasChildren(region.id)) {
      this.browsingId.set(region.id);
    }
  }

  goTo(regionId: string): void {
    this.browsingId.set(regionId);
  }

  hasChildren(id: string): boolean {
    return this.geo.hasChildren(id);
  }

  /** Choisit la région comme active et retourne au digest. */
  async select(region: Region): Promise<void> {
    this.haptics.success();
    await this.prefs.setActiveRegion(region.id);
    this.router.navigate(['/']);
  }
}
