importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// To avoid hardcoding API keys in GitHub (which triggers false positive secret warnings),
// we pull these from query parameters during registration.
firebase.initializeApp({
  apiKey: new URLSearchParams(location.search).get("apiKey"),
  authDomain: new URLSearchParams(location.search).get("authDomain"),
  projectId: new URLSearchParams(location.search).get("projectId"),
  storageBucket: new URLSearchParams(location.search).get("storageBucket"),
  messagingSenderId: new URLSearchParams(location.search).get("messagingSenderId"),
  appId: new URLSearchParams(location.search).get("appId")
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  
  // Customize notification here
  const notificationTitle = payload.notification?.title || payload.data?.title || "BillZo";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "",
    icon: payload.notification?.icon || "/logo_new.png",
    badge: "/logo-icon.svg",
    tag: payload.data?.type || "billzo-alert",
    requireInteraction: payload.data?.type === "daily_brief" || payload.data?.type === "payment_due",
    data: {
      url: payload.data?.url || "/dashboard",
      ...payload.data
    },
    actions: [
      {
        action: "open",
        title: "Open BillZo"
      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
