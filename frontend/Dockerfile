########## Делаем мультистейдж сборку для фронтенда ##########

###############################################################################
# 🛠  STAGE 1 — BUILD
###############################################################################
FROM node:20-alpine AS builder

WORKDIR /app

# prod+dev зависимости
COPY package*.json ./
RUN npm ci

# перед сборкой объявляем build-args/ENV для CRA
ARG REACT_APP_MEDIATOR_API
ARG REACT_APP_OTEL_EXPORTER_URL
ENV REACT_APP_MEDIATOR_API=${REACT_APP_MEDIATOR_API}
ENV REACT_APP_OTEL_EXPORTER_URL=${REACT_APP_OTEL_EXPORTER_URL}

# исходники и сборка
COPY . .
RUN npm run build

# удаляем dev-зависимости, чтобы node_modules уже был «prod-only»
RUN npm prune --omit=dev && npm cache clean --force


###############################################################################
# 🚀  STAGE 2 — RUNTIME
###############################################################################
FROM node:20-alpine AS runtime
WORKDIR /app

# копируем *готовый* node_modules и артефакты
COPY --from=builder /app/build          ./build

# ставим глобально "serve"
RUN npm install -g serve

EXPOSE 3000
USER node
# CMD ["npm","start"]
CMD ["serve","-s","build","-l","3000"]