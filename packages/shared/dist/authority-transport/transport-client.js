"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitAuthorityIntent = submitAuthorityIntent;
const crypto_1 = __importDefault(require("crypto"));
class TransportError extends Error {
    constructor(message, statusCode, body) {
        super(message);
        this.statusCode = statusCode;
        this.body = body;
        this.name = 'TransportError';
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function computeHmac(secret, method, path, timestamp, nonce, rawBody) {
    const payload = [method, path, timestamp, nonce, rawBody].join('\n');
    return crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
}
async function submitAuthorityIntent(config, intent, source) {
    const nonce = crypto_1.default.randomUUID();
    const timestamp = new Date().toISOString();
    const intentId = crypto_1.default.randomUUID();
    const gatewayUrl = config.gatewayUrl;
    const timeoutMs = config.transportTimeoutMs;
    const retryCount = config.transportRetryCount;
    const retryBaseMs = config.transportRetryBaseMs;
    const secret = config.hmacSecrets[source];
    if (!secret) {
        return {
            accepted: false,
            intentId,
            decisionId: null,
            error: `No HMAC secret configured for source: ${source}`,
        };
    }
    const envelope = {
        intentId,
        intentType: intent.intentType,
        intentVersion: intent.intentVersion ?? 1,
        tenantId: intent.tenantId,
        actor: intent.actor,
        source,
        timestamp,
        causationId: null,
        correlationId: null,
        payload: intent.payload,
        nonce,
    };
    const rawBody = JSON.stringify(envelope);
    const path = '/api/v1/authority/evaluate';
    const signature = computeHmac(secret, 'POST', path, timestamp, nonce, rawBody);
    const signedBody = JSON.stringify({ ...envelope, signature });
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
            const result = await sendWithTimeout(gatewayUrl, path, signedBody, timeoutMs);
            return result;
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (!isRetryableError(err) || attempt >= retryCount)
                break;
            await sleep(retryBaseMs * Math.pow(2, attempt));
        }
    }
    return {
        accepted: false,
        intentId,
        decisionId: null,
        error: `Transport failure after ${retryCount + 1} attempts: ${lastError?.message}`,
    };
}
async function sendWithTimeout(baseUrl, path, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
        });
        const text = await response.text();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new TransportError(`Invalid JSON response (${response.status})`, response.status, text);
        }
        if (!response.ok && response.status !== 403 && response.status !== 409 && response.status !== 422) {
            throw new TransportError(`Gateway returned ${response.status}`, response.status, text);
        }
        return parsed;
    }
    finally {
        clearTimeout(timer);
    }
}
function isRetryableError(err) {
    if (err instanceof TransportError) {
        const code = err.statusCode;
        if (code === undefined)
            return true;
        if (code >= 500)
            return true;
        return false;
    }
    if (err instanceof DOMException && err.name === 'AbortError')
        return true;
    if (err instanceof TypeError)
        return true;
    return false;
}
//# sourceMappingURL=transport-client.js.map