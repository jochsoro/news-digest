import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { HapticsService } from './core/services/haptics.service';
import { NativeTabsService } from './core/services/native-tabs.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly haptics = inject(HapticsService);

  constructor() {
    inject(ThemeService).init();
    // Sur iOS, remplace le dock web par une UITabBar système quand elle existe.
    inject(NativeTabsService).init();
  }
}
