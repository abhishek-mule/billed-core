import { queryOne } from '@/lib/db/client'

export async function getDbTimestamp(): Promise<Date> {
  const result = await queryOne<{ now: Date }>(
    'SELECT NOW() as now'
  )
  return result?.now || new Date()
}

export function toDbTimestamp(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Date(d.toISOString())
}

export async function getCurrentFinancialYearStart(): Promise<Date> {
  const now = await getDbTimestamp()
  const year = now.getFullYear()
  const month = now.getMonth()
  
  const fyStart = month >= 3 
    ? new Date(year, 3, 1)
    : new Date(year - 1, 3, 1)
  
  return fyStart
}

export async function getGSTFilingPeriod(dbNow?: Date): Promise<{ month: number; year: number }> {
  const now = dbNow || await getDbTimestamp()
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  }
}

export function generateTimestampForStorage(): Date {
  return new Date(Date.now())
}