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
    
    if (!messaging) {
      // Initialize Firebase (use your config)
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };

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

    // Get token
    fcmToken = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    // Listen for foreground messages
    onMessage(messaging, (payload: any) => {
      console.log("Foreground message:", payload);
      // Handle foreground notification
      if (payload.notification) {
        new Notification(payload.notification.title || "BillZo", {
          body: payload.notification.body,
          icon: payload.notification.icon,
          tag: payload.data?.type,
        });
      }
    });

    return fcmToken;
  } catch (error) {
    console.log("FCM initialization skipped:", error);
    return null;
  }
}

export async function registerDevice(tenantId: string): Promise<boolean> {
  const token = await initNotifications();
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

// Event-based notification triggers
export type NotificationEvent = 
  | { type: "payment_success"; data: { amount: number; customerName: string } }
  | { type: "payment_failed"; data: { amount: number; customerName: string } }
  | { type: "reminder_sent"; data: { invoiceId: string; customerName: string } }
  | { type: "invoice_overdue"; data: { invoiceId: string; amount: number; daysOverdue: number } }
  | { type: "low_stock"; data: { productName: string; currentStock: number } };

export async function sendNotification(event: NotificationEvent): Promise<void> {
  // This would be called from the server-side in production
  // For now, we just log it
  console.log("Notification event:", event);
  
  // In production, this would call the FCM API to send to the tenant's devices
  // const tokens = await db().deviceTokens.where('tenantId').equals(tenantId).toArray();
  // await sendToFCM(tokens.map(t => t.fcmToken), payload);
}

// Local notification (for testing without Firebase)
export function showLocalNotification(title: string, body: string, icon?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: icon || "/icon-192.png",
      badge: "/icon-96.png",
    });
  }
}