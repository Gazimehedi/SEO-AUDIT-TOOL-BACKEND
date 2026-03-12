import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Critical for BullMQ
});

redisConnection.on('connect', () => console.log('✅ Redis Connected'));
redisConnection.on('error', (err) => console.error('❌ Redis Connection Error:', err));
