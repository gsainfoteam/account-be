import { initializeOpenTelemetry } from '@gsainfoteam/nest-observability';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'infoteam-account-be';
const apiUrl = process.env.API_URL;

void (async () => {
  try {
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
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry', error);
    process.exit(1);
  }
})();
