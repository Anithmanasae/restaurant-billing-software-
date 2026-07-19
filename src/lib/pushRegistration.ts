/**
 * Serverless push notifications — the RECEIVE side (native, app-only).
 *
 * Registers this device for Expo push at login: notification permission
 * (Android 13+ runtime dialog), a high-importance channel so KOT updates
 * heads-up + buzz over the lockscreen, and the Expo push token — cached into
 * `push.ts` so `sendKot` can stamp it onto fired tickets.
 *
 * Remote push needs a real build (the EAS APK with google-services.json +
 * the FCM key uploaded to EAS) — in Expo Go / emulators without Play
 * services `getExpoPushTokenAsync` throws and we quietly stay token-less;
 * the in-app banners still cover the foreground case.
 *
 * KEEP native imports out of push.ts — the Node e2e scripts import that.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { KOT_PUSH_CHANNEL, setCachedPushToken } from "@/lib/push";

// Waiters may be on a screen without the in-app banner (or another waiter's
// order screen) — always surface pushes, foreground included.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registered = false;

/**
 * Idempotent; call after login resolves a usable profile. Returns the token
 * (also cached in push.ts) or null when unavailable/denied.
 */
export async function registerForKotPush(): Promise<string | null> {
  if (registered) return null; // token already cached (or known-unavailable)
  registered = true;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(KOT_PUSH_CHANNEL, {
        name: "Kitchen order updates",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    setCachedPushToken(token);
    return token;
  } catch (e) {
    // Expo Go, emulator without Play services, no network — banners only.
    console.warn("[push] registration failed:", e);
    return null;
  }
}
