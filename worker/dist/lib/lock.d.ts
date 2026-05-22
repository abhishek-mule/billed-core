export declare function acquireLock(key: string, ttlMs?: number): Promise<boolean>;
export declare function releaseLock(key: string): Promise<void>;
export declare function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null>;
//# sourceMappingURL=lock.d.ts.map