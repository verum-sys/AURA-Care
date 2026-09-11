import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'medicine-reminders';
let channelReady = false;

// Requests OS notification permission and (on Android) creates the notification
// channel. Without this, the app never registers with the system notification
// service, so the OS-level "Notifications" toggle for the app has nothing to
// control. Call once on app start.
export async function initNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  } catch (err) {
    console.error('[notifications] permission request failed', err);
  }

  if (!channelReady && Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Medicine Reminders',
        description: 'Alerts for scheduled medicines and check-ins',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      channelReady = true;
    } catch (err) {
      console.error('[notifications] channel creation failed', err);
    }
  }
}

// Deterministic 31-bit id from a string, so the same (medicine, slot, tier)
// always maps to the same notification id and can be cancelled precisely.
export function hashToNotificationId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647;
}

export async function scheduleReminderNotification(opts: {
  id: number;
  title: string;
  body: string;
  at: Date;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (opts.at.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: opts.id,
        title: opts.title,
        body: opts.body,
        channelId: CHANNEL_ID,
        schedule: { at: opts.at, allowWhileIdle: true },
      }],
    });
  } catch (err) {
    console.error('[notifications] schedule failed', err);
  }
}

export async function cancelReminderNotifications(ids: number[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || ids.length === 0) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
  } catch (err) {
    console.error('[notifications] cancel failed', err);
  }
}

// Android only auto-displays an FCM push in the system tray while the app is
// backgrounded or killed — with the app open, `pushNotificationReceived`
// fires instead and nothing appears unless something shows it. Re-display it
// as a local notification so a reminder is visible no matter what state the
// app is in when it arrives.
export async function showForegroundPush(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.abs(Date.now() % 2147483647),
        title,
        body,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(Date.now() + 500) },
      }],
    });
  } catch (err) {
    console.error('[notifications] foreground display failed', err);
  }
}
