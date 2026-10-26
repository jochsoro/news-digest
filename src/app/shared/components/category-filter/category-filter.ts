import { Component, input, output } from '@angular/core';
import { Category, CategoryId } from '../../../core/models/category.model';
import { CATEGORIES } from '../../../core/data/categories.data';

/**
 * Barre de filtres thèmes, défilable horizontalement.
 * "Tous" = aucun thème sélectionné (selected vide).
 */
@Component({
  selector: 'app-category-filter',
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.scss',
})
export class CategoryFilter {
  readonly categories: Category[] = CATEGORIES;
  readonly selected = input<CategoryId[]>([]);
  readonly toggled = output<CategoryId>();
  readonly cleared = output<void>();

  isSelected(id: CategoryId): boolean {
    return this.selected().includes(id);
  }
}
