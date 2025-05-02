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
 * Перемещение дрона по точкам с объединённой анимацией полёта и поворота
 */
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

    let index = 0;
    setIsMoving(true);

    // Оптимизация обновлений
    const throttledSet = throttle(setDronePosition, 30);

    moveToPoint(index, dronePosition);

    function moveToPoint(idx, current) {
        if (idx >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);
            return;
        }

        const target = routePoints[idx];
        const next = routePoints[idx + 1] || target;

        const startState = {
            lat: parseFloat(current.lat),
            lng: parseFloat(current.lng),
            alt: parseFloat(current.altitude) || 0,
            heading: normalizeAngle(current.heading || 0),
        };
        const endState = {
            lat: parseFloat(target.lat),
            lng: parseFloat(target.lng),
            alt: parseFloat(target.altitude) || 0,
        };
        const nextCoords = { lat: parseFloat(next.lat), lng: parseFloat(next.lng) };

        animateSegmentWithRotation(startState, endState, nextCoords, (newHeading) => {
            if (typeof updateRouteIndex === 'function') updateRouteIndex(idx);

            // Переходим к следующей точке
            moveToPoint(idx + 1, {
                lat: endState.lat,
                lng: endState.lng,
                altitude: endState.alt,
                heading: newHeading,
            });
        });
    }

    /**
     * Анимация полёта и поворота в одном цикле
     */
    function animateSegmentWithRotation(start, end, next, onComplete) {
        const speedH = 5; // м/с
        const speedV = 5; // м/с

        const distance = calculateDistance(start, end);
        const durH = (distance / speedH) * 1000;
        const durV = (Math.abs(end.alt - start.alt) / speedV) * 1000;
        const totalDuration = Math.max(durH, durV);

        const finalHeading = normalizeAngle(
            calculateHeading({ lat: end.lat, lng: end.lng }, next)
        );
        let rotation = finalHeading - start.heading;
        if (rotation > 180) rotation -= 360;
        if (rotation < -180) rotation += 360;

        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const t = Math.min((timestamp - startTime) / totalDuration, 1);

            const currLat = start.lat + (end.lat - start.lat) * t;
            const currLng = start.lng + (end.lng - start.lng) * t;
            const currAlt = start.alt + (end.alt - start.alt) * t;

            const currHeading = normalizeAngle(start.heading + rotation * t);

            throttledSet((prev) => ({
                ...prev,
                lat: currLat,
                lng: currLng,
                altitude: currAlt,
                heading: currHeading,
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
                // Финальный сброс
                throttledSet((prev) => ({
                    ...prev,
                    lat: end.lat,
                    lng: end.lng,
                    altitude: end.alt,
                    heading: finalHeading,
                }));
                if (typeof onComplete === 'function') onComplete(finalHeading);
            }
        }

        requestAnimationFrame(step);
    }
};

// --------------------------------------------------------------------------
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

/** Расстояние между двумя точками (м) — Haversine */
function calculateDistance(start, end) {
    const R = 6371000;
    const lat1 = (start.lat * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const dLat = ((end.lat - start.lat) * Math.PI) / 180;
    const dLng = ((end.lng - start.lng) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/** Угол (heading) между точками (0..360) */
function calculateHeading(start, end) {
    const dLng = end.lng - start.lng;
    const dLat = end.lat - start.lat;
    let heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    return normalizeAngle(heading);
}

/** Нормализация угла в [0..360) */
function normalizeAngle(angle) {
    let result = angle % 360;
    if (result < 0) result += 360;
    return result;
}
