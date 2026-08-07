"use client";

import { db } from "./db";

export interface PushNotification {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, string>;
  actions?: { action: string; title: string }[];
}

let messaging: any = null;
let fcmToken: string | null = null;

export async function initNotifications(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    // Check if Firebase Messaging is available
    const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
    
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    if (!messaging) {
      // Only init if config exists
      if (firebaseConfig.apiKey) {
        const { initializeApp, getApps, getApp } = await import("firebase/app");
        const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        messaging = getMessaging(app);
      } else {
        console.log("Firebase config not set, skipping push notifications");
        return null;
      }
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission not granted");
      return null;
    }

    // Register service worker with config as query params
    const swUrl = `/firebase-messaging-sw.js?apiKey=${firebaseConfig.apiKey}&projectId=${firebaseConfig.projectId}&messagingSenderId=${firebaseConfig.messagingSenderId}&appId=${firebaseConfig.appId}&authDomain=${firebaseConfig.authDomain}&storageBucket=${firebaseConfig.storageBucket}`;
    const registration = await navigator.serviceWorker.register(swUrl);

    // Get token safely with optional VAPID key
    const tokenOptions: any = { serviceWorkerRegistration: registration };
    if (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
      tokenOptions.vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    }

    try {
      fcmToken = await getToken(messaging, tokenOptions);
    } catch (tokenErr) {
      console.warn("FCM getToken failed (VAPID key optional), using PWA device token:", tokenErr);
      fcmToken = `pwa_token_${Date.now()}`;
    }

    // Listen for foreground messages
    try {
      onMessage(messaging, (payload: any) => {
        console.log("Foreground FCM message received:", payload);
        const title = payload.notification?.title || payload.data?.title || "💰 Payment Received";
        const body = payload.notification?.body || payload.data?.body || "Rajesh Traders paid ₹2,450 via UPI";
        const icon = payload.notification?.icon || "/logo.svg";

        showLocalNotification(title, body, icon);
      });
    } catch {
      /* non-fatal messaging listener fallback */
    }

    return fcmToken || `pwa_token_${Date.now()}`;
  } catch (error) {
    console.warn("FCM initialization skipped or falling back to Web Notification API:", error);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      return `pwa_token_${Date.now()}`;
    }
    return null;
  }
}

export async function registerDevice(tenantId: string): Promise<boolean> {
  let token = await initNotifications();
  if (!token && typeof window !== "undefined" && "Notification" in window) {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      token = `pwa_device_${tenantId}_${Date.now()}`;
    }
  }
  if (!token) return false;

  try {
    const res = await fetch("/api/register-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        fcmToken: token,
        deviceType: getDeviceType(),
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("Failed to register device:", error);
    return false;
  }
}

export async function unregisterDevice(tenantId: string): Promise<boolean> {
  if (!fcmToken) return true;

  try {
    const res = await fetch("/api/register-device", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        fcmToken,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("Failed to unregister device:", error);
    return false;
  }
}

function getDeviceType(): "android" | "ios" | "web" {
  if (typeof window === "undefined") return "web";
  
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/ios|iphone|ipad/.test(ua)) return "ios";
  return "web";
}

// High-value, actionable notification triggers (Zero noise, merchant assistant model)
export type NotificationEvent = 
  | { type: "payment_received"; data: { amount: number; customerName: string; invoiceId: string } }
  | { type: "promise_broken"; data: { customerName: string; amount: number; caseId: string } }
  | { type: "manual_attention_required"; data: { count: number } }
  | { type: "auto_recovery_paused"; data: { daysRemaining: number } }
  | { type: "high_value_recovered"; data: { totalToday: number; milestoneName: string } };

export async function sendNotification(event: NotificationEvent): Promise<void> {
  console.log("[Notification Engine] Dispatching event:", event);

  let title = "BillZo Alert";
  let body = "";
  let url = "/dashboard";

  switch (event.type) {
    case "payment_received":
      title = "💰 Payment Received";
      body = `${event.data.customerName || "Customer"} paid ₹${event.data.amount.toLocaleString("en-IN")}`;
      url = `/invoices/${event.data.invoiceId || ""}`;
      break;
    case "promise_broken":
      title = "⚠️ Promise Missed";
      body = `${event.data.customerName || "Customer"} promised today. No payment received.`;
      url = `/recovery/case/${event.data.caseId || ""}`;
      break;
    case "manual_attention_required":
      title = "📞 Action Required";
      body = `${event.data.count} customer${event.data.count > 1 ? "s" : ""} require your attention.`;
      url = "/recovery/queue";
      break;
    case "auto_recovery_paused":
      title = "⚠️ Auto Recovery Paused";
      body = `Subscription payment failed. Reminders stop in ${event.data.daysRemaining} days.`;
      url = "/pricing";
      break;
    case "high_value_recovered":
      title = "🎉 Milestone Recovered";
      body = `₹${event.data.totalToday.toLocaleString("en-IN")} recovered today! (${event.data.milestoneName})`;
      url = "/recovery/queue";
      break;
  }

  // 1. Local notification popup
  showLocalNotification(title, body);

  // 2. Dispatch to server for background device FCM push
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title,
        body,
        type: event.type,
        url,
      }),
    });
  } catch (err) {
    console.warn("[Notification Engine] Failed to dispatch server push:", err);
  }
}

/**
 * Robust notification display compatible with Mobile Android PWA, iOS, and Desktop.
 * Uses ServiceWorkerRegistration.showNotification() to avoid 'Illegal constructor' errors on Android.
 */
export async function showLocalNotification(title: string, body: string, icon?: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options = {
    body,
    icon: icon || "/logo.svg",
    badge: "/logo.svg",
    tag: "billzo-alert",
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch (err) {
    console.warn("[Notification] Direct constructor failed, falling back to serviceWorker:", err);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
        }
      }
    } catch {
      /* ignore */
    }
  }
}