import { PrismaMetricsService } from '@gsainfoteam/nest-observability';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, PrismaMetricsService],
  exports: [PrismaService],
})
export class PrismaModule {}
