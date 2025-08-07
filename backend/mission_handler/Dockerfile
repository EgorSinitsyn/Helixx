###############################################################################
# 🛠 BUILD STAGE — собираем колёса зависимостей
###############################################################################
FROM python:3.11-alpine AS builder

# 1) инструменты для сборки C-расширений (если в requirements есть такие пакеты)
RUN apk add --no-cache \
      build-base \
      libffi-dev \
      openssl-dev \
      python3-dev

WORKDIR /wheels

# 2) собираем .whl для всех зависимостей, включая OpenTelemetry
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir=/wheels -r requirements.txt \
 && pip wheel --no-cache-dir --wheel-dir=/wheels \
      opentelemetry-distro \
      opentelemetry-exporter-jaeger

###############################################################################
# 🚀 RUNTIME STAGE — только runtime-библиотеки и код
###############################################################################
FROM python:3.11-alpine AS runtime

# 3) только нужные C-библиотеки в рантайме
RUN apk add --no-cache libffi openssl

WORKDIR /app

# 4) ставим зависимости из локальных колёс
COPY --from=builder /wheels /wheels
RUN pip install --no-index --no-cache-dir /wheels/*.whl \
 && rm -rf /wheels

# 5) копируем код приложения
COPY . .

# 6) переменные окружения OpenTelemetry
ENV OTEL_SERVICE_NAME=mission-handler \
    OTEL_EXPORTER_JAEGER_ENDPOINT=http://jaeger-collector.observability:14268/api/traces

# 7) порт и точка входа
EXPOSE 5006
CMD ["opentelemetry-instrument", \
     "--traces_exporter","jaeger", \
     "--service_name","mission-handler", \
     "python","app.py"]