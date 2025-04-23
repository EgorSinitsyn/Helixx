// src/services/route_transfer.js

/**
 * Отправляет данные о миссии (дрона, маршрута, полигонов) на Python-сервер.
 *
 * @param {Object} droneData - Объект вида { lat, lng, altitude } (позиция дрона)
 * @param {Array}  routePoints - Массив точек [{ lat, lng, altitude, ... }, ...]
 * @param {Object} savedPolygons - Данные полигонов (GeoJSON или любой другой формат)
 * @returns {Promise<Object>} - Возвращает Promise с ответом сервера (JSON)
 */
export async function sendMissionDataToServer(droneData, routePoints, savedPolygons) {
  // Формируем объект с нужными полями
  const payload = {
    droneData,
    routePoints,
    savedPolygons,
  };

  try {
    // Отправляем запрос на Flask-сервер
    const response = await fetch(
        `${process.env.REACT_APP_MEDIATOR_API}/get-mission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ошибка сервера: ${response.status}`);
    }

    // Парсим JSON
    const result = await response.json();
    console.log('[route_transfer.js] Ответ от сервера:', result);
    return result;
  } catch (error) {
    console.error('[route_transfer.js] Ошибка при отправке данных:', error);
    throw error;
  }
}