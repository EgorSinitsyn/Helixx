#!/usr/bin/env bash
set -e

# --- 1) фронтенд ---
echo "🚀 Запускаем фронтенд..."
(
  cd frontend/
  npm start
) &
FRONTEND_PID=$!

# --- 2) mission_mediator ---
echo "🚀 Запускаем mission_mediator..."
(
  cd backend/mission_mediator/
  # убедитесь, что используете python3 или ваш venv:
  python3 mission_mediator.py
) &
MEDIATOR_PID=$!

# --- 3) mission_handler ---
echo "🚀 Запускаем mission_handler..."
(
  cd backend/mission_handler/
  # точка входа — app.py, а не mission_handler.py
  python3 app.py
) &
HANDLER_PID=$!

# Дождаться завершения всех сервисов
wait $FRONTEND_PID $MEDIATOR_PID $HANDLER_PID