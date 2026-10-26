import { Injectable, effect, inject, DOCUMENT } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PreferencesService } from './preferences.service';
import { ACCENTS } from '../models/preferences.model';

/**
 * Projette les préférences d'apparence sur le document :
 *  - data-theme = light | dark (résolu depuis auto + prefers-color-scheme)
 *  - --accent / --accent-wash recalculés depuis l'accent choisi
 *  - data-text = s | m | l pour l'échelle typographique
 * et aligne la barre d'état native sur le thème résolu.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefs = inject(PreferencesService);
  private readonly doc = inject(DOCUMENT);
  private readonly media = matchMedia('(prefers-color-scheme: dark)');

  /** À appeler une fois au démarrage (depuis App). */
  init(): void {
    // data-platform pilote les habillages propres à chaque OS (barre d'onglets
    // en verre liquide sur iOS, barre Material sur Android).
    this.doc.documentElement.dataset['platform'] = Capacitor.getPlatform();

    this.media.addEventListener('change', () => this.apply());
    effect(() => {
      // Dépendances : theme, accent, textSize
      const { theme, accent, textSize } = this.prefs.prefs();
      void theme; void accent; void textSize;
      this.apply();
    });
  }

  resolvedDark(): boolean {
    const { theme } = this.prefs.prefs();
    return theme === 'dark' || (theme === 'auto' && this.media.matches);
  }

  private apply(): void {
    const { accent, textSize } = this.prefs.prefs();
    const dark = this.resolvedDark();
    const root = this.doc.documentElement;

    root.dataset['theme'] = dark ? 'dark' : 'light';
    root.dataset['text'] = textSize;

    const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
    const color = dark ? a.dark : a.light;
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-wash', `color-mix(in srgb, ${color} ${dark ? 18 : 10}%, transparent)`);

    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0f15' : '#eef0f3');

    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    }
  }
}
