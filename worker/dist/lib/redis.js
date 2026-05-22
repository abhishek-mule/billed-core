"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisUrl = void 0;
exports.createRedisConnection = createRedisConnection;
const ioredis_1 = __importDefault(require("ioredis"));
exports.redisUrl = process.env.UPSTASH_REDIS_URL || '';
function createRedisConnection() {
    return new ioredis_1.default(exports.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: {},
    });
}
//# sourceMappingURL=redis.js.map