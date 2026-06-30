"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCashPosition = buildCashPosition;
function buildCashPosition(input, _context) {
    return {
        outstanding: input.outstanding,
        collectedToday: input.collectedToday,
        expectedToday: input.dueToday,
        customerCount: input.customerCount,
    };
}
//# sourceMappingURL=buildCashPosition.js.map