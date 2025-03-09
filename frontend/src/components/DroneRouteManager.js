// DroneRouteManager.js

import throttle from 'lodash/throttle';

// Функция для загрузки маршрута из файла GeoJSON
export const loadRoute = async () => {
    try {
        // Динамический импорт файла route.geojson
        const routeGeoJson = await import('../route/route.geojson');

        // Проверка структуры GeoJSON
        if (!routeGeoJson.features || !Array.isArray(routeGeoJson.features)) {
            throw new Error('Неверная структура файла GeoJSON');
        }

        // Преобразование точек маршрута в удобный формат
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

/// Функция для перемещения дрона по точкам маршрута с объединённой анимацией (горизонтальной и вертикальной)
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
    const throttledSetDronePosition = throttle(setDronePosition, 50);

    setIsMoving(true);
    moveToNextPoint(dronePosition);

    function moveToNextPoint(currentPos) {
        if (index >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);
            return;
        }

        const target = routePoints[index];
        const startLat = currentPos.lat;
        const startLng = currentPos.lng;
        const startAlt = parseFloat(currentPos.altitude) || 0;

        const targetLat = parseFloat(target.lat);
        const targetLng = parseFloat(target.lng);
        const targetAlt = parseFloat(target.altitude) || 0;

        // Объединённая анимация для горизонтального перемещения и изменения высоты
        animateMovement(startLat, startLng, startAlt, targetLat, targetLng, targetAlt, () => {
            index++;
            updateRouteIndex();
            moveToNextPoint({
                lat: targetLat,
                lng: targetLng,
                altitude: targetAlt,
            });
        });
    }

    // Функция, объединяющая горизонтальную и вертикальную анимацию
    function animateMovement(startLat, startLng, startAlt, targetLat, targetLng, targetAlt, onComplete) {
        const speedVertical = 5; // м/с для вертикального перемещения
        const speedHorizontal = 5; // м/с для горизонтального перемещения

        // Расстояние между точками для горизонтальной анимации (метры)
        const distance = calculateDistance(
            { lat: startLat, lng: startLng },
            { lat: targetLat, lng: targetLng }
        );

        const durationAltitude = (Math.abs(targetAlt - startAlt) / speedVertical) * 1000;
        const durationHorizontal = (distance / speedHorizontal) * 1000;
        // Общая длительность — максимум из двух этапов
        const totalDuration = Math.max(durationAltitude, durationHorizontal);

        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            // Единый прогресс для обеих составляющих
            const t = Math.min(elapsed / totalDuration, 1);

            const currentLat = startLat + (targetLat - startLat) * t;
            const currentLng = startLng + (targetLng - startLng) * t;
            const currentAlt = startAlt + (targetAlt - startAlt) * t;

            const newHeading = calculateHeading(
                { lat: currentLat, lng: currentLng },
                { lat: targetLat, lng: targetLng }
            );

            throttledSetDronePosition({
                lat: currentLat,
                lng: currentLng,
                altitude: currentAlt,
                heading: newHeading,
            });

            // Проверка столкновения (при необходимости)
            const fAlt = getExternalFlightAltitude ? getExternalFlightAltitude() : null;
            if (fAlt !== null && fAlt < -0.2) {
                alert('Столкновение с землей!');
                setIsMoving(false);
                return;
            }

            if (elapsed < totalDuration) {
                requestAnimationFrame(step);
            } else {
                // Обеспечиваем точное совпадение с целевой позицией
                throttledSetDronePosition({
                    lat: targetLat,
                    lng: targetLng,
                    altitude: targetAlt,
                    heading: newHeading,
                });
                onComplete();
            }
        }

        requestAnimationFrame(step);
    }
};

// Функция для вычисления расстояния между точками (формула Haversine)
const calculateDistance = (start, end) => {
    const R = 6371000; // Радиус Земли в метрах
    const lat1 = (start.lat * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const deltaLat = ((end.lat - start.lat) * Math.PI) / 180;
    const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Расстояние в метрах
};

// Функция для вычисления угла (heading)
const calculateHeading = (start, end) => {
    const deltaLng = end.lng - start.lng;
    const deltaLat = end.lat - start.lat;
    let heading = (Math.atan2(deltaLng, deltaLat) * 180) / Math.PI;
    if (heading < 0) heading += 360;
    return heading;
};