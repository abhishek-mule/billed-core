"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DRIFT_CONFIG = void 0;
exports.detectHistogramDrift = detectHistogramDrift;
const histograms_1 = require("../histograms");
exports.DEFAULT_DRIFT_CONFIG = {
    warningThreshold: 0.12,
    criticalThreshold: 0.25,
    minimumSamples: 20,
};
function detectHistogramDrift(current, historical, fieldNames, config = exports.DEFAULT_DRIFT_CONFIG) {
    const changedFields = [];
    let maxDivergence = 0;
    for (let i = 0; i < current.length; i++) {
        if (current[i].length !== historical[i]?.length) {
            changedFields.push(fieldNames[i] || `field_${i}`);
            continue;
        }
        const divergence = (0, histograms_1.jsDivergence)(current[i], historical[i]);
        if (divergence > config.warningThreshold) {
            changedFields.push(fieldNames[i] || `field_${i}`);
        }
        maxDivergence = Math.max(maxDivergence, divergence);
    }
    const hasDrifted = changedFields.length > 0;
    let severity = 'none';
    if (maxDivergence >= config.criticalThreshold) {
        severity = 'critical';
    }
    else if (maxDivergence >= config.warningThreshold) {
        severity = 'warning';
    }
    return {
        hasDrifted,
        severity,
        divergence: maxDivergence,
        changedFields,
        detectedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=drift.js.map