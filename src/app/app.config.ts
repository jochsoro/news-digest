import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { NewsGateway, MockNewsGateway, HttpNewsGateway } from './core/services/news-gateway';
import { DIGEST_BASE_URL } from './core/config';
import { PreferencesService } from './core/services/preferences.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(),

    // Source d'actus : les éditions publiées par ingest/ sur le CDN (HttpNewsGateway,
    // avec cache hors ligne), ou les données de démo si aucune URL n'est configurée.
    { provide: NewsGateway, useClass: DIGEST_BASE_URL !== null ? HttpNewsGateway : MockNewsGateway },

    // Hydrate les préférences depuis le disque avant le premier rendu.
    provideAppInitializer(() => inject(PreferencesService).load()),
  ],
};
