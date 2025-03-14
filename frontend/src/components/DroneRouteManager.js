// DroneRouteManager.js
import throttle from 'lodash/throttle';

// Загрузка маршрута (без изменений)
export const loadRoute = async () => {
    try {
        const routeGeoJson = await import('../route/route.geojson');
        if (!routeGeoJson.features || !Array.isArray(routeGeoJson.features)) {
            throw new Error('Неверная структура файла GeoJSON');
        }
        return routeGeoJson.features.map((feature) => {
            const [lng, lat, altitude] = feature.geometry.coordinates;
            return {
                lat,
                lng,
                altitude: parseFloat(altitude),
            };
        });
    } catch (error) {
        console.error('Ошибка при загрузке маршрута:', error);
        throw error;
    }
};

/**
 * Основная функция перемещения дрона по точкам.
 * - Во время полёта: нос к целевой точке.
 * - После достижения промежуточных точек: дрон поворачивается на недостающий угол (кратчайший путь).
 * - В последней точке маршрута — без поворота, завершаем миссию.
 * *
 *  * @param {Object}   dronePosition              — текущее положение дрона { lat, lng, altitude, heading }
 *  * @param {Function} setDronePosition           — setState для обновления положения дрона
 *  * @param {Array}    routePoints                — массив точек [{ lat, lng, altitude }, ...]
 *  * @param {Function} setIsMoving                — setState-функция (флаг «дрон в движении»)
 *  * @param {Function} getGroundElevation         — (опционально) возвращает высоту рельефа
 *  * @param {Function} getExternalFlightAltitude  — (опционально) возвращает надземную высоту дрона для проверки столкновений
 *  * @param {Function} updateRouteIndex           — (опционально) колбэк, увеличивающий индекс для UI
 *  */
export const moveDroneToRoutePoints = (
    dronePosition,
    setDronePosition,
    routePoints,
    setIsMoving,
    getGroundElevation,
    getExternalFlightAltitude,
    updateRouteIndex
) => {
    if (!routePoints || routePoints.length === 0) {
        alert('Маршрут пуст!');
        return;
    }

    // Индекс текущей «цели» в routePoints
    let index = 0;
    setIsMoving(true);

    // Снижаем частоту setDronePosition
    const throttledSetDronePosition = throttle(setDronePosition, 30);

    // Начинаем движение с текущей позиции дрона
    moveToPoint(index, dronePosition);

    /**
     * Переходим к точке routePoints[idx], по прилёту (если не последняя)
     * поворачиваемся на недостающий угол к следующей.
     */
    function moveToPoint(idx, currentPos) {
        // Если уже нет точек — завершаем
        if (idx >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);
            return;
        }

        const target = routePoints[idx];
        const {
            lat: startLat,
            lng: startLng,
            altitude: startAlt,
            heading: startHeading = 0,
        } = currentPos;

        const targetLat = parseFloat(target.lat);
        const targetLng = parseFloat(target.lng);
        const targetAlt = parseFloat(target.altitude) || 0;

        // 1) Летим к очередной точке
        animateFlightSegment(
            parseFloat(startLat),
            parseFloat(startLng),
            parseFloat(startAlt) || 0,
            targetLat,
            targetLng,
            targetAlt,
            (finalHeading) => {
                // По завершении полёта оказываемся в (targetLat, targetLng).
                if (typeof updateRouteIndex === 'function') {
                    updateRouteIndex(idx);
                }

                // Если это НЕ последняя точка — выполняем поворот
                if (idx < routePoints.length - 1) {
                    const next = routePoints[idx + 1];

                    // 2) Узнаём heading к следующей точке (строго в 0..360)
                    const nextHeading = normalizeAngle(
                        calculateHeading(
                            { lat: targetLat, lng: targetLng },
                            { lat: parseFloat(next.lat), lng: parseFloat(next.lng) }
                        )
                    );

                    // Приводим finalHeading также к 0..360, если вдруг он вышел за диапазон
                    const normalizedFinalHeading = normalizeAngle(finalHeading);

                    // 3) Находим недостающий угол (кратчайший)
                    let rotation = nextHeading - normalizedFinalHeading;
                    if (rotation > 180) rotation -= 360;
                    if (rotation < -180) rotation += 360;

                    // Поворот на месте
                    rotateInPlace(
                        targetLat,
                        targetLng,
                        targetAlt,
                        normalizedFinalHeading,
                        rotation,
                        (newHeading) => {
                            // После поворота идём к следующей точке
                            moveToPoint(idx + 1, {
                                lat: targetLat,
                                lng: targetLng,
                                altitude: targetAlt,
                                heading: newHeading,
                            });
                        }
                    );
                } else {
                    // Последняя точка — миссия завершена, без поворота
                    alert('Маршрут завершён! Последняя точка достигнута.');
                    setIsMoving(false);
                }
            }
        );
    }

    // --------------------------------------------------------------------------
    // ФУНКЦИИ АНИМАЦИИ

    /**
     * Анимация полёта: линейная интерполяция lat/lng/alt, а heading высчитываем
     * на каждом кадре «носом к конечной точке».
     *
     * @param {number} startLat
     * @param {number} startLng
     * @param {number} startAlt
     * @param {number} endLat
     * @param {number} endLng
     * @param {number} endAlt
     * @param {Function} onComplete(finalHeading)
     */
    function animateFlightSegment(
        startLat,
        startLng,
        startAlt,
        endLat,
        endLng,
        endAlt,
        onComplete
    ) {
        const speedVertical = 5;   // м/с по высоте
        const speedHorizontal = 5; // м/с по горизонтали

        // Расстояние (м) по горизонтали
        const distance = calculateDistance(
            { lat: startLat, lng: startLng },
            { lat: endLat, lng: endLng }
        );

        // Время полёта
        const durationAltitude = (Math.abs(endAlt - startAlt) / speedVertical) * 1000;
        const durationHorizontal = (distance / speedHorizontal) * 1000;
        const totalDuration = Math.max(durationAltitude, durationHorizontal);

        let startTime = null;
        let finalHeading = 0; // Чтобы передать из анимации наверх

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const t = Math.min(elapsed / totalDuration, 1);

            // Линейная интерполяция позиции
            const currentLat = startLat + (endLat - startLat) * t;
            const currentLng = startLng + (endLng - startLng) * t;
            const currentAlt = startAlt + (endAlt - startAlt) * t;

            // heading «к конечной точке» (не нормализуем здесь, лишь для визуализации полёта)
            const currentHeading = calculateHeading(
                { lat: currentLat, lng: currentLng },
                { lat: endLat, lng: endLng }
            );
            finalHeading = currentHeading; // сохраним, чтобы передать при завершении

            throttledSetDronePosition((prev) => ({
                ...prev,
                lat: currentLat,
                lng: currentLng,
                altitude: currentAlt,
                heading: currentHeading,
            }));

            // Проверка столкновений
            const fAlt = getExternalFlightAltitude ? getExternalFlightAltitude() : null;
            if (fAlt !== null && fAlt < -0.2) {
                alert('Столкновение с землей!');
                setIsMoving(false);
                return;
            }

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                // Окончательно выравниваемся в точке
                throttledSetDronePosition((prev) => ({
                    ...prev,
                    lat: endLat,
                    lng: endLng,
                    altitude: endAlt,
                    heading: finalHeading,
                }));
                // Сообщаем итоговый угол
                if (typeof onComplete === 'function') {
                    onComplete(finalHeading);
                }
            }
        }

        requestAnimationFrame(step);
    }

    /**
     * Поворот на месте: координаты не меняются, heading изменяется на rotationDegrees
     * (может быть +, может быть -).
     *
     * @param {number} lat
     * @param {number} lng
     * @param {number} alt
     * @param {number} startHeading
     * @param {number} rotationDegrees (может быть отриц., если поворачиваемся в др. сторону)
     * @param {Function} onComplete(newHeading)
     */
    function rotateInPlace(
        lat,
        lng,
        alt,
        startHeading,
        rotationDegrees,
        onComplete
    ) {
        // Скорость поворота (°/с)
        const rotationSpeed = 60;
        const totalRotation = rotationDegrees;
        // Время анимации
        const duration = (Math.abs(totalRotation) / rotationSpeed) * 1000;

        let startTime = null;
        let finalHeading = normalizeAngle(startHeading);

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const t = Math.min(elapsed / duration, 1);

            const currentHeading = normalizeAngle(
                startHeading + totalRotation * t
            );
            finalHeading = currentHeading;

            throttledSetDronePosition((prev) => ({
                ...prev,
                lat,
                lng,
                altitude: alt,
                heading: finalHeading,
            }));

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                throttledSetDronePosition((prev) => ({
                    ...prev,
                    lat,
                    lng,
                    altitude: alt,
                    heading: finalHeading,
                }));
                if (typeof onComplete === 'function') {
                    onComplete(finalHeading);
                }
            }
        }

        requestAnimationFrame(step);
    }
};

// ---------------------------------------------------------------------------------
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

/**
 * Расстояние между двумя точками (м) — Haversine
 */
function calculateDistance(start, end) {
    const R = 6371000; // Радиус Земли в метрах
    const lat1 = (start.lat * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const deltaLat = ((end.lat - start.lat) * Math.PI) / 180;
    const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Угол (heading) между точками (0..360)
 */
function calculateHeading(start, end) {
    const deltaLng = end.lng - start.lng;
    const deltaLat = end.lat - start.lat;
    let heading = (Math.atan2(deltaLng, deltaLat) * 180) / Math.PI;
    // Приводим к 0..360:
    heading = normalizeAngle(heading);
    return heading;
}

/**
 * Нормализация угла в [0..360)
 */
function normalizeAngle(angle) {
    // Универсальное выражение: ((angle % 360) + 360) % 360
    let result = angle % 360;
    if (result < 0) result += 360;
    return result;
}