import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/digest/digest.page').then((m) => m.DigestPage),
  },
  {
    path: 'regions',
    loadComponent: () =>
      import('./features/region-select/region-select.page').then((m) => m.RegionSelectPage),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: '' },
];
