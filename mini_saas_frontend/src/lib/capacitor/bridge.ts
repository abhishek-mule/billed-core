import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// BillZo native bridge (Capacitor 8, Sprint 1).
// Runs ONLY inside the Android shell — every call no-ops on web/PWA.
// Scope: back button, status bar, keyboard resize, haptics.
// Safe areas: Capacitor 8 edge-to-edge exposes CSS env(safe-area-inset-*)
// natively (layout already sets viewportFit: 'cover'), so no JS getter needed.

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function initCapacitorBridge(): Promise<void> {
  if (!isNative()) return

  await CapApp.addListener('backButton', async ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      await CapApp.minimizeApp()
    }
  })

  // Deep links (magic-link confirm, link handoffs): navigate the SAME WebView
  // so cookies/session from the app are preserved. Chrome handing us the link
  // means App Links claimed billzo-phi.vercel.app.
  const launch = await CapApp.getLaunchUrl()
  if (launch?.url) void navigateToAppUrl(launch.url)
  await CapApp.addListener('appUrlOpen', ({ url }) => {
    void navigateToAppUrl(url)
  })

  await StatusBar.setStyle({ style: StatusBarStyle.Light })
  await StatusBar.setBackgroundColor({ color: '#0B0F19' })
  await StatusBar.setOverlaysWebView({ overlay: true })

  await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
}

function navigateToAppUrl(raw: string): void {
  try {
    const url = new URL(raw)
    if (url.hostname.endsWith('billzo-phi.vercel.app')) {
      window.location.href = url.href
    }
  } catch {
    // ignore malformed / non-app links
  }
}

export async function hapticTap(): Promise<void> {
  if (!isNative()) return
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}
