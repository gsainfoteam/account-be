import fastifyCookie from '@fastify/cookie';
import {
  initializeMetrics,
  initializeOpenTelemetry,
  MetricsInterceptor,
} from '@gsainfoteam/nest-observability';
import { Logger, MethodNotAllowedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  // inject the ConfigService
  const configService = app.get(ConfigService);
  // CORS setup
  const whitelist = [
    /^https:\/\/.*\.idp-fe-49s\.pages\.dev$/, // for idp fe preview pages
    /^https:\/\/.*\.idp-fe\.pages\.dev$/, // for idp fe preview pages
    /^https:\/\/.*idp\.gistory\.me$/, // for idp fe production pages
    /^https:\/\/.*\.account-fe-bvs\.pages\.dev$/, // for account fe preview pages
    /^https:\/\/.*\.account-fe\.pages\.dev$/, // for account fe preview pages
    /^https:\/\/.*account\.gistory\.me$/, // for account fe production pages
    /^http:\/\/localhost:3000$/, // for local development
    /^http:\/\/localhost:5173$/, // for local development
  ];
  const pathWhitelist = [
    '/oauth/token',
    '/oauth/certs',
    '/oauth/userinfo',
    '/.well-known/openid-configuration',
  ];
  app.enableCors({
    delegator: (req, callback) => {
      const origin = req.headers.origin;
      const url = req.url;
      // Extract pathname from URL (remove query parameters)
      const pathname = url.split('?')[0];
      if (!origin) {
        // No origin, no CORS
        callback(null, {
          origin: whitelist,
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
          optionsSuccessStatus: 204,
          preflightContinue: false,
          credentials: true,
        });
        return;
      } else if (pathWhitelist.some((path) => pathname.endsWith(path))) {
        // Allow all origins for the specified paths
        callback(null, {
          origin,
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
          optionsSuccessStatus: 204,
          preflightContinue: false,
          credentials: true,
        });
      } else if (whitelist.some((regex) => regex.test(origin))) {
        // Allow only whitelisted origins
        callback(null, {
          origin,
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
          optionsSuccessStatus: 204,
          preflightContinue: false,
          credentials: true,
        });
      } else {
        callback(new MethodNotAllowedException(), {
          origin: false,
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
          optionsSuccessStatus: 204,
          preflightContinue: false,
          credentials: true,
        });
      }
    },
  });
  // cookie parser setup
  await app.register(fastifyCookie);
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Infoteam-Account API docs')
    .setDescription('The Infoteam-Account API documentation')
    .setVersion(configService.getOrThrow<string>('API_VERSION'))
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        name: 'JWT',
        in: 'header',
      },
      'user:jwt',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      displayRequestDuration: true,
    },
  });
  // metrics interceptor
  app.useGlobalInterceptors(new MetricsInterceptor());

  // Execute the application
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

const bootstrapWithOTEL = async () => {
  const logger = new Logger('Bootstrap');
  try {
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'infoteam-account-be';
    const apiUrl = process.env.API_URL;

    if (apiUrl?.includes('account.gistory.me')) {
      await initializeOpenTelemetry({
        serviceName,
        metricsPort: Number(process.env.METRICS_PORT ?? 9090),
        otlpEndpoint:
          process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
          'http://localhost:4318/v1/traces',
        apiUrl,
        ignorePatterns: ['/health', '/metrics'],
      });
    }
    initializeMetrics(serviceName);
    await bootstrap();
  } catch (error) {
    logger.error('Failed to bootstrap application', error);
    process.exit(1);
  }
};

void bootstrapWithOTEL();
