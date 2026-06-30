import type { CashPosition, WorkContext } from './types';
export interface FinancialInput {
    outstanding: number;
    collectedToday: number;
    dueToday: number;
    customerCount: number;
}
export declare function buildCashPosition(input: FinancialInput, _context: WorkContext): CashPosition;
//# sourceMappingURL=buildCashPosition.d.ts.map