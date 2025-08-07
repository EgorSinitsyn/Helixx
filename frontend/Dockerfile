########## Делаем мультистейдж сборку для фронтенда ##########

###############################################################################
# 🛠  STAGE 1 — BUILD
###############################################################################
FROM node:20-alpine AS builder

WORKDIR /app

# 1️⃣ prod+dev зависимости
COPY package*.json ./

RUN npm ci

# 2️⃣ исходники и сборка
COPY . .
RUN npm run build

# ↓ DEBUG: посмотрите, куда положились файлы
RUN ls -R /app

# 3️⃣ удаляем dev-зависимости, чтобы node_modules уже был «prod-only»
RUN npm prune --omit=dev && npm cache clean --force

###############################################################################
# 🚀  STAGE 2 — RUNTIME
###############################################################################
FROM node:20-alpine AS runtime
WORKDIR /app

# 4️⃣ копируем *готовый* node_modules и артефакты
# COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build          ./build         
# COPY --from=builder /app/package*.json ./

# 2) ставим глобально "serve"
RUN npm install -g serve

# # 5️⃣ (если нужно) .env-файлы
# COPY *.env ./

# ENV NODE_ENV=production \
#     HOST=0.0.0.0 \
#     PORT=3000 \
#     CHOKIDAR_USEPOLLING=true

EXPOSE 3000
USER node

# CMD ["npm","start"]
CMD ["serve","-s","build","-l","3000"]