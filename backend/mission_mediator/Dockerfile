FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install -r requirements.txt \
 && pip install opentelemetry-distro opentelemetry-exporter-jaeger

ENV OTEL_SERVICE_NAME=mission-mediator \
    OTEL_EXPORTER_JAEGER_ENDPOINT=http://jaeger-collector.observability:14268/api/traces

EXPOSE 5005

CMD opentelemetry-instrument \
    --traces_exporter jaeger \
    --service_name mission-mediator \
    python mission_mediator.py
