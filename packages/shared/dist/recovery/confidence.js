"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFieldConfidence = computeFieldConfidence;
exports.computeOverallConfidence = computeOverallConfidence;
exports.classifyConfidence = classifyConfidence;
const DEFAULT_CONFIDENCE_CONFIG = {
    minimumSamples: 5,
    highThreshold: 0.8,
    mediumThreshold: 0.5,
};
function computeFieldConfidence(sampleCount, variance, config = DEFAULT_CONFIDENCE_CONFIG) {
    if (sampleCount < config.minimumSamples) {
        return sampleCount / config.minimumSamples * 0.3;
    }
    const sizeFactor = 1 - Math.exp(-sampleCount / 20);
    const varianceFactor = 1 - Math.min(variance, 1);
    return Math.min(1, Math.max(0, sizeFactor * 0.6 + varianceFactor * 0.4));
}
function computeOverallConfidence(fieldConfidences) {
    const values = Object.values(fieldConfidences);
    if (values.length === 0)
        return 0;
    return values.reduce((min, v) => Math.min(min, v), 1);
}
function classifyConfidence(score, config = DEFAULT_CONFIDENCE_CONFIG) {
    if (score >= config.highThreshold)
        return 'high';
    if (score >= config.mediumThreshold)
        return 'medium';
    return 'low';
}
//# sourceMappingURL=confidence.js.map