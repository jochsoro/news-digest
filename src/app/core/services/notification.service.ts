import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const DIGEST_NOTIFICATION_ID = 1001;

/**
 * Planifie la notification quotidienne « votre digest est prêt » à l'heure
 * choisie dans les préférences. Utilise les notifications locales : le
 * déclenchement est géré par l'OS, sans serveur de push.
 *
 * Pour une vraie remise de contenu à l'ouverture (digest déjà généré côté
 * backend), on compléterait avec @capacitor/push-notifications + un envoi
 * serveur ; les notifications locales suffisent pour le rappel d'ouverture.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private get available(): boolean {
    return Capacitor.isNativePlatform();
  }

  async requestPermission(): Promise<boolean> {
    if (!this.available) return false;
    const res = await LocalNotifications.requestPermissions();
    return res.display === 'granted';
  }

  /** (Re)planifie le rappel quotidien à HH:mm. */
  async scheduleDaily(timeHHmm: string): Promise<void> {
    if (!this.available) return;
    const [hour, minute] = timeHHmm.split(':').map(Number);

    await this.cancel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DIGEST_NOTIFICATION_ID,
          title: 'Votre digest du jour est prêt 📰',
          body: "Les actus qui comptent, résumées pour vous.",
          schedule: { on: { hour, minute }, allowWhileIdle: true },
        },
      ],
    });
  }

  async cancel(): Promise<void> {
    if (!this.available) return;
    await LocalNotifications.cancel({ notifications: [{ id: DIGEST_NOTIFICATION_ID }] });
  }
}
