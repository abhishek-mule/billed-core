"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hmacSignEnvelope = hmacSignEnvelope;
exports.hmacVerify = hmacVerify;
exports.hmacSignHttp = hmacSignHttp;
const crypto_1 = __importDefault(require("crypto"));
const canonicalize_1 = require("./canonicalize");
const ALGORITHM = 'sha256';
function hmacSignEnvelope(envelope, secret) {
    const payload = [
        envelope.intentId,
        envelope.timestamp,
        envelope.nonce,
        (0, canonicalize_1.canonicalJson)(envelope.payload),
    ].join('\n');
    return crypto_1.default.createHmac(ALGORITHM, secret).update(payload).digest('hex');
}
function hmacVerify(envelope, secret) {
    const { signature, ...rest } = envelope;
    const expected = hmacSignEnvelope(rest, secret);
    if (expected.length !== signature.length)
        return false;
    return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
function hmacSignHttp(method, path, timestamp, nonce, body, secret) {
    const payload = [method, path, timestamp, nonce, body].join('\n');
    return crypto_1.default.createHmac(ALGORITHM, secret).update(payload).digest('hex');
}
//# sourceMappingURL=signing.js.map