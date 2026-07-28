// authority:exempt ephemeral_operational_state — Business-hours slot aligner

/**
 * Preferred time windows per customer tier, within the 09:00–20:00 window.
 * Merchants can override these via settings; these are reasonable defaults.
 */
export const TIER_WINDOWS: Record<string, { start: string; end: string } | null> = {
  retail:      { start: '09:30', end: '11:00' },
  wholesale:   { start: '10:00', end: '13:00' },
  distributor: { start: '11:00', end: '16:00' },
  defaulter:   { start: '17:00', end: '19:00' },
  vip:         { start: '10:00', end: '14:00' },
}

export interface OperatingHours {
  startTime: string  // "HH:MM" in IST
  endTime: string    // "HH:MM" in IST
  skipWeekends: boolean
}

export const DEFAULTS: OperatingHours = {
  startTime: '09:00',
  endTime: '20:00',
  skipWeekends: true,
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hour: h, minute: m }
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 // Sunday only; Saturday is a business day in India
}

function cloneDate(d: Date): Date {
  return new Date(d.getTime())
}

/** Return the start-of-day (opening time) for the given date in IST. */
function startOfDayInIST(d: Date, startTime: string): Date {
  const { hour, minute } = parseTime(startTime)
  // Work in IST
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
  ist.setUTCHours(hour, minute, 0, 0)
  return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000)
}

/** Check if a UTC date falls within the IST business-hours window. */
function isInWindow(d: Date, hours: OperatingHours): boolean {
  if (hours.skipWeekends && isWeekend(d)) return false
  // Night (10 PM – 8 AM) is never a valid slot regardless of config
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000
  const ist = new Date(istMs)
  const minutesSinceMidnight = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  if (minutesSinceMidnight < 8 * 60 || minutesSinceMidnight >= 22 * 60) return false
  const { hour: startH, minute: startM } = parseTime(hours.startTime)
  const { hour: endH, minute: endM } = parseTime(hours.endTime)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  return minutesSinceMidnight >= startMinutes && minutesSinceMidnight < endMinutes
}

/**
 * Pick the effective time window for a customer tier.
 * Falls back to the merchant-wide operating hours if no tier-specific window exists.
 */
function resolveWindow(tier: string | undefined | null, hours: OperatingHours): { start: string; end: string } {
  if (tier && TIER_WINDOWS[tier]) return TIER_WINDOWS[tier]!
  return { start: hours.startTime, end: hours.endTime }
}

/**
 * Return the next valid IST business-hours timestamp ≥ `candidate`.
 *
 * If `customerTier` is provided, the slot is biased toward the tier's
 * preferred window (e.g., retail → 9:30‑11:00, defaulter → 17:00‑19:00)
 * while staying within the merchant's overall operating hours.
 *
 * - If candidate falls within today's window → return candidate unchanged.
 * - If candidate falls before today's window → return today's opening.
 * - If candidate falls after today's window (or on a skipped day) → return
 *   the next business day's opening.
 */
export function nextBusinessSlot(
  candidate: Date,
  hours: OperatingHours = DEFAULTS,
  customerTier?: string,
): Date {
  const window = resolveWindow(customerTier, hours)

  if (isInWindow(candidate, hours)) {
    // If within overall hours, also check tier preference
    if (!customerTier || !TIER_WINDOWS[customerTier]) return cloneDate(candidate)
    const { hour, minute } = parseTime(window.start)
    const startMins = hour * 60 + minute
    const candMs = candidate.getTime() + 5.5 * 60 * 60 * 1000
    const candIst = new Date(candMs)
    const candMins = candIst.getUTCHours() * 60 + candIst.getUTCMinutes()
    // If candidate is already at or after the tier's start time, use it as-is
    if (candMins >= startMins) return cloneDate(candidate)
    // Otherwise, clamp up to the tier's start time
    const adjusted = new Date(candMs)
    adjusted.setUTCHours(hour, minute, 0, 0)
    return new Date(adjusted.getTime() - 5.5 * 60 * 60 * 1000)
  }

  let test = cloneDate(candidate)
  // Clamp to today's opening (using tier window start if available, otherwise merchant start)
  const todayOpen = startOfDayInIST(candidate, window.start)
  if (test.getTime() < todayOpen.getTime()) {
    test = todayOpen
    if (isInWindow(test, hours)) return test
  }

  // Advance day by day until we find a valid slot
  const oneDay = 24 * 60 * 60 * 1000
  for (let i = 0; i < 14; i++) {
    test = new Date(test.getTime() + oneDay)
    const open = startOfDayInIST(test, window.start)
    test = open
    if (isInWindow(test, hours)) return test
  }

  // Fallback — return the original candidate (should not normally happen)
  return cloneDate(candidate)
}

/**
 * Format a scheduled timestamp for display.
 *
 * Rules:
 * - If within the next 60 min → "In ~N min"
 * - If today → "Today • HH:MM AM/PM"
 * - If tomorrow → "Tomorrow • HH:MM AM/PM"
 * - If within 7 days → "Mon • HH:MM AM/PM"
 * - Otherwise → "28 Jul • HH:MM AM/PM"
 */
export function formatScheduledSlot(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000

  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })

  // Within the next 60 minutes (but still in the future)
  if (diffMs > 0 && diffMs < 60 * 60 * 1000) {
    const min = Math.round(diffMs / 60000)
    return `In ~${min} min`
  }

  if (d.getTime() >= startOfToday && d.getTime() < startOfTomorrow) {
    return `Today • ${timeStr}`
  }
  if (d.getTime() >= startOfTomorrow && d.getTime() < startOfTomorrow + 24 * 60 * 60 * 1000) {
    return `Tomorrow • ${timeStr}`
  }

  const dayName = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })
  return `${dayName} • ${timeStr}`
}
