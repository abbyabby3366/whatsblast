import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON,
} from 'baileys';
import { Redis } from 'ioredis';
import { isValidSessionId } from '../utils/sessionPath.js';

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;
  const useTls = process.env.REDIS_TLS === 'true' || (host ? host.includes('upstash.io') : false);

  if (!host) {
    return null;
  }

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      tls: useTls ? {} : undefined,
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
  // sessionId becomes part of a SCAN MATCH pattern in clearCreds; glob characters
  // like '*' would match (and delete) other sessions' credentials.
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session id for Redis auth state: ${sessionId}`);
  }

  const credsKey = `wa_session:${sessionId}:creds`;
  const keysPrefix = `wa_session:${sessionId}:keys:`;

  // Connection errors must propagate: treating an unreachable Redis as "no creds"
  // would start a fresh device (QR) and later overwrite the real credentials.
  const parseData = (key: string, data: string | null) => {
    if (!data) return null;
    try {
      return JSON.parse(data, BufferJSON.reviver);
    } catch (err) {
      console.error(`Corrupt JSON in Redis key ${key}:`, err);
      return null;
    }
  };

  const readData = async (key: string) => parseData(key, await redis.get(key));

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
          if (ids.length === 0) return data;
          const redisKeys = ids.map((id) => `${keysPrefix}${type}:${id}`);
          const raws = await redis.mget(...redisKeys);
          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const value = parseData(redisKeys[i], raws[i]);
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
      // SCAN instead of KEYS so we don't block Redis for every other session
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `wa_session:${sessionId}:*`, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) {
          await redis.unlink(...keys);
        }
      } while (cursor !== '0');
    },
  };
}
