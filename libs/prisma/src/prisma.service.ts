import { PrismaMetricsService } from '@gsainfoteam/nest-observability';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaClientOptions } from '@prisma/client/runtime/library';

const createPrismaOption = (url: string) =>
  ({
    log: [{ emit: 'event', level: 'query' }] as const,
    datasources: { db: { url } },
  }) satisfies PrismaClientOptions;

/**
 * Service for using Prisma.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<ReturnType<typeof createPrismaOption>>
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * To set the location of the database, prisma: datasources is used.
   */
  constructor(
    readonly configService: ConfigService,
    readonly prismaMetricsService: PrismaMetricsService,
  ) {
    super(createPrismaOption(configService.getOrThrow<string>('DATABASE_URL')));
    this.$on('query', this.prismaMetricsService.getMetricsMiddleware());
  }

  /**
   * This method is called when the application is on the bootstrap phase.
   * And it's the right place to connect to the database.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * This method is called when the application is shutting down.
   * And it's the right place to close the database connection.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
