import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PreferencesService } from '../../core/services/preferences.service';
import { NotificationService } from '../../core/services/notification.service';
import { HapticsService } from '../../core/services/haptics.service';
import {
  ACCENTS,
  AccentId,
  DigestLength,
  TextSize,
  ThemeMode,
} from '../../core/models/preferences.model';
import { Scrolled } from '../../shared/directives/scrolled';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, Scrolled],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly prefsSvc = inject(PreferencesService);
  private readonly notifications = inject(NotificationService);
  private readonly haptics = inject(HapticsService);

  readonly prefs = this.prefsSvc.prefs;
  readonly accents = ACCENTS;
  readonly resetDone = signal(false);

  readonly themes: { value: ThemeMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
  ];

  readonly textSizes: { value: TextSize; label: string }[] = [
    { value: 's', label: 'A' },
    { value: 'm', label: 'A' },
    { value: 'l', label: 'A' },
  ];

  readonly languages = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
  ];

  readonly lengths: { value: DigestLength; label: string; hint: string }[] = [
    { value: 'short', label: 'Court', hint: '1–2 phrases par thème' },
    { value: 'standard', label: 'Standard', hint: '3–4 phrases par thème' },
    { value: 'detailed', label: 'Détaillé', hint: 'résumé développé' },
  ];

  async setTheme(theme: ThemeMode): Promise<void> {
    this.haptics.select();
    await this.prefsSvc.update({ theme });
  }

  async setAccent(accent: AccentId): Promise<void> {
    this.haptics.select();
    await this.prefsSvc.update({ accent });
  }

  async setTextSize(textSize: TextSize): Promise<void> {
    this.haptics.select();
    await this.prefsSvc.update({ textSize });
  }

  async toggleHaptics(): Promise<void> {
    const haptics = !this.prefs().haptics;
    await this.prefsSvc.update({ haptics });
    if (haptics) this.haptics.tap();
  }

  async setLanguage(language: string): Promise<void> {
    this.haptics.select();
    await this.prefsSvc.update({ language });
  }

  async setLength(digestLength: DigestLength): Promise<void> {
    this.haptics.select();
    await this.prefsSvc.update({ digestLength });
  }

  async setTime(event: Event): Promise<void> {
    const digestTime = (event.target as HTMLInputElement).value;
    await this.prefsSvc.update({ digestTime });
    if (this.prefs().notificationsEnabled) {
      await this.notifications.scheduleDaily(digestTime);
    }
  }

  async toggleNotifications(): Promise<void> {
    this.haptics.tap();
    const enabled = !this.prefs().notificationsEnabled;
    if (enabled) {
      const granted = await this.notifications.requestPermission();
      await this.prefsSvc.update({ notificationsEnabled: granted });
      if (granted) await this.notifications.scheduleDaily(this.prefs().digestTime);
    } else {
      await this.prefsSvc.update({ notificationsEnabled: false });
      await this.notifications.cancel();
    }
  }

  async resetAll(): Promise<void> {
    await this.prefsSvc.resetPreferences();
    this.haptics.success();
    this.resetDone.set(true);
    setTimeout(() => this.resetDone.set(false), 1800);
  }
}
