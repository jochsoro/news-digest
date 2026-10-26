import { DOCUMENT, Injectable, NgZone, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { filter } from 'rxjs/operators';
import { PreferencesService } from './preferences.service';

/** Disposition choisie par le natif :
 *  - 'overlay' : UITabBar en bas, par-dessus la webview → le CSS réserve sa hauteur ;
 *  - 'system'  : barre dans la colonne latérale réservée par iOS (iPhone Duo
 *    fermé) → rien à réserver. */
type NativeTabBarMode = 'overlay' | 'system';

interface NativeTabBarItem {
  id: string;
  title: string;
  sfSymbol: string;
  fallbackSymbol?: string;
}

interface NativeTabBarPlugin {
  configure(options: {
    items: NativeTabBarItem[];
    selectedId?: string | null;
    tint?: string;
    theme?: 'light' | 'dark' | 'system';
  }): Promise<{ mode?: NativeTabBarMode; barHeight?: number; sideInset?: number } | void>;
  select(options: { id: string | null }): Promise<void>;
  setVisible(options: { visible: boolean; animated?: boolean }): Promise<void>;
  destroy(): Promise<void>;
  addListener(event: 'tabSelected', cb: (data: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'layoutChanged', cb: (data: { mode: NativeTabBarMode; sideInset?: number }) => void): Promise<PluginListenerHandle>;
}

const NativeTabBar = registerPlugin<NativeTabBarPlugin>('NativeTabBar');

/** Un onglet = une route + un symbole SF. */
const TABS = [
  { id: 'actus', path: '/', title: 'Actus', sfSymbol: 'newspaper.fill', fallbackSymbol: 'newspaper' },
  { id: 'profil', path: '/profile', title: 'Profil', sfSymbol: 'person.crop.circle.fill', fallbackSymbol: 'person.crop.circle' },
];

/**
 * iOS : délègue la barre d'onglets au plugin natif NativeTabBar
 * (ios/App/App/NativeTabBarPlugin.swift) — vraie UITabBar, Liquid Glass sur
 * iOS 26, et barre système dans la colonne latérale sur iPhone Duo fermé.
 * Le dock web se masque dès que la barre native est en place.
 *
 * Répartition : le natif dessine et émet `tabSelected` ; ce service garde
 * la main sur l'onglet actif (suivi des routes), le thème (l'écran d'actus
 * est sombre), la teinte (accent choisi) et la marge CSS à réserver.
 *
 * No-op complet hors iOS : le dock web reste la barre d'onglets.
 */
@Injectable({ providedIn: 'root' })
export class NativeTabsService {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly prefs = inject(PreferencesService);

  private available = false;
  private barHeight = 49;
  private lastTheme: 'light' | 'dark' | 'system' | null = null;

  constructor() {
    // Accent ou thème modifiés dans les réglages → la barre se reconfigure.
    effect(() => {
      const { accent, theme } = this.prefs.prefs();
      void accent; void theme;
      if (untracked(() => this.available)) void this.configure().catch(() => undefined);
    });
  }

  async init(): Promise<void> {
    if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('NativeTabBar')) {
      return;
    }

    try {
      // Tap natif → navigation Angular.
      await NativeTabBar.addListener('tabSelected', ({ id }) => {
        this.zone.run(() => {
          const tab = TABS.find((t) => t.id === id);
          if (tab && this.activeId() !== id) this.router.navigateByUrl(tab.path);
        });
      });

      // Pliage / dépliage du Duo : la barre change de place.
      await NativeTabBar.addListener('layoutChanged', ({ mode, sideInset }) => {
        this.zone.run(() => this.applyMode(mode, sideInset));
      });

      await this.configure();
      this.available = true;

      // Route → onglet actif, et thème de la barre selon l'écran.
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe(() => this.sync());

    } catch (e) {
      console.warn('[tabs] barre native indisponible, dock web conservé', e);
      this.available = false;
      this.doc.documentElement.removeAttribute('data-native-tabs');
    }
  }

  private async configure(): Promise<void> {
    const theme = this.themeFor(this.router.url);
    this.lastTheme = theme;
    const res = await NativeTabBar.configure({
      items: TABS.map(({ id, title, sfSymbol, fallbackSymbol }) => ({ id, title, sfSymbol, fallbackSymbol })),
      selectedId: this.activeId(),
      tint: this.readAccent(),
      theme,
    });
    const r = res as { mode?: NativeTabBarMode; barHeight?: number; sideInset?: number } | void;
    const mode = r?.mode ?? 'overlay';
    if (typeof r?.barHeight === 'number' && r.barHeight > 0) this.barHeight = r.barHeight;
    this.applyMode(mode, r?.sideInset);
    await NativeTabBar.setVisible({ visible: !this.isSubPage(this.router.url), animated: false });
  }

  /** Pages sans onglet (lecteur, réglages, régions) : la barre se retire. */
  private isSubPage(url: string): boolean {
    return url.startsWith('/read') || url.startsWith('/settings') || url.startsWith('/regions');
  }

  private async sync(): Promise<void> {
    if (!this.available) return;
    await NativeTabBar.setVisible({ visible: !this.isSubPage(this.router.url) }).catch(() => undefined);
    const theme = this.themeFor(this.router.url);
    if (theme !== this.lastTheme) {
      // Le thème de la barre ne se change qu'en reconfigurant (API Dalà).
      await this.configure().catch(() => undefined);
      return;
    }
    await NativeTabBar.select({ id: this.activeId() }).catch(() => undefined);
  }

  /** Reporte la disposition au CSS : marge basse à réserver, dock web masqué. */
  private applyMode(mode: NativeTabBarMode, sideInset?: number): void {
    const root = this.doc.documentElement;
    root.setAttribute('data-native-tabs', mode);
    // Colonne latérale du Duo : largeur mesurée côté natif, en secours de
    // env(safe-area-inset-right) (le CSS prend le max des deux).
    root.style.setProperty('--side-r', `${mode === 'system' ? Math.round(sideInset ?? 0) : 0}px`);
    if (mode === 'overlay') {
      // La UITabBar fait barHeight + zone sûre ; le CSS ajoute déjà --safe-b.
      root.style.setProperty('--nav-h', `${Math.round(this.barHeight)}px`);
    } else {
      // Colonne système hors de la webview : rien à réserver en bas.
      root.style.setProperty('--nav-h', '0px');
    }
  }

  /** Onglet actif pour l'URL courante (les sous-pages héritent de leur parent). */
  private activeId(): string {
    const url = this.router.url;
    return url.startsWith('/profile') || url.startsWith('/settings') ? 'profil' : 'actus';
  }

  /** L'écran d'actus est sombre quel que soit le thème ; le reste suit l'app. */
  private themeFor(url: string): 'light' | 'dark' | 'system' {
    if (!(url.startsWith('/profile') || url.startsWith('/settings'))) return 'dark';
    const pref = this.prefs.prefs().theme;
    if (pref === 'auto') return 'system';
    return pref;
  }

  /** Accent courant, lu dans le CSS (posé par ThemeService). */
  private readAccent(): string | undefined {
    try {
      const v = getComputedStyle(this.doc.documentElement).getPropertyValue('--accent').trim();
      return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : undefined;
    } catch {
      return undefined;
    }
  }
}
