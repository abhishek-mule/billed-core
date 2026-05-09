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
  const notificationTitle = payload.notification.title || "BillZo";
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || "/icon-192.png",
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
