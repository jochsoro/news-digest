import { Component, input, output, computed } from '@angular/core';
import { SummaryBlock } from '../../../core/models/article.model';
import { CATEGORIES } from '../../../core/data/categories.data';

/**
 * Carte d'un bloc de résumé (un thème). Affiche le résumé LLM et les liens
 * « lire l'article » vers les sources — jamais l'article in extenso, pour
 * rester dans le cadre du droit d'auteur.
 */
@Component({
  selector: 'app-summary-card',
  templateUrl: './summary-card.html',
  styleUrl: './summary-card.scss',
})
export class SummaryCard {
  readonly block = input.required<SummaryBlock>();

  readonly opened = output<SummaryBlock>();
  readonly saved = output<SummaryBlock>();
  readonly dismissed = output<SummaryBlock>();

  readonly meta = computed(() => {
    const b = this.block();
    return CATEGORIES.find((c) => c.id === b.category);
  });

  onOpenSource(): void {
    this.opened.emit(this.block());
  }
}
