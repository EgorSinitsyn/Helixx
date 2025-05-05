// src/otel/initTracing.js
/* eslint-disable import/no-extraneous-dependencies */
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// URL от Jaeger/OTLP-экспортерa, проброшенный на localhost
const collectorUrl =
  process.env.REACT_APP_OTEL_EXPORTER_URL ?? 'http://localhost:4318/v1/traces';

// 1. Resource через утилиту
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: 'react-frontend',
});

// 2. Экспортёр с заголовком, чтобы использовать fetch() вместо Beacon
const exporter = new OTLPTraceExporter({
  url: collectorUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 3. Провайдер + spanProcessors через конструктор
const provider = new WebTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(exporter)],
});

// 4. Регистрируем провайдер
provider.register();

// 5. Инструментируем fetch (авто-инструментализация)
registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [
        /localhost:5005/,   // backend (mission-mediator)
      ],
    }),
  ],
});

console.info('[OTEL] Tracing initialized →', collectorUrl);