import { Component, computed, input, output } from '@angular/core';
import { SummaryBlock } from '../../../core/models/article.model';
import { CATEGORIES } from '../../../core/data/categories.data';

/**
 * Un bloc du digest, en deux variantes :
 *  - `featured` : la manchette — grand titre typographique, résumé visible,
 *    sources affichées. Réservée au bloc le mieux classé.
 *  - compact : une ligne de la liste, qui se déplie au toucher pour révéler
 *    le résumé et les sources. La liste reste scannable en 10 secondes.
 */
@Component({
  selector: 'app-digest-row',
  templateUrl: './digest-row.html',
  styleUrl: './digest-row.scss',
  host: {
    '[class.featured]': 'featured()',
    '[class.open]': 'featured() || expanded()',
  },
})
export class DigestRow {
  readonly block = input.required<SummaryBlock>();
  readonly featured = input(false);
  readonly expanded = input(false);

  readonly toggled = output<void>();
  readonly opened = output<SummaryBlock>();
  readonly saved = output<SummaryBlock>();
  readonly dismissed = output<SummaryBlock>();

  readonly meta = computed(() => CATEGORIES.find((c) => c.id === this.block().category));

  /** Première phrase du résumé — sert de titre à la ligne compacte. */
  readonly lede = computed(() => {
    const s = this.block().summary;
    const end = s.search(/[.!?](\s|$)/);
    return end === -1 ? s : s.slice(0, end + 1);
  });

  readonly rest = computed(() => this.block().summary.slice(this.lede().length).trim());
}
