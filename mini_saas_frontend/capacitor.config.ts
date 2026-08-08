import type { CapacitorConfig } from '@capacitor/cli'

// BillZo Android shell (Capacitor 8.x)
// Sprint 1: WebView wrapper over the deployed PWA. Remote-first — the WebView
// loads billzo-phi.vercel.app directly (no static export, no offline shell).
// Native FCM / Bluetooth / payment SDKs are intentionally NOT wired here yet.

const config: CapacitorConfig = {
  appId: 'com.billzo.app',
  appName: 'BillZo',
  webDir: 'www',
  server: {
    url: 'https://billzo-phi.vercel.app',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0B0F19',
    allowMixedContent: false,
  },
}

export default config
