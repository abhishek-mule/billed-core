import type { NormalizedEvent, NormalizedMessage } from './types';
/** Meta sends text as { body: "..." }, Gupshup sends it as a plain string. */
export declare function textBody(text: NormalizedMessage['text']): string | null;
/**
 * Normalize Meta passthrough + flat Gupshup shapes into one internal form.
 * Pure — no client, no side effects.
 */
export declare function normalizePayload(payload: any): NormalizedEvent[];
export declare function tsToIso(ts?: string): string | undefined;
//# sourceMappingURL=normalize.d.ts.map