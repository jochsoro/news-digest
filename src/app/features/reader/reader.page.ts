import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';

import { ReaderService, ReadableArticle } from '../../core/services/reader.service';
import { HapticsService } from '../../core/services/haptics.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { ArticleRef, SummaryBlock } from '../../core/models/article.model';
import { CATEGORIES } from '../../core/data/categories.data';
import { Scrolled } from '../../shared/directives/scrolled';

/** Ce que l'écran d'actus transmet au lecteur (facultatif : l'URL suffit). */
interface ReaderState {
  block?: SummaryBlock;
  source?: ArticleRef;
}

/**
 * Lecteur intégré : l'article de l'éditeur, épuré, dans la typographie de
 * l'app. Chargé depuis le cache quand il y est (métro), sinon depuis le site.
 * Si l'extraction échoue, on propose d'ouvrir la page dans le navigateur
 * intégré — jamais d'impasse.
 */
@Component({
  selector: 'app-reader-page',
  imports: [Scrolled],
  templateUrl: './reader.page.html',
  styleUrl: './reader.page.scss',
})
export class ReaderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reader = inject(ReaderService);
  private readonly haptics = inject(HapticsService);
  private readonly prefsSvc = inject(PreferencesService);

  readonly url = signal<string>('');
  readonly article = signal<ReadableArticle | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Contexte venu de l'édition (thème, autres sources). */
  readonly state: ReaderState = (history.state ?? {}) as ReaderState;

  readonly category = computed(() => {
    const id = this.state.block?.category;
    return id ? CATEGORIES.find((c) => c.id === id) : undefined;
  });

  readonly otherSources = computed<ArticleRef[]>(() =>
    (this.state.block?.sources ?? []).filter((s) => s.url !== this.url()),
  );

  /** Image d'en-tête : celle de l'article, sinon celle de l'édition ; masquée si elle ne charge pas. */
  private readonly heroFailed = signal(false);
  readonly heroImage = computed(() =>
    this.heroFailed() ? null : this.article()?.image ?? this.state.block?.image?.url ?? null,
  );

  onHeroError(): void {
    this.heroFailed.set(true);
  }

  readonly readingLabel = computed(() => {
    const a = this.article();
    if (!a) return '';
    return `${a.readingMinutes} min de lecture`;
  });

  constructor() {
    const u = this.route.snapshot.queryParamMap.get('u') ?? this.state.source?.url ?? '';
    this.url.set(u);
    if (!u) {
      this.loading.set(false);
      this.error.set('Aucun article à ouvrir.');
      return;
    }
    void this.open(u);
  }

  private async open(url: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const a = await this.reader.load(url);
      this.heroFailed.set(false);
      this.article.set(a);
      if (this.state.block) void this.prefsSvc.recordOpen(this.state.block.category);
    } catch (e) {
      console.warn('[reader]', e);
      this.error.set("Ce site ne se laisse pas lire en mode épuré.");
    } finally {
      this.loading.set(false);
    }
  }

  async retry(): Promise<void> {
    this.haptics.tap();
    await this.open(this.url());
  }

  /** Repli : la page d'origine, dans le navigateur intégré (SFSafariViewController / Custom Tabs). */
  async openSite(): Promise<void> {
    this.haptics.tap();
    try {
      await Browser.open({ url: this.url(), presentationStyle: 'popover' });
    } catch {
      window.open(this.url(), '_blank', 'noopener');
    }
  }

  async share(): Promise<void> {
    this.haptics.tap();
    const a = this.article();
    try {
      await Share.share({ title: a?.title ?? 'Article', url: this.url(), dialogTitle: 'Partager cet article' });
    } catch {
      /* annulé */
    }
  }

  /** Une autre source du même bloc : même lecteur, nouvelle page. */
  readOther(src: ArticleRef): void {
    this.haptics.tap();
    this.router.navigate(['/read'], {
      queryParams: { u: src.url },
      state: { block: this.state.block, source: src },
      replaceUrl: false,
    }).then(() => {
      this.url.set(src.url);
      this.article.set(null);
      void this.open(src.url);
    });
  }

  back(): void {
    this.haptics.tap();
    if (history.length > 1) history.back();
    else this.router.navigateByUrl('/');
  }
}
