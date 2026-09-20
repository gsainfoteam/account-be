import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { CacheNotFoundException } from './exceptions/cacheNotFound.exception';
import { CacheConfig } from './types/cacheConfig.type';

@Injectable()
@Trace()
export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    this.redisClient = new Redis(configService.getOrThrow<string>('REDIS_URL'));
  }

  async ping(): Promise<'PONG'> {
    return this.redisClient.ping();
  }

  async set<T>(
    key: string,
    value: T,
    { prefix = 'default', ttl }: CacheConfig,
  ): Promise<void> {
    this.logger.log(`Setting cache for key: ${key}`);
    await this.redisClient.set(
      `${prefix}:${key}`,
      JSON.stringify(value),
      'EX',
      ttl,
    );
  }

  async get<T>(
    key: string,
    { prefix = 'default' }: Pick<CacheConfig, 'prefix'>,
  ): Promise<T | null> {
    this.logger.log(`Getting cache for key: ${key}`);
    const value = await this.redisClient.get(`${prefix}:${key}`);
    return value ? (JSON.parse(value) as T) : null;
  }

  async getOrThrow<T>(
    key: string,
    { prefix = 'default' }: Pick<CacheConfig, 'prefix'>,
  ): Promise<T> {
    const value = await this.get<T>(key, { prefix });
    if (!value) {
      this.logger.debug(`Cache not found for key: ${key}`);
      throw new CacheNotFoundException(`${prefix}:${key}`);
    }
    return value;
  }

  async del(
    key: string,
    { prefix = 'default' }: Pick<CacheConfig, 'prefix'>,
  ): Promise<void> {
    this.logger.log(`Deleting cache for key: ${key}`);
    await this.redisClient.del(`${prefix}:${key}`);
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
