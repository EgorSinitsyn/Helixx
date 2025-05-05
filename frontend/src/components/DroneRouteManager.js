// src/components/DroneInfoPanel.js

import throttle from 'lodash/throttle';

/**
 * loadRoute — загружает маршрут из GeoJSON файла
 * @async
 * @returns {Promise<Array<{lat: number, lng: number, altitude: number}>>}
 * @throws {Error} при некорректной структуре GeoJSON
 */

export async function loadRoute() {
  try {
    const routeGeoJson = await import('../route/route.geojson');
    const features = routeGeoJson.features;
    if (!features || !Array.isArray(features)) {
      throw new Error('Неверная структура файла GeoJSON');
    }

    return features.map(feature => {
      const [lng, lat, alt] = feature.geometry.coordinates;
      return {
        lat,
        lng,
        altitude: parseFloat(alt)
      };
    });
  } catch (err) {
    console.error('Ошибка при загрузке маршрута:', err);
    throw err;
  }
}

/**
 * moveDroneToRoutePoints — выполняет анимацию полёта по массиву точек
 * с плавным поворотом дрона к следующей точке.
 * @param {{lat: number, lng: number, altitude?: number, heading?: number}} dronePosition — стартовые данные дрона
 * @param {Function} setDronePosition — обновление позиции дрона в UI
 * @param {Array<{lat: number, lng: number, altitude: number}>} routePoints — точки маршрута
 * @param {Function} setIsMoving — флаг состояния движения
 * @param {Function} [getGroundElevation] — получить высоту рельефа
 * @param {Function} [getExternalFlightAltitude] — получить надземную высоту дрона
 * @param {Function} [updateRouteIndex] — колбэк для обновления текущего индекса
 */
export function moveDroneToRoutePoints(
  dronePosition,
  setDronePosition,
  routePoints,
  setIsMoving,
  getGroundElevation,
  getExternalFlightAltitude,
  updateRouteIndex
) {
  // Проверка наличия точек
  if (!Array.isArray(routePoints) || routePoints.length === 0) {
    alert('Маршрут пуст!');
    return;
  }

  let currentIndex = 0;
  setIsMoving(true);

  // Ограничение частоты обновления состояния дрона
  const throttledSetPos = throttle(setDronePosition, 30);

  // Начинаем последовательное перемещение
  goToPoint(currentIndex, dronePosition);

  /**
   * goToPoint — переходит к точке с индексом idx и запускает анимацию
   * @param {number} idx — индекс целевой точки
   * @param {{lat: number, lng: number, altitude?: number, heading?: number}} current — текущие данные дрона
   */
  function goToPoint(idx, current) {
    if (idx >= routePoints.length) {
      alert('Маршрут завершён!');
      setIsMoving(false);
      return;
    }

    const target = routePoints[idx];
    const nextPoint = routePoints[idx + 1] || target;

    const startState = {
      lat: parseFloat(current.lat),
      lng: parseFloat(current.lng),
      alt: parseFloat(current.altitude) || 0,
      heading: normalizeAngle(current.heading || 0)
    };

    const endState = {
      lat: parseFloat(target.lat),
      lng: parseFloat(target.lng),
      alt: parseFloat(target.altitude) || 0
    };

    animateSegmentWithRotation(
      startState,
      endState,
      { lat: parseFloat(nextPoint.lat), lng: parseFloat(nextPoint.lng) },
      newHeading => {
        // Обновление индекса для UI
        if (typeof updateRouteIndex === 'function') {
          updateRouteIndex(idx);
        }
        // Переходим к следующей точке
        goToPoint(idx + 1, {
          lat: endState.lat,
          lng: endState.lng,
          altitude: endState.alt,
          heading: newHeading
        });
      }
    );
  }

  /**
   * animateSegmentWithRotation — анимирует движение и поворот дрона
   * @param {{lat: number, lng: number, alt: number, heading: number}} start — стартовое состояние
   * @param {{lat: number, lng: number, alt: number}} end — целевое состояние
   * @param {{lat: number, lng: number}} next — следующая точка для расчёта поворота
   * @param {Function} onComplete — колбэк по завершении анимации
   */
  function animateSegmentWithRotation(start, end, next, onComplete) {
    const speedH = 5; // м/с горизонтально
    const speedV = 5; // м/с вертикально

    const distance = calculateDistance(start, end);
    const durationH = (distance / speedH) * 1000;
    const durationV = (Math.abs(end.alt - start.alt) / speedV) * 1000;
    const totalTime = Math.max(durationH, durationV);

    // Вычисление итогового угла к следующей точке
    const targetHeading = normalizeAngle(
      calculateHeading({ lat: end.lat, lng: end.lng }, next)
    );

    let delta = targetHeading - start.heading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    let startTs = null;

    /**
     * step — шаг анимации, вызывается requestAnimationFrame
     * @param {DOMHighResTimeStamp} ts
     */
    function step(ts) {
      if (startTs === null) startTs = ts;
      const progress = Math.min((ts - startTs) / totalTime, 1);

      const currLat = start.lat + (end.lat - start.lat) * progress;
      const currLng = start.lng + (end.lng - start.lng) * progress;
      const currAlt = start.alt + (end.alt - start.alt) * progress;

      const currHeading = normalizeAngle(start.heading + delta * progress);

      throttledSetPos(prev => ({
        ...prev,
        lat: currLat,
        lng: currLng,
        altitude: currAlt,
        heading: currHeading
      }));

      // Проверка столкновения
      const externalAlt = getExternalFlightAltitude ? getExternalFlightAltitude() : null;
      if (externalAlt !== null && externalAlt < -0.2) {
        alert('Столкновение с землей!');
        setIsMoving(false);
        return;
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Финальный кадр
        throttledSetPos(prev => ({
          ...prev,
          lat: end.lat,
          lng: end.lng,
          altitude: end.alt,
          heading: targetHeading
        }));
        if (typeof onComplete === 'function') onComplete(targetHeading);
      }
    }

    requestAnimationFrame(step);
  }
}

// --------------------------------------------------------------------------
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

/**
 * calculateDistance — возвращает расстояние между двумя координатами (м)
 * @param {{lat: number, lng: number}} start
 * @param {{lat: number, lng: number}} end
 * @returns {number}
 */
function calculateDistance(start, end) {
  const R = 6371000;
  const φ1 = (start.lat * Math.PI) / 180;
  const φ2 = (end.lat * Math.PI) / 180;
  const Δφ = ((end.lat - start.lat) * Math.PI) / 180;
  const Δλ = ((end.lng - start.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * calculateHeading — вычисляет угол между двумя точками (0..360°)
 * @param {{lat: number, lng: number}} start
 * @param {{lat: number, lng: number}} end
 * @returns {number}
 */
function calculateHeading(start, end) {
  const dLng = end.lng - start.lng;
  const dLat = end.lat - start.lat;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return normalizeAngle(angle);
}

/**
 * normalizeAngle — нормализует угол в диапазон [0, 360)
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle(angle) {
  let result = angle % 360;
  if (result < 0) result += 360;
  return result;
}
