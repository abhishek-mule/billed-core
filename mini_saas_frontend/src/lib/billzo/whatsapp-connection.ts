import { db, uuid } from './db'

export interface WhatsAppConnection {
  id: string
  tenantId: string
  wabaId: string
  phoneNumberId: string
  displayName: string
  provider: 'gupshup'
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  errorMessage?: string
  accessToken?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
  lastTestAt?: string
}

export interface WhatsAppConnectionCreate {
  tenantId: string
  wabaId: string
  phoneNumberId: string
  displayName: string
  accessToken?: string
  expiresAt?: string
}

export async function createWhatsAppConnection(
  data: WhatsAppConnectionCreate
): Promise<WhatsAppConnection> {
  const now = new Date().toISOString()
  const connection: WhatsAppConnection = {
    id: uuid(),
    tenantId: data.tenantId,
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
    displayName: data.displayName,
    provider: 'gupshup',
    connectionStatus: 'connecting',
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    createdAt: now,
    updatedAt: now,
  }
  await db().whatsappConnections.add(connection)
  return connection
}

export async function getWhatsAppConnectionByTenant(
  tenantId: string
): Promise<WhatsAppConnection | null> {
  return (await db().whatsappConnections
    .where('tenantId')
    .equals(tenantId)
    .first()) ?? null
}

export async function getWhatsAppConnectionByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppConnection | null> {
  return (await db().whatsappConnections
    .where('phoneNumberId')
    .equals(phoneNumberId)
    .first()) ?? null
}

export async function updateWhatsAppConnection(
  id: string,
  updates: Partial<WhatsAppConnection>
): Promise<void> {
  await db().whatsappConnections.update(id, {
    ...updates,
    updatedAt: new Date().toISOString(),
  })
}

export async function setWhatsAppConnectionStatus(
  id: string,
  status: WhatsAppConnection['connectionStatus'],
  errorMessage?: string
): Promise<void> {
  await updateWhatsAppConnection(id, { connectionStatus: status, errorMessage })
}

export async function listWhatsAppConnectionsByTenant(
  tenantId: string
): Promise<WhatsAppConnection[]> {
  return db().whatsappConnections
    .where('tenantId')
    .equals(tenantId)
    .toArray()
}