"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTemporalFeatures = extractTemporalFeatures;
const histograms_1 = require("../histograms");
function findPeakBucket(dist) {
    let maxIdx = 0;
    for (let i = 1; i < dist.length; i++) {
        if (dist[i] > dist[maxIdx])
            maxIdx = i;
    }
    return maxIdx;
}
function findSalaryWeekBias(weekDist) {
    const lastIdx = weekDist.length - 1;
    const peak = findPeakBucket(weekDist);
    if (peak === lastIdx)
        return 'last';
    if (peak === 0)
        return 'first';
    if (peak === 1)
        return 'second';
    return 'none';
}
function detectWeekendBias(dayDist) {
    const weekend = dayDist[0] + dayDist[6];
    const weekday = dayDist.slice(1, 6).reduce((s, v) => s + v, 0);
    if (weekend > weekday * 1.2)
        return 'prefers_weekend';
    if (weekday > weekend * 1.2)
        return 'avoids_weekend';
    return 'none';
}
function detectMonthEnd(monthDist) {
    const peak = findPeakBucket(monthDist);
    return peak === 11 || peak === 0 || peak === 3;
}
function findPreferredHourRange(hourDist) {
    const peak = findPeakBucket(hourDist);
    const start = Math.max(0, peak - 1);
    const end = Math.min(23, peak + 1);
    return { start, end };
}
function extractTemporalFeatures(events) {
    const paymentEvents = events.filter(e => e.type === 'payment_received' || e.type === 'partial_payment');
    const histograms = (0, histograms_1.buildMultiResolutionTemporal)(paymentEvents.length > 0 ? paymentEvents : events);
    return {
        histograms,
        preferredDayOfWeek: findPeakBucket(histograms.dayOfWeek),
        preferredHourRange: findPreferredHourRange(histograms.hourOfDay),
        salaryWeekBias: findSalaryWeekBias(histograms.weekOfMonth),
        monthEndBias: detectMonthEnd(histograms.month),
        weekendBias: detectWeekendBias(histograms.dayOfWeek),
    };
}
//# sourceMappingURL=temporal.js.map