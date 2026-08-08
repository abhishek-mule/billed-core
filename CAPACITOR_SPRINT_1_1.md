# Capacitor Sprint 1.1 — Physical Android Validation

> Objective: prove **BillZo works inside the Android shell** on a real device. No new
> architecture. If this passes, Sprint 2 = native FCM + notification deep links, nothing else.
>
> Architecture under test: `com.billzo.app` (Capacitor 8 WebView) → **remote** `https://billzo-phi.vercel.app` → Next.js. **This is NOT an offline app.**
> Network loss on open/reopen is *expected* behavior — don't read it as a Capacitor bug.

## Install

```sh
# device connected with USB debugging on
adb devices
adb install -r mini_saas_frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Test matrix (record PASS/FAIL + note)

| # | Test         | Must pass                                                                 | Result |
|---|--------------|---------------------------------------------------------------------------|--------|
| 1 | Install/open | `com.billzo.app` launches BillZo                                         |        |
| 2 | Login        | Authentication succeeds                                                   |        |
| 3 | Close/reopen | Session/cookies remain valid                                              |        |
| 4 | POS          | Create an invoice normally                                                |        |
| 5 | Camera       | Permission prompt → scanner opens → QR result returned                    |        |
| 6 | Recovery     | Queue loads the correct tenant data                                       |        |
| 7 | WhatsApp     | Handoff opens WhatsApp with correct number/message                        |        |
| 8 | UPI          | Deep link / QR flow opens a compatible UPI app and returns to BillZo      |        |
| 9 | Back button  | In-page nav → history.back(); at root → minimize/exit behaves             |        |
| 10| Keyboard     | Inputs are never hidden behind the keyboard                               |        |
| 11| Safe areas   | Nothing clipped under status/navigation bars                              |        |
| 12| Network loss | Offline → opens gracefully (clear error), not "broken"; restore → works   |        |
| 13| Kill/reopen  | Returns to a valid authenticated state                                    |        |

## Must-test handoffs (WebView/native differences hide here)

- **WhatsApp** → `Send WhatsApp` → Android launches WhatsApp → correct number/chat/message.
- **UPI** → payment intent → compatibility chooser appears → return to BillZo works.
- **Camera** → native permission prompt → opens → scanner returns the result.

> If WhatsApp/UPI don't auto-launch, that's a targeted bridge gap (a `shouldOverrideUrlLoading`
> rule), **not** a reason to bolt on new native SDKs. Record it, and only wire the rule after
> confirming the failure on device.

## Exit gate

- [ ] All 13 matrix rows pass
- [ ] The 3 handoffs pass
- [ ] No crashes caught in Logcat (`adb logcat -d | grep -iE "billzo|capacitor|fatal"`)

## Explicitly NOT in this sprint

Native FCM, Bluetooth, offline native storage, native payment SDK, static Next export,
Capacitor-specific recovery logic. A passing **debug** APK does **not** prove release
signing / Play Integrity / Play Store config / production notifications are done.