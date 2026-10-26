import { Component, computed, input, output, signal } from '@angular/core';
import { SummaryBlock } from '../../../core/models/article.model';
import { CATEGORIES } from '../../../core/data/categories.data';
import { CATEGORY_PALETTE } from '../../../core/data/category-palette.data';

const SWIPE_THRESHOLD = 110; // px pour valider un geste
const MAX_ROTATE = 10; // degrés

/**
 * Un écran de l'édition : fond immersif aux couleurs du thème, titre massif,
 * résumé, lien vers la source, rail d'actions à droite.
 *
 * Geste : glisser la carte horizontalement. À gauche = passer, à droite =
 * garder. La carte suit le doigt (translation + légère rotation), un badge
 * « Passer » / « Garder » apparaît, puis la carte s'éjecte si le seuil est
 * franchi, sinon revient en place.
 */
@Component({
  selector: 'app-news-card',
  templateUrl: './news-card.html',
  styleUrl: './news-card.scss',
  host: {
    '[class.saved]': 'isSaved()',
    '[class.active]': 'active()',
    // Sens du mouvement alterné : deux écrans voisins ne dérivent pas pareil.
    '[style.--dir]': 'index() % 2 === 0 ? 1 : -1',
  },
})
export class NewsCard {
  readonly block = input.required<SummaryBlock>();
  readonly index = input(0);
  readonly total = input(0);
  readonly nextLabel = input<string | null>(null);
  readonly isSaved = input(false);
  /** Vrai quand cet écran est celui qu'on regarde : seul lui anime son fond. */
  readonly active = input(false);

  readonly opened = output<SummaryBlock>();
  readonly saved = output<SummaryBlock>();
  readonly shared = output<SummaryBlock>();
  readonly passed = output<SummaryBlock>();
  readonly lessOfThis = output<SummaryBlock>();

  readonly meta = computed(() => CATEGORIES.find((c) => c.id === this.block().category));
  readonly palette = computed(() => CATEGORY_PALETTE[this.block().category]);

  /** Une image distante peut échouer (404, hors ligne) : on retombe sur la couleur. */
  private readonly imageFailed = signal(false);
  readonly photo = computed(() => (this.imageFailed() ? null : this.block().image ?? null));

  /** L'image n'apparaît qu'une fois décodée, pour éviter le saut visuel. */
  readonly imageReady = signal(false);

  onImageError(): void {
    this.imageFailed.set(true);
  }

  onImageLoad(): void {
    this.imageReady.set(true);
  }

  readonly lede = computed(() => {
    const s = this.block().summary;
    const end = s.search(/[.!?](\s|$)/);
    return end === -1 ? s : s.slice(0, end + 1).replace(/[.]$/, '');
  });
  readonly rest = computed(() => this.block().summary.slice(this.lede().length + 1).trim());
  readonly primarySource = computed(() => this.block().sources[0] ?? null);
  readonly extraSources = computed(() => Math.max(0, this.block().sources.length - 1));

  // ---- geste ----
  readonly dx = signal(0);
  readonly dragging = signal(false);
  readonly leaving = signal<'left' | 'right' | null>(null);

  readonly rotate = computed(() => Math.max(-MAX_ROTATE, Math.min(MAX_ROTATE, this.dx() / 14)));

  /**
   * Parallaxe : le fond suit le doigt plus lentement que la carte, ce qui
   * creuse la profondeur. Appliquée à un conteneur, pour ne pas écraser la
   * transformation du Ken Burns qui tourne sur l'image elle-même.
   */
  readonly parallax = computed(() => -this.dx() / 16);
  readonly intent = computed<'pass' | 'keep' | null>(() => {
    const d = this.dx();
    if (d < -40) return 'pass';
    if (d > 40) return 'keep';
    return null;
  });
  readonly intentStrength = computed(() => Math.min(1, Math.abs(this.dx()) / SWIPE_THRESHOLD));

  private startX = 0;
  private startY = 0;
  private horizontal: boolean | null = null;

  onPointerDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('a, button')) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.horizontal = null;
    this.dragging.set(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging()) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (this.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!this.horizontal) {
        // Geste vertical : on laisse le scroll-snap faire son travail.
        this.dragging.set(false);
        return;
      }
    }
    this.dx.set(dx);
  }

  onPointerUp(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const d = this.dx();
    if (d <= -SWIPE_THRESHOLD) {
      this.fling('left', () => this.passed.emit(this.block()));
    } else if (d >= SWIPE_THRESHOLD) {
      this.fling('right', () => this.saved.emit(this.block()));
    } else {
      this.dx.set(0);
    }
  }

  private fling(dir: 'left' | 'right', done: () => void): void {
    this.leaving.set(dir);
    this.dx.set(dir === 'left' ? -600 : 600);
    setTimeout(() => {
      done();
      this.leaving.set(null);
      this.dx.set(0);
    }, 320);
  }

  keep(): void {
    this.fling('right', () => this.saved.emit(this.block()));
  }
}
