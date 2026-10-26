import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CategoryId } from '../models/category.model';
import {
  DEFAULT_PREFERENCES,
  EMPTY_SIGNALS,
  EngagementSignals,
  UserPreferences,
} from '../models/preferences.model';

const PREFS_KEY = 'user_preferences_v1';
const SIGNALS_KEY = 'engagement_signals_v1';

/**
 * Source de vérité des choix explicites (préférences) et implicites (signaux
 * d'engagement) de l'utilisateur. Persiste via Capacitor Preferences, qui
 * s'appuie sur UserDefaults (iOS) / SharedPreferences (Android) et retombe
 * sur localStorage en web. Tout reste local à l'appareil.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly _prefs = signal<UserPreferences>(DEFAULT_PREFERENCES);
  private readonly _signals = signal<EngagementSignals>(EMPTY_SIGNALS);

  /** Préférences en lecture seule (signal). */
  readonly prefs = this._prefs.asReadonly();
  readonly signals = this._signals.asReadonly();

  readonly activeRegionId = computed(() => this._prefs().activeRegionId);
  readonly selectedCategories = computed(() => this._prefs().selectedCategories);

  /** À appeler au démarrage (APP_INITIALIZER) pour hydrater depuis le disque. */
  async load(): Promise<void> {
    const [p, s] = await Promise.all([
      Preferences.get({ key: PREFS_KEY }),
      Preferences.get({ key: SIGNALS_KEY }),
    ]);
    if (p.value) {
      this._prefs.set({ ...DEFAULT_PREFERENCES, ...JSON.parse(p.value) });
    }
    if (s.value) {
      this._signals.set({ ...EMPTY_SIGNALS, ...JSON.parse(s.value) });
    }
  }

  async update(patch: Partial<UserPreferences>): Promise<void> {
    const next = { ...this._prefs(), ...patch };
    this._prefs.set(next);
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(next) });
  }

  async setActiveRegion(regionId: string): Promise<void> {
    await this.update({ activeRegionId: regionId });
  }

  async toggleCategory(id: CategoryId): Promise<void> {
    const current = this._prefs().selectedCategories;
    const next = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id];
    await this.update({ selectedCategories: next });
  }

  // ---- Signaux d'engagement (implicites) ----

  async recordOpen(category: CategoryId): Promise<void> {
    await this.bump('opensByCategory', category);
  }

  async recordSave(category: CategoryId): Promise<void> {
    await this.bump('savesByCategory', category);
  }

  async recordShare(category: CategoryId): Promise<void> {
    await this.bump('sharesByCategory', category);
  }

  async dismiss(blockId: string): Promise<void> {
    const s = this._signals();
    if (s.dismissed.includes(blockId)) return;
    const next = { ...s, dismissed: [...s.dismissed, blockId] };
    this._signals.set(next);
    await this.persistSignals(next);
  }

  /** Efface l'historique d'engagement (la personnalisation repart de zéro). */
  async resetSignals(): Promise<void> {
    this._signals.set(EMPTY_SIGNALS);
    await Preferences.remove({ key: SIGNALS_KEY });
  }

  /** Rétablit les préférences d'usine, en conservant la région et le nom. */
  async resetPreferences(): Promise<void> {
    const { activeRegionId, displayName } = this._prefs();
    const next = { ...DEFAULT_PREFERENCES, activeRegionId, displayName };
    this._prefs.set(next);
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(next) });
  }

  private async bump(
    bucket: 'opensByCategory' | 'savesByCategory' | 'sharesByCategory',
    category: CategoryId,
  ): Promise<void> {
    const s = this._signals();
    const map = { ...s[bucket], [category]: (s[bucket][category] ?? 0) + 1 };
    const next = { ...s, [bucket]: map };
    this._signals.set(next);
    await this.persistSignals(next);
  }

  private async persistSignals(s: EngagementSignals): Promise<void> {
    await Preferences.set({ key: SIGNALS_KEY, value: JSON.stringify(s) });
  }
}
