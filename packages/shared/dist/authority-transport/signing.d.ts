import type { IntentEnvelope } from './types';
export declare function hmacSignEnvelope(envelope: Omit<IntentEnvelope, 'signature'>, secret: string): string;
export declare function hmacVerify(envelope: IntentEnvelope, secret: string): boolean;
export declare function hmacSignHttp(method: string, path: string, timestamp: string, nonce: string, body: string, secret: string): string;
//# sourceMappingURL=signing.d.ts.map