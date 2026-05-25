'use client'

import Dexie, { type Table } from 'dexie'
import type { ScanTelemetryEvent } from './scan-types'

class ScanTelemetryDB extends Dexie {
  telemetry!: Table<ScanTelemetryEvent, string>

  constructor() {
    super('billzo_scan_telemetry_v1')
    this.version(1).stores({
      telemetry: 'id, tenantId, vendorName, receiptType, preprocessRecipe, fieldType, trustState, outcome, metricName, createdAt',
    })
  }
}

let instance: ScanTelemetryDB | null = null

function getDB() {
  if (!instance) instance = new ScanTelemetryDB()
  return instance
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function logScanTelemetry(event: Omit<ScanTelemetryEvent, 'id' | 'createdAt'>) {
  await getDB().telemetry.add({
    id: makeId(),
    createdAt: new Date().toISOString(),
    ...event,
  })
}

export async function getScanTelemetrySummary(tenantId: string) {
  const rows = await getDB().telemetry.where('tenantId').equals(tenantId).toArray()
  return {
    totalEvents: rows.length,
    failures: rows.filter((row) => row.outcome === 'failure').length,
    edits: rows.filter((row) => row.outcome === 'edited').length,
  }
}
