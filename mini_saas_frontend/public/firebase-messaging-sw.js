importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: new URLSearchParams(location.search).get("apiKey") || "your-api-key", // In production you should inject this or hardcode it if it's public
  // We can just rely on the default behavior since the app config is passed during initialization,
  // but standard practice is to hardcode the config here, or use the query params workaround.
  // Actually, Vercel/NextJS doesn't easily process env vars in public folder JS files.
  // We will add placeholders. You should replace these with your actual keys in production.
  apiKey: "AIzaSyCvpvVcGitD3G6x6XxRrZbDXDvsMt5OW3o",
  authDomain: "billzo-87eb2.firebaseapp.com",
  projectId: "billzo-87eb2",
  storageBucket: "billzo-87eb2.firebasestorage.app",
  messagingSenderId: "493505097813",
  appId: "1:493505097813:web:a409b7acd32c58f701e4dc"
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
