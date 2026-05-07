import { db } from '@/lib/billzo/db'

const FREE_INVOICE_LIMIT = 3
const FREE_REMINDER_LIMIT = 10

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
  
  if (!tenant) {
    return {
      invoiceLimit: FREE_INVOICE_LIMIT,
      reminderLimit: FREE_REMINDER_LIMIT,
      isPaid: false,
      canCreateInvoice: true,
      canSendReminder: true,
      currentInvoiceCount: 0,
      currentReminderCount: 0,
    }
  }

  const isPaid = tenant.plan === 'pro' || tenant.paywallUnlocked
  const invoiceCount = tenant.invoiceCount || 0
  const reminderCount = tenant.reminderCount || 0

  return {
    invoiceLimit: isPaid ? Infinity : FREE_INVOICE_LIMIT,
    reminderLimit: isPaid ? Infinity : FREE_REMINDER_LIMIT,
    isPaid,
    canCreateInvoice: isPaid || invoiceCount < FREE_INVOICE_LIMIT,
    canSendReminder: isPaid || reminderCount < FREE_REMINDER_LIMIT,
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