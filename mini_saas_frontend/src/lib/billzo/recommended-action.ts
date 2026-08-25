/**
 * Recommended Action Engine — Clear actionable guidance for merchants
 * 
 * This replaces the opaque "70% chance" with clear:
 * - Recommended Action (what to do)
 * - Why (explanation)
 * - Alternative action (what else could be done)
 * 
 * Based on: overdue days, broken promises, ignored reminders, promises, phone availability, delivery status
 */

export interface RecommendedAction {
  action: 'call' | 'whatsapp' | 'record_payment' | 'promise' | 'open_customer' | 'none'
  label: string
  reason: string
  alternative?: {
    action: 'call' | 'whatsapp' | 'record_payment' | 'promise' | 'open_customer'
    label: string
  }
  urgency: 'high' | 'medium' | 'low'
  color: 'red' | 'orange' | 'blue' | 'green'
}

interface RecommendedActionInput {
  /** Days overdue (0 = due today, negative = not yet due) */
  overdueDays: number
  /** Number of broken promises */
  brokenPromises: number
  /** Number of ignored reminders */
  ignoredReminders: number
  /** Has active promise to pay */
  hasActivePromise: boolean
  /** Days until promise is due (negative = overdue) */
  promiseDueDays?: number
  /** Has a usable phone number for WhatsApp */
  hasPhone: boolean
  /** Most advanced WhatsApp delivery status */
  maxDeliveryStatus?: 'sent' | 'delivered' | 'read' | null
  /** Customer has paid (fully or partially) */
  isPaid?: boolean
  /** Last payment date */
  lastPaymentAt?: string | null
  /** Whether there's an active promise */
  hasActivePromiseDate?: boolean
  /** Promise due date */
  promiseToPayDate?: string | null
  /** Customer tier */
  customerTier?: string | null
  /** Overdue amount */
  overdueAmount?: number
}

/**
 * Get the recommended action with clear reasoning
 * 
 * Priority order:
 * 1. Paid -> No action needed
 * 2. No phone -> Add number (blocker)
 * 3. Broken promises -> Call (high urgency)
 * 4. Active promise overdue -> Call
 * 4. Active promise due today -> Call
 * 5. Active promise upcoming -> WhatsApp reminder
 * 5. Overdue > 30 days -> Call
 * 6. Overdue > 15 days -> Call
 * 6. Overdue > 7 days -> Call or WhatsApp based on delivery status
 * 7. Overdue <= 7 days -> WhatsApp
 * 8. Not overdue -> Wait
 */
export function getRecommendedAction(input: RecommendedActionInput): RecommendedAction {
  const {
    overdueDays,
    brokenPromises,
    ignoredReminders,
    hasActivePromise,
    promiseDueDays,
    hasPhone,
    maxDeliveryStatus,
    isPaid,
    lastPaymentAt,
    hasActivePromiseDate,
    promiseToPayDate,
    customerTier,
    overdueAmount = 0,
  } = input

  // 1. Paid - no action needed
  if (input.isPaid) {
    return {
      action: 'none' as const,
      label: 'All clear',
      reason: 'Customer has paid in full',
      urgency: 'low' as const,
      color: 'green' as const,
    }
  }

  // No phone - blocker, must add number first
  if (!input.hasPhone) {
    return {
      action: 'open_customer' as const,
      label: 'Add Phone Number',
      reason: 'WhatsApp automation requires a phone number. Add the customer\'s WhatsApp number to enable automated reminders.',
      alternative: {
        action: 'call' as const,
        label: 'Call Manually'
      },
      urgency: 'high',
      color: 'red',
    }
  }

  // Broken promises - highest urgency, call immediately
  if (brokenPromises > 0) {
    return {
      action: 'call',
      label: 'Call Today',
      reason: `Customer has ${brokenPromises} broken promise${brokenPromises > 1 ? 's' : ''}. Direct conversation needed to re-establish commitment.`,
      alternative: {
        action: 'whatsapp',
        label: 'Send WhatsApp'
      },
      urgency: 'high',
      color: 'red',
    }
  }

  // Active promise - check if overdue or due today
  if (hasActivePromise || (promiseToPayDate && new Date(promiseToPayDate) >= new Date())) {
    const daysUntilPromise = promiseToPayDate 
      ? Math.ceil((new Date(promiseToPayDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0
    
    if (daysUntilPromise <= 0) {
      // Promise overdue or due today - call
      return {
        action: 'call',
        label: 'Call Today',
        reason: 'Customer promised to pay and the date has passed or is today. Direct follow-up needed.',
        alternative: {
          action: 'whatsapp',
          label: 'Send WhatsApp'
        },
        urgency: 'high',
        color: 'red',
      }
    } else if (daysUntilPromise <= 3) {
      // Promise coming up soon - WhatsApp reminder
      return {
        action: 'whatsapp',
        label: 'Send WhatsApp',
        reason: `Customer promised to pay in ${daysUntilPromise} day${daysUntilPromise > 1 ? 's' : ''}. Send a gentle reminder.`,
        alternative: {
          action: 'call',
          label: 'Call Instead'
        },
        urgency: 'medium',
        color: 'blue',
      }
    } else {
      // Promise in future - wait or gentle WhatsApp
      return {
        action: 'whatsapp',
        label: 'Send WhatsApp',
        reason: `Customer promised to pay in ${daysUntilPromise} days. Gentle reminder to keep commitment top of mind.`,
        alternative: {
          action: 'call',
          label: 'Call Instead'
        },
        urgency: 'low',
        color: 'blue',
      }
    }
  }

  // Overdue > 30 days - Critical, call
  if (overdueDays > 30) {
    return {
      action: 'call',
      label: 'Call Today',
      reason: `${overdueDays} days overdue. Long overdue accounts need direct conversation to understand blockers and secure commitment.`,
      alternative: {
        action: 'whatsapp',
        label: 'Send WhatsApp'
      },
      urgency: 'high',
      color: 'red',
    }
  }

  // Overdue 15-30 days - Urgent, call preferred
  if (overdueDays > 15) {
    return {
      action: 'call',
      label: 'Call Today',
      reason: `${overdueDays} days overdue. Customer has not responded to previous attempts. Direct conversation needed.`,
      alternative: {
        action: 'whatsapp',
        label: 'Send WhatsApp'
      },
      urgency: 'high',
      color: 'orange',
    }
  }

  // Overdue 8-15 days - Attention needed, call preferred but WhatsApp OK
  if (overdueDays > 7) {
    // If WhatsApp was read but ignored, escalate to call
    if (['read'].includes(input.maxDeliveryStatus || '') && (input.ignoredReminders || 0) >= 2) {
      return {
        action: 'call',
        label: 'Call Today',
        reason: `Customer read ${input.ignoredReminders || 'multiple'} reminders but hasn't responded. Direct conversation needed.`,
        alternative: {
          action: 'whatsapp',
          label: 'Send WhatsApp'
        },
        urgency: 'high',
        color: 'orange',
      }
    }
    // Otherwise call preferred for overdue > 7 days
    return {
      action: 'call',
      label: 'Call Today',
      reason: `${overdueDays} days overdue. Customer hasn't responded to reminders. Direct conversation recommended.`,
      alternative: {
        action: 'whatsapp',
        label: 'Send WhatsApp'
      },
      urgency: 'medium',
      color: 'orange',
    }
  }

  // Overdue 1-7 days - Send WhatsApp reminder
  if (overdueDays > 0) {
    // If WhatsApp was read but no response, escalate
    if (input.maxDeliveryStatus === 'read' && (input.ignoredReminders || 0) >= 1) {
      return {
        action: 'call',
        label: 'Call Today',
        reason: `Customer read the reminder but hasn't responded. Direct follow-up needed.`,
        alternative: {
          action: 'whatsapp',
          label: 'Send WhatsApp'
        },
        urgency: 'medium',
        color: 'orange',
      }
    }
    // Otherwise WhatsApp reminder
    return {
      action: 'whatsapp',
      label: 'Send WhatsApp',
      reason: `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue. Gentle reminder to prompt payment.`,
      alternative: {
        action: 'call',
        label: 'Call Instead'
      },
      urgency: 'medium',
      color: 'blue',
    }
  }

  // Not overdue yet - no immediate action needed
  return {
    action: 'none',
    label: 'No action needed',
    reason: 'Payment not yet due. Will appear in queue when overdue.',
    urgency: 'low',
    color: 'green',
  }
}

/**
 * Get color classes for the recommended action
 */
export function getActionColorClasses(color: 'red' | 'orange' | 'blue' | 'green') {
  const classes: Record<string, { badge: string; bg: string; text: string; button: string }> = {
    red: {
      badge: 'bg-danger-soft text-danger border-danger/30',
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    orange: {
      badge: 'bg-warning-soft text-warning border-warning/30',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    blue: {
      badge: 'bg-primary-soft text-primary border-primary/30',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    green: {
      badge: 'bg-success-soft text-success border-success/30',
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      button: 'bg-green-600 hover:bg-green-700 text-white',
    },
  }
  return classes[color] || classes.blue
}

/**
 * Get action button label
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    call: 'Call',
    whatsapp: 'Send WhatsApp',
    record_payment: 'Record Payment',
    promise: 'Record Promise',
    open_customer: 'Add Number',
    none: 'All Clear',
  }
  return labels[action] || action
}