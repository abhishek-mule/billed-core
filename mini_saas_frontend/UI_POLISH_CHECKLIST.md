# BillZo PWA — UI Polish Checklist

Reference for the PWA polish sprint. Enforce these rules on the scoped pages
(Dashboard, Recovery, POS, Reports, Parties). Re-check after any UI change.

## Global mobile rules
- [ ] **No horizontal scroll** — guarded globally via `overflow-x: hidden` on `html, body`
  (`src/app/globals.css`). Spot-check scrollable areas (tables, carousels, chip rows) for
  inner horizontal overflow that the body rule hides but that still clips content.
- [ ] **Body text ≥ 14px** — never ship `text-xs`/`text-[…]px` below 14px for readable prose
  (labels may be 13–14px; see Reports).
- [ ] **Tap targets ≥ 44px** — interactive elements use `h-11` (44px) or equivalent. Inline
  "ghost" actions (delete, unpin) may be smaller only when padded.
- [ ] **Safe area respected** — `viewport-fit=cover` is set in
  `src/app/layout.tsx` so `env(safe-area-inset-*)` works on iOS Safari.
- [ ] **Bottom nav never overlaps content** — `.bz-main` has `padding-bottom: 104px` on
  mobile (`src/styles/app-shell.css`). Confirm new pages use the AppShell or add the same
  bottom padding.
- [ ] **No nested `min-h-screen`** inside the AppShell scroll container.
- [ ] **Tap targets sized by tap**, not just hit-slop — verify on 360px width.

## Spacing tokens
- Card padding: `p-4`
- Section gap: `gap-4`
- Page gap: `gap-6`
- Hero gap: `gap-8`
- Do NOT use `gap-3` or `gap-5` in new/edited scoped layouts.

## Recovery `.rc-summary`
- 2 columns on phones AND tablet (< 1024px).
- 4 columns at `≥ 1024px`.
- `--amt` item spans the full row at every breakpoint.
- Defined in `src/styles/recovery-center.css`.

## Reports (`src/app/(app)/reports/page.tsx`)
- Numbers (metric values): 28–36px (`text-[28px] lg:text-[32px]`).
- Labels: 13–14px.
- Body/label minimum 14px, never below.
- Buttons: 15–16px.
- No size 8/9px text remains.

## Emoji → icons
- Replace colorful pictographic emoji (⚠ ⭐ 🔥 🎉 🛒 📱 📌 📝 ✕ ✅) with matching
  Lucide icons.
- Keep typographic glyphs (₹ ✓ ● → = "x").
- "✓ Connected" context → `BadgeCheck`.

## Back navigation
- Use the shared `BackLink` from `src/components/billzo/PageShell.tsx`.
- Applied pages: `/recovery/queue`, `/recovery/history`, `/udhar`, `/purchases`,
  `/send`, `/recovery/readiness`, `/sales`.
- Orphan/placeholder pages (`/send`) also emit
  `analytics.track("placeholder_page_opened", { page })`.

## Mobile QA widths
Test at: **360px, 390px, 430px, and tablet (~768px)**.