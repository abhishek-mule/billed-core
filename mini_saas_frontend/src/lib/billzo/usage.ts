import { db } from '@/lib/billzo/db'
import { FREE_LIMITS } from './plan-limits'

export interface UsageLimits {
  invoiceLimit: number
  reminderLimit: number
  isPaid: boolean
  canCreateInvoice: boolean
  canSendReminder: boolean
  currentInvoiceCount: number
  currentReminderCount: number
}

export async function getUsageLimits(tenantId: string): Promise<UsageLimits> {
  const tenant = await db().tenants.get(tenantId)
  const isPaid = !!(tenant?.plan === 'pro' || tenant?.paywallUnlocked)
  const invoiceCount = tenant?.invoiceCount || 0
  const reminderCount = tenant?.reminderCount || 0
  const invoiceLimit = isPaid ? Infinity : FREE_LIMITS.invoices
  const reminderLimit = isPaid ? Infinity : FREE_LIMITS.reminders

  return {
    invoiceLimit,
    reminderLimit,
    isPaid,
    canCreateInvoice: isPaid || invoiceCount < FREE_LIMITS.invoices,
    canSendReminder: isPaid || reminderCount < FREE_LIMITS.reminders,
    currentInvoiceCount: invoiceCount,
    currentReminderCount: reminderCount,
  }
}

export async function incrementInvoiceCount(tenantId: string): Promise<UsageLimits> {
  const tenant = await db().tenants.get(tenantId)
  if (!tenant) throw new Error('Tenant not found')

  const newCount = (tenant.invoiceCount || 0) + 1
  await db().tenants.update(tenantId, {
    invoiceCount: newCount,
    updatedAt: new Date().toISOString(),
  })

  return getUsageLimits(tenantId)
}

export async function incrementReminderCount(tenantId: string): Promise<UsageLimits> {
  const tenant = await db().tenants.get(tenantId)
  if (!tenant) throw new Error('Tenant not found')

  const newCount = (tenant.reminderCount || 0) + 1
  await db().tenants.update(tenantId, {
    reminderCount: newCount,
    updatedAt: new Date().toISOString(),
  })

  return getUsageLimits(tenantId)
}

export async function upgradeToPro(tenantId: string): Promise<void> {
  await db().tenants.update(tenantId, {
    plan: 'pro',
    paywallUnlocked: true,
    updatedAt: new Date().toISOString(),
  })
}