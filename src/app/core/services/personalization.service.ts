import { Injectable } from '@angular/core';
import { SummaryBlock } from '../models/article.model';
import { Digest } from '../models/digest.model';
import { CategoryId } from '../models/category.model';
import { EngagementSignals, UserPreferences } from '../models/preferences.model';

interface ScoredBlock {
  block: SummaryBlock;
  score: number;
}

/**
 * Couche de personnalisation. Prend un digest MUTUALISÉ (identique pour tous
 * les utilisateurs d'une même région) et le réordonne / filtre selon le profil
 * de CET utilisateur. Aucun appel réseau ni LLM ici : on assemble du pré-mâché,
 * ce qui garde le coût marginal par utilisateur quasi nul.
 */
@Injectable({ providedIn: 'root' })
export class PersonalizationService {
  /**
   * @returns les blocs à afficher, filtrés et triés par pertinence décroissante.
   */
  personalize(
    digest: Digest,
    prefs: UserPreferences,
    signals: EngagementSignals,
  ): SummaryBlock[] {
    const selected = new Set(prefs.selectedCategories);
    const weights = this.engagementWeights(signals);

    const scored: ScoredBlock[] = digest.blocks
      // 1. Filtre thèmes (vide = tous les thèmes)
      .filter((b) => selected.size === 0 || selected.has(b.category))
      // 2. Retire ce que l'utilisateur a masqué
      .filter((b) => !signals.dismissed.includes(this.blockId(digest, b)))
      // 3. Score = importance éditoriale + préférence apprise
      .map((block) => ({
        block,
        score: this.scoreBlock(block, weights),
      }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.block);
  }

  /** Identifiant stable d'un bloc dans un digest (région+date+thème). */
  blockId(digest: Digest, block: SummaryBlock): string {
    return `${digest.regionId}|${digest.date}|${block.category}`;
  }

  /**
   * Transforme les signaux bruts en poids normalisés par thème (0–1).
   * Les favoris et partages pèsent plus que les simples ouvertures :
   * ce sont des signaux d'intérêt plus forts.
   */
  private engagementWeights(signals: EngagementSignals): Map<CategoryId, number> {
    const raw = new Map<CategoryId, number>();
    const add = (map: Partial<Record<CategoryId, number>>, factor: number) => {
      for (const [cat, n] of Object.entries(map) as [CategoryId, number][]) {
        raw.set(cat, (raw.get(cat) ?? 0) + n * factor);
      }
    };
    add(signals.opensByCategory, 1);
    add(signals.savesByCategory, 3);
    add(signals.sharesByCategory, 4);

    const max = Math.max(1, ...raw.values());
    const norm = new Map<CategoryId, number>();
    for (const [cat, v] of raw) norm.set(cat, v / max);
    return norm;
  }

  /**
   * Mélange importance éditoriale (salience) et préférence apprise.
   * 70% salience / 30% engagement : l'actu importante reste visible même
   * sur un thème peu consulté, mais les centres d'intérêt remontent.
   */
  private scoreBlock(block: SummaryBlock, weights: Map<CategoryId, number>): number {
    const engagement = weights.get(block.category) ?? 0;
    return 0.7 * block.salience + 0.3 * engagement;
  }
}
