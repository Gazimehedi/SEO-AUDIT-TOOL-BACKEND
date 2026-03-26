"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
exports.redisConnection = new ioredis_1.default(redisUrl, {
    maxRetriesPerRequest: null, // Critical for BullMQ
});
exports.redisConnection.on('connect', () => console.log('✅ Redis Connected'));
exports.redisConnection.on('error', (err) => console.error('❌ Redis Connection Error:', err));
