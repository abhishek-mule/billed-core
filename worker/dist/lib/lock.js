"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
exports.withLock = withLock;
const redis_1 = require("./redis");
async function acquireLock(key, ttlMs = 30000) {
    const redis = (0, redis_1.createRedisConnection)();
    try {
        const result = await redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
        return result === 'OK';
    }
    finally {
        await redis.quit();
    }
}
async function releaseLock(key) {
    const redis = (0, redis_1.createRedisConnection)();
    try {
        await redis.del(`lock:${key}`);
    }
    finally {
        await redis.quit();
    }
}
async function withLock(key, ttlMs, fn) {
    const acquired = await acquireLock(key, ttlMs);
    if (!acquired)
        return null;
    try {
        return await fn();
    }
    finally {
        await releaseLock(key);
    }
}
//# sourceMappingURL=lock.js.map