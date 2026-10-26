import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Share } from '@capacitor/share';

import { NewsService } from '../../core/services/news.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { PersonalizationService } from '../../core/services/personalization.service';
import { GeoTaxonomyService } from '../../core/services/geo-taxonomy.service';
import { HapticsService } from '../../core/services/haptics.service';
import { NewsCard } from '../../shared/components/news-card/news-card';
import { CategoryFilter } from '../../shared/components/category-filter/category-filter';
import { SummaryBlock } from '../../core/models/article.model';
import { CategoryId } from '../../core/models/category.model';
import { CATEGORIES } from '../../core/data/categories.data';

@Component({
  selector: 'app-digest-page',
  imports: [RouterLink, NewsCard, CategoryFilter],
  templateUrl: './digest.page.html',
  styleUrl: './digest.page.scss',
})
export class DigestPage {
  private readonly news = inject(NewsService);
  private readonly prefsSvc = inject(PreferencesService);
  private readonly perso = inject(PersonalizationService);
  private readonly geo = inject(GeoTaxonomyService);
  private readonly haptics = inject(HapticsService);

  private readonly feedEl = viewChild<ElementRef<HTMLElement>>('feed');

  readonly loading = this.news.loading;
  readonly error = this.news.error;
  readonly prefs = this.prefsSvc.prefs;
  readonly fromCache = this.news.fromCache;
  readonly isStale = this.news.isStale;

  /** « Édition du 25 oct. » quand ce n'est pas celle du jour. */
  readonly editionLabel = computed(() => {
    const d = this.news.digest();
    if (!d || !this.isStale()) return null;
    const [y, m, day] = d.date.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  });

  /** Index de l'écran visible (pour la progression). */
  readonly current = signal(0);
  /** Feuille des thèmes ouverte. */
  readonly filtersOpen = signal(false);
  /** Blocs écartés dans cette session (swipe gauche) — disparaissent du feed. */
  readonly passed = signal<Set<CategoryId>>(new Set());
  /** Blocs gardés dans cette session (retour visuel). */
  readonly savedSet = signal<Set<CategoryId>>(new Set());

  readonly region = computed(() => this.geo.getById(this.prefsSvc.activeRegionId()));
  readonly dateShort = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

  readonly blocks = computed<SummaryBlock[]>(() => {
    const digest = this.news.digest();
    if (!digest) return [];
    const passed = this.passed();
    return this.perso
      .personalize(digest, this.prefsSvc.prefs(), this.prefsSvc.signals())
      .filter((b) => !passed.has(b.category));
  });

  readonly total = computed(() => this.blocks().length);

  readonly activeFilterCount = computed(() => this.prefsSvc.prefs().selectedCategories.length);

  constructor() {
    effect(() => {
      const regionId = this.prefsSvc.activeRegionId();
      this.passed.set(new Set());
      this.current.set(0);
      this.news.loadDigest(regionId);
    });
  }

  labelOf(block: SummaryBlock | undefined): string | null {
    if (!block) return null;
    return CATEGORIES.find((c) => c.id === block.category)?.label ?? null;
  }

  onFeedScroll(): void {
    const el = this.feedEl()?.nativeElement;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== this.current()) {
      this.current.set(idx);
      this.haptics.select();
    }
  }

  private scrollToNext(): void {
    const el = this.feedEl()?.nativeElement;
    if (!el) return;
    const next = Math.min(this.current(), Math.max(0, this.total() - 1));
    el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' });
  }

  // ---- actions ----

  onOpened(block: SummaryBlock): void {
    this.prefsSvc.recordOpen(block.category);
  }

  onSaved(block: SummaryBlock): void {
    this.haptics.success();
    this.prefsSvc.recordSave(block.category);
    this.savedSet.update((s) => new Set(s).add(block.category));
  }

  onPassed(block: SummaryBlock): void {
    this.haptics.tap();
    this.passed.update((s) => new Set(s).add(block.category));
    // Le bloc disparaît ; l'écran suivant prend sa place à la même position.
    requestAnimationFrame(() => this.scrollToNext());
  }

  async onShared(block: SummaryBlock): Promise<void> {
    this.haptics.tap();
    this.prefsSvc.recordShare(block.category);
    const src = block.sources[0];
    try {
      await Share.share({
        title: this.labelOf(block) ?? 'News Digest',
        text: block.summary,
        url: src?.url,
        dialogTitle: 'Partager cette actu',
      });
    } catch {
      // Partage annulé ou indisponible (web sans Web Share) : on ignore.
    }
  }

  onLessOfThis(block: SummaryBlock): void {
    this.haptics.tap();
    const digest = this.news.digest();
    if (digest) this.prefsSvc.dismiss(this.perso.blockId(digest, block));
    this.passed.update((s) => new Set(s).add(block.category));
    requestAnimationFrame(() => this.scrollToNext());
  }

  onToggleCategory(id: CategoryId): void {
    this.haptics.select();
    this.prefsSvc.toggleCategory(id);
  }

  onClearCategories(): void {
    this.prefsSvc.update({ selectedCategories: [] });
  }

  toggleFilters(): void {
    this.haptics.tap();
    this.filtersOpen.update((v) => !v);
  }

  restart(): void {
    this.passed.set(new Set());
    this.feedEl()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  refresh(): void {
    this.passed.set(new Set());
    this.news.refresh(this.prefsSvc.activeRegionId());
  }
}
