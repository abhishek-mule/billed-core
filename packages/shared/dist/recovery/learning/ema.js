"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEMA = computeEMA;
exports.computeEMASeries = computeEMASeries;
exports.computeDecayedCount = computeDecayedCount;
function computeEMA(values, alpha = 0.3) {
    if (values.length === 0)
        return 0;
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
        ema = alpha * values[i] + (1 - alpha) * ema;
    }
    return ema;
}
function computeEMASeries(values, alpha = 0.3) {
    if (values.length === 0)
        return [];
    const series = [values[0]];
    for (let i = 1; i < values.length; i++) {
        series.push(alpha * values[i] + (1 - alpha) * series[i - 1]);
    }
    return series;
}
function computeDecayedCount(eventTimestamps, halfLifeDays = 30) {
    if (eventTimestamps.length === 0)
        return 0;
    const now = Date.now();
    const halfLifeMs = halfLifeDays * 24 * 3600 * 1000;
    return eventTimestamps.reduce((sum, ts) => {
        const age = now - ts;
        return sum + Math.pow(0.5, age / halfLifeMs);
    }, 0);
}
//# sourceMappingURL=ema.js.map