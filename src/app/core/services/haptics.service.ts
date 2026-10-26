import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PreferencesService } from './preferences.service';

/** Retour haptique discret, respectant la préférence utilisateur. No-op en web. */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly prefs = inject(PreferencesService);

  private get enabled(): boolean {
    return Capacitor.isNativePlatform() && this.prefs.prefs().haptics;
  }

  tap(): void {
    if (this.enabled) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  select(): void {
    if (this.enabled) Haptics.selectionChanged().catch(() => {});
  }

  success(): void {
    if (this.enabled) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }
}
