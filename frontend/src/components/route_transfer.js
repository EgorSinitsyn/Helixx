// src/components/route_transfer.js

import { trace, context } from '@opentelemetry/api';

const tracer = trace.getTracer('react-frontend');

 /**
  * Отправляет данные о миссии (дрона, маршрута, полигонов) на Python-сервер.
  *
  * @param {Object} droneData - { lat, lng, altitude }
  * @param {Array}  routePoints - [{ lat, lng, altitude, ... }, ...]
  * @param {Object} savedPolygons - данные полигонов (GeoJSON или др.)
  * @returns {Promise<Object>} - Ответ сервера (JSON)
  */
export async function sendMissionDataToServer(droneData, routePoints, savedPolygons) {
  // 1. создаём span для всей операции
  const span = tracer.startSpan('route_transfer.sendMissionData', {
    attributes: {
      // любое уникальное поле — например, координаты старта
      'drone.lat': droneData.lat,
      'drone.lng': droneData.lng,
      'route.points_count': routePoints.length,
      'polygons.count': Array.isArray(savedPolygons.features)
        ? savedPolygons.features.length
        : undefined,
    },
  });

  try {
    // 2. оборачиваем асинхронную часть в контекст span’а
    return await context.with(trace.setSpan(context.active(), span), async () => {
      // формируем payload
      const payload = { droneData, routePoints, savedPolygons };

      // выполняем fetch
      const response = await fetch(
        `${process.env.REACT_APP_MEDIATOR_API}/get-mission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      // 3. проверяем статус и, при ошибке, записываем её в span
      if (!response.ok) {
        const err = new Error(`Server error: ${response.status}`);
        span.recordException(err);
        throw err;
      }

      // 4. парсим ответ
      const result = await response.json();
      span.addEvent('response.received', {
        'response.size': JSON.stringify(result).length,
      });

      console.log('[route_transfer.js] Ответ от сервера:', result);
      return result;
    });

  } catch (error) {
    // 5. логируем исключение в span
    span.recordException(error);
    console.error('[route_transfer.js] Ошибка при отправке данных:', error);
    throw error;

  } finally {
    // 6. завершаем span
    span.end();
  }
}