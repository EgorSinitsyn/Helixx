FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install opentelemetry-distro opentelemetry-exporter-jaeger

ENV OTEL_SERVICE_NAME=mission-handler \
    OTEL_EXPORTER_JAEGER_ENDPOINT=http://jaeger-collector.observability:14268/api/traces

EXPOSE 5006

CMD opentelemetry-instrument \
    --traces_exporter jaeger \
    --service_name mission-handler \
    python app.py
