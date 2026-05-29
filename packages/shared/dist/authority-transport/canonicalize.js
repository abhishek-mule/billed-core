"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanonicalJsonError = exports.CANONICAL_JSON_VERSION = void 0;
exports.canonicalJson = canonicalJson;
exports.CANONICAL_JSON_VERSION = 1;
function canonicalJson(input) {
    const cleaned = clean(input);
    return jsonStringifySorted(cleaned);
}
function clean(input) {
    if (input === null)
        return null;
    if (input === undefined)
        return undefined;
    if (typeof input === 'boolean')
        return input;
    if (typeof input === 'string')
        return input.normalize('NFC');
    if (typeof input === 'number') {
        if (!Number.isFinite(input)) {
            throw new CanonicalJsonError(`Cannot serialize non-finite number: ${input}`);
        }
        return input;
    }
    if (typeof input === 'bigint') {
        throw new CanonicalJsonError('Cannot serialize BigInt values');
    }
    if (input instanceof Date)
        return input.toISOString();
    if (Array.isArray(input)) {
        const result = [];
        for (const item of input) {
            const cleaned = clean(item);
            if (cleaned !== undefined)
                result.push(cleaned);
        }
        return result;
    }
    if (typeof input === 'object') {
        const obj = {};
        const keys = Object.keys(input).sort();
        for (const key of keys) {
            const val = input[key];
            const cleaned = clean(val);
            if (cleaned !== undefined)
                obj[key] = cleaned;
        }
        return obj;
    }
    throw new CanonicalJsonError(`Cannot serialize value of type ${typeof input}`);
}
function jsonStringifySorted(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'boolean')
        return String(value);
    if (typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 0 && value <= 9007199254740991) {
            return value.toString();
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = value.map(jsonStringifySorted).join(',');
        return `[${items}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const pairs = keys.map((k) => {
            const v = value[k];
            return `${JSON.stringify(k)}:${jsonStringifySorted(v)}`;
        });
        return `{${pairs.join(',')}}`;
    }
    throw new CanonicalJsonError(`Cannot stringify: ${typeof value}`);
}
class CanonicalJsonError extends Error {
    constructor(message) {
        super(`[canonical-json-v${exports.CANONICAL_JSON_VERSION}] ${message}`);
        this.name = 'CanonicalJsonError';
    }
}
exports.CanonicalJsonError = CanonicalJsonError;
//# sourceMappingURL=canonicalize.js.map