/**
 * Canonical Days Overdue Calculation — Single Source of Truth
 * 
 * This is the ONLY function that should calculate days overdue across the entire codebase.
 * All surfaces (recovery queue, customer workspace, dashboard, invoices) must use this.
 * 
 * Formula: max(0, floor((now - dueDate) / 86400000))
 * - If dueDate is in the future: 0
 * - If dueDate is today: 0
 * - If dueDate was yesterday: 1
 * - If dueDate is null/undefined: 0 (not overdue)
 */

export function calculateDaysOverdue(dueDate: string | Date | null | undefined): number {
  if (!dueDate) return 0
  
  const due = new Date(dueDate)
  if (isNaN(due.getTime())) return 0
  
  const now = new Date()
  // Reset time to start of day for accurate day comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  
  const diffMs = todayStart.getTime() - dueStart.getTime()
  const daysOverdue = Math.floor(diffMs / 86400000)
  
  return Math.max(0, daysOverdue)
}

/**
 * Batch calculate days overdue for multiple due dates
 */
export function calculateDaysOverdueBatch(dueDates: (string | Date | null | undefined)[]): number[] {
  return dueDates.map(calculateDaysOverdue)
}

/**
 * Check if an invoice/customer is overdue
 */
export function isOverdue(dueDate: string | Date | null | undefined): boolean {
  return calculateDaysOverdue(dueDate) > 0
}

/**
 * Get human-readable overdue description
 */
export function describeOverdue(dueDate: string | Date | null | undefined): string {
  const days = calculateDaysOverdue(dueDate)
  if (days === 0) return "Due today"
  if (days === 1) return "1 day overdue"
  return `${days} days overdue`
}