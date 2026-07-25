import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON,
} from '@whiskeysockets/baileys';
import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;

  if (!host) {
    return null;
  }

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    redisClient.on('error', (err) => console.error('Redis Client Error:', err.message));

    return redisClient;
  } catch (err) {
    console.error('Failed to initialize Redis client:', err);
    return null;
  }
}

export async function useRedisAuthState(sessionId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearCreds: () => Promise<void>;
}> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis client not configured');
  }

  const credsKey = `wa_session:${sessionId}:creds`;
  const keysPrefix = `wa_session:${sessionId}:keys:`;

  const readData = async (key: string) => {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data, BufferJSON.reviver);
    } catch (_) {
      return null;
    }
  };

  const writeData = async (key: string, value: any) => {
    try {
      if (value === null || value === undefined) {
        await redis.del(key);
      } else {
        await redis.set(key, JSON.stringify(value, BufferJSON.replacer));
      }
    } catch (err) {
      console.error(`Error writing Redis key ${key}:`, err);
    }
  };

  const rawCreds = await readData(credsKey);
  const creds: AuthenticationCreds = rawCreds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          for (const id of ids) {
            const value = await readData(`${keysPrefix}${type}:${id}`);
            if (value) {
              if (type === 'app-state-sync-key' && value) {
                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
              } else {
                data[id] = value;
              }
            }
          }
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]![id];
              const key = `${keysPrefix}${category}:${id}`;
              tasks.push(writeData(key, value));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData(credsKey, creds);
    },
    clearCreds: async () => {
      const keys = await redis.keys(`wa_session:${sessionId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    },
  };
}
