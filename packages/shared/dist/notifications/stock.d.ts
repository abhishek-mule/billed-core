import type { ProductAlertState } from './types';
export declare function getStockStatus(stock: number, threshold: number): ProductAlertState;
export declare function isStockTransition(prev: ProductAlertState, next: ProductAlertState): boolean;
export declare const STOCK_ALERT_ORDER: ProductAlertState[];
//# sourceMappingURL=stock.d.ts.map