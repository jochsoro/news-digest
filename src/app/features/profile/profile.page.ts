import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PreferencesService } from '../../core/services/preferences.service';
import { GeoTaxonomyService } from '../../core/services/geo-taxonomy.service';
import { HapticsService } from '../../core/services/haptics.service';
import { CATEGORIES } from '../../core/data/categories.data';
import { Category, CategoryId } from '../../core/models/category.model';
import { Scrolled } from '../../shared/directives/scrolled';

interface InterestRow {
  category: Category;
  /** 0–1, part relative de l'intérêt. */
  share: number;
  opens: number;
  saves: number;
}

/**
 * Profil du lecteur : identité légère (prénom, initiales) et, surtout, ce que
 * l'app a appris de ses lectures — rendu transparent et effaçable. C'est la
 * face visible de la couche de personnalisation.
 */
@Component({
  selector: 'app-profile-page',
  imports: [RouterLink, Scrolled],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  private readonly prefsSvc = inject(PreferencesService);
  private readonly geo = inject(GeoTaxonomyService);
  private readonly haptics = inject(HapticsService);

  readonly prefs = this.prefsSvc.prefs;
  readonly signals = this.prefsSvc.signals;
  readonly editing = signal(false);
  readonly cleared = signal(false);

  readonly name = computed(() => this.prefs().displayName.trim() || 'Lecteur');

  readonly initials = computed(() => {
    const parts = this.name().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  });

  readonly region = computed(() => this.geo.getById(this.prefs().activeRegionId));

  readonly selectedCategories = computed<Category[]>(() => {
    const ids = this.prefs().selectedCategories;
    return ids.length ? CATEGORIES.filter((c) => ids.includes(c.id)) : [];
  });

  /** Totaux d'engagement, pour les compteurs. */
  readonly totals = computed(() => {
    const s = this.signals();
    const sum = (m: Partial<Record<CategoryId, number>>) =>
      Object.values(m).reduce((a, b) => a + (b ?? 0), 0);
    return { opens: sum(s.opensByCategory), saves: sum(s.savesByCategory), dismissed: s.dismissed.length };
  });

  /** Thèmes classés par intérêt appris (même pondération que la personnalisation). */
  readonly interests = computed<InterestRow[]>(() => {
    const s = this.signals();
    const rows = CATEGORIES.map((category) => {
      const opens = s.opensByCategory[category.id] ?? 0;
      const saves = s.savesByCategory[category.id] ?? 0;
      const shares = s.sharesByCategory[category.id] ?? 0;
      return { category, opens, saves, weight: opens + saves * 3 + shares * 4 };
    }).filter((r) => r.weight > 0);
    const max = Math.max(1, ...rows.map((r) => r.weight));
    return rows
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map(({ category, opens, saves, weight }) => ({ category, opens, saves, share: weight / max }));
  });

  startEdit(): void {
    this.haptics.tap();
    this.editing.set(true);
  }

  async saveName(value: string): Promise<void> {
    await this.prefsSvc.update({ displayName: value.trim().slice(0, 40) });
    this.editing.set(false);
    this.haptics.success();
  }

  async clearHistory(): Promise<void> {
    await this.prefsSvc.resetSignals();
    this.haptics.success();
    this.cleared.set(true);
    setTimeout(() => this.cleared.set(false), 1800);
  }
}
