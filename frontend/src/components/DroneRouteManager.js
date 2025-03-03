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

/// Функция для перемещения дрона по точкам маршрута с использованием requestAnimationFrame и throttle
export const moveDroneToRoutePoints = (
    dronePosition,
    setDronePosition,
    routePoints,
    setIsMoving,
    getGroundElevation,          // если нужно логировать groundElevation
    getExternalFlightAltitude    // функция, возвращающая flightAltitude (из App.js)
) => {
    if (!routePoints || routePoints.length === 0) {
        alert('Маршрут пуст!');
        return;
    }

    let index = 0;
    const throttledSetDronePosition = throttle(setDronePosition, 50);

    const moveToNextPoint = (currentPosition) => {
        if (index >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);
            return;
        }

        const target = routePoints[index];
        const speed = 20;
        const distanceToTarget = calculateDistance(currentPosition, target);
        const duration = (distanceToTarget / speed) * 1000;

        const startLat = currentPosition.lat;
        const startLng = currentPosition.lng;
        const startAlt = parseFloat(currentPosition.altitude);

        const targetLat = target.lat;
        const targetLng = target.lng;
        const targetAlt = parseFloat(target.altitude);

        if (isNaN(startAlt) || isNaN(targetAlt)) {
            console.error('Ошибка при преобразовании высоты:', startAlt, targetAlt);
            return;
        }

        let startTime = null;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let t = elapsed / duration;
            if (t > 1) t = 1;

            const newLat = startLat + (targetLat - startLat) * t;
            const newLng = startLng + (targetLng - startLng) * t;
            const newAlt = startAlt + (targetAlt - startAlt) * t;

            // Обновляем позицию дрона
            const newPosition = {
                lat: newLat,
                lng: newLng,
                altitude: newAlt,
                heading: calculateHeading({ lat: newLat, lng: newLng }, target),
            };

            throttledSetDronePosition(newPosition);

            // Берём «актуальное» значение flightAltitude из App.js
            const externalFlightAltitude = getExternalFlightAltitude ? getExternalFlightAltitude() : null;

            // Если надо логировать groundElevation, возьмём его из переданного колбэка
            const currentGroundElevation = getGroundElevation ? getGroundElevation() : null;

            // --- Логирование как было «до проверки» ---
            console.log(
                '[Перед проверкой]',
                'newAlt:', newAlt,
                'groundElevation:', currentGroundElevation,
                'flightAltitude:', externalFlightAltitude
            );

            // Проверка столкновения
            if (
                // is3D
                // // externalFlightAltitude !== null
                // &&
                externalFlightAltitude < -0.5
            ) {
                alert('Столкновение с землёй!');
                setIsMoving(false);
                return;
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                index++;
                moveToNextPoint(newPosition);
            }
        };

        requestAnimationFrame(animate);
    };

    setIsMoving(true);
    moveToNextPoint(dronePosition);
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