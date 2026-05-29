"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const canonicalize_1 = require("./canonicalize");
(0, vitest_1.describe)('canonicalJson v1', () => {
    (0, vitest_1.it)('sorts object keys deterministically', () => {
        const result = (0, canonicalize_1.canonicalJson)({ z: 1, a: 2, m: 3 });
        (0, vitest_1.expect)(result).toMatchSnapshot('sorted-keys');
    });
    (0, vitest_1.it)('strips undefined values', () => {
        const result = (0, canonicalize_1.canonicalJson)({ a: 1, b: undefined, c: null });
        (0, vitest_1.expect)(result).toMatchSnapshot('strip-undefined');
    });
    (0, vitest_1.it)('keeps null values', () => {
        const result = (0, canonicalize_1.canonicalJson)({ a: null });
        (0, vitest_1.expect)(result).toMatchSnapshot('keep-null');
    });
    (0, vitest_1.it)('normalizes unicode to NFC', () => {
        const composed = '\u00E9';
        const decomposed = '\u0065\u0301';
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)({ val: composed })).toBe((0, canonicalize_1.canonicalJson)({ val: decomposed }));
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)({ val: composed })).toMatchSnapshot('unicode-nfc');
    });
    (0, vitest_1.it)('rejects NaN', () => {
        (0, vitest_1.expect)(() => (0, canonicalize_1.canonicalJson)({ a: NaN })).toThrow(canonicalize_1.CanonicalJsonError);
    });
    (0, vitest_1.it)('rejects Infinity', () => {
        (0, vitest_1.expect)(() => (0, canonicalize_1.canonicalJson)({ a: Infinity })).toThrow(canonicalize_1.CanonicalJsonError);
    });
    (0, vitest_1.it)('rejects -Infinity', () => {
        (0, vitest_1.expect)(() => (0, canonicalize_1.canonicalJson)({ a: -Infinity })).toThrow(canonicalize_1.CanonicalJsonError);
    });
    (0, vitest_1.it)('rejects BigInt', () => {
        (0, vitest_1.expect)(() => (0, canonicalize_1.canonicalJson)({ a: BigInt(42) })).toThrow(canonicalize_1.CanonicalJsonError);
    });
    (0, vitest_1.it)('serializes Date to ISO string', () => {
        const d = new Date('2026-05-28T12:00:00.000Z');
        const result = (0, canonicalize_1.canonicalJson)({ timestamp: d });
        (0, vitest_1.expect)(result).toMatchSnapshot('date-iso');
    });
    (0, vitest_1.it)('handles empty objects', () => {
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)({})).toMatchSnapshot('empty-object');
    });
    (0, vitest_1.it)('handles empty arrays', () => {
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)([])).toMatchSnapshot('empty-array');
    });
    (0, vitest_1.it)('handles nested objects', () => {
        const input = { outer: { z: 1, a: 2 }, list: [3, 1, 2] };
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(input)).toMatchSnapshot('nested');
    });
    (0, vitest_1.it)('handles arrays of objects', () => {
        const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(input)).toMatchSnapshot('array-of-objects');
    });
    (0, vitest_1.it)('handles mixed-type arrays', () => {
        const input = { items: [1, 'two', true, null, { a: 1 }] };
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(input)).toMatchSnapshot('mixed-array');
    });
    (0, vitest_1.it)('produces deterministic output for same input', () => {
        const a = { b: 2, a: 1 };
        const b = { a: 1, b: 2 };
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(a)).toBe((0, canonicalize_1.canonicalJson)(b));
    });
    (0, vitest_1.it)('handles deeply nested key ordering', () => {
        const input = { level1: { level2: { c: 3, b: 2, a: 1 } } };
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(input)).toMatchSnapshot('deep-nested');
    });
    (0, vitest_1.it)('handles boolean and number primitives at root', () => {
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(true)).toMatchSnapshot('root-boolean');
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)(42)).toMatchSnapshot('root-number');
        (0, vitest_1.expect)((0, canonicalize_1.canonicalJson)('hello')).toMatchSnapshot('root-string');
    });
    (0, vitest_1.it)('exports the current version', () => {
        (0, vitest_1.expect)(canonicalize_1.CANONICAL_JSON_VERSION).toBe(1);
    });
});
//# sourceMappingURL=canonicalize.test.js.map