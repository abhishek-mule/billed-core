import type { FinancialInput } from '../work-engine/buildCashPosition'

export type LoadFinancialSummary = () => Promise<FinancialInput>
