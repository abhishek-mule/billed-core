import type { CashPosition, WorkContext } from './types'

export interface FinancialInput {
  outstanding: number
  collectedToday: number
  dueToday: number
  customerCount: number
}

export function buildCashPosition(input: FinancialInput, _context: WorkContext): CashPosition {
  return {
    outstanding: input.outstanding,
    collectedToday: input.collectedToday,
    expectedToday: input.dueToday,
    customerCount: input.customerCount,
  }
}