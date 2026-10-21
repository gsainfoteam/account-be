import { ClassSerializerInterceptor } from '@nestjs/common';

// the real package is ESM only and jest runs these tests as CommonJS; unit tests export no telemetry anyway
export const Trace = () => (): void => undefined;

export const OtelClassSerializerInterceptor = ClassSerializerInterceptor;

export class PrismaMetricsService {}

export const initializeOpenTelemetry = (): void => undefined;
