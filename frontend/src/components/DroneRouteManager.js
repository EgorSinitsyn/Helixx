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
    getGroundElevation,
    getExternalFlightAltitude
) => {
    if (!routePoints || routePoints.length === 0) {
        alert('Маршрут пуст!');
        return;
    }

    let index = 0;
    const throttledSetDronePosition = throttle(setDronePosition, 50);

    // --- Запускаем цепочку движения ---
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

        // 1) Сначала вертикальная анимация
        animateAltitude(startAlt, targetAlt, () => {
            // 2) Затем горизонтальная анимация
            animateHorizontal(startLat, startLng, targetLat, targetLng, targetAlt, () => {
                // Переходим к следующей точке
                index++;
                moveToNextPoint({
                    lat: targetLat,
                    lng: targetLng,
                    altitude: targetAlt,
                });
            });
        });
    }

    // --- Анимация вертикали: меняем ТОЛЬКО высоту ---
    function animateAltitude(startAltitude, endAltitude, onComplete) {
        const speedVertical = 5;  // м/с или любая другая скорость
        const distance = Math.abs(endAltitude - startAltitude);
        const duration = (distance / speedVertical) * 1000; // в мс

        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let t = elapsed / duration;
            if (t > 1) t = 1;

            // Линейная интерполяция высоты
            const currentAlt = startAltitude + (endAltitude - startAltitude) * t;

            // Позиция в вертикальном этапе: lat/lng не меняются
            const newPosition = {
                lat: dronePosition.lat, // или current lat? Но здесь см. ниже
                lng: dronePosition.lng,
                altitude: currentAlt,
                heading: 0
            };

            throttledSetDronePosition(newPosition);

            // Проверяем столкновение через getExternalFlightAltitude() (если нужно)
            const fAlt = getExternalFlightAltitude ? getExternalFlightAltitude() : null;
            if (
                // fAlt !== null &&
                fAlt < -0.2) {
                alert('Столкновение с землей!');
                setIsMoving(false);
                return;
            }

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                onComplete(); // Закончили подъём/спуск
            }
        }

        // Старт
        requestAnimationFrame(step);
    }

    // --- Анимация горизонтали: меняем lat/lng, держим altitude постоянной ---
    function animateHorizontal(startLat, startLng, endLat, endLng, fixedAltitude, onComplete) {
        const speedHorizontal = 20; // м/с
        // Расстояние по прямой (Haversine)
        const dist = calculateDistance(
            { lat: startLat, lng: startLng },
            { lat: endLat, lng: endLng }
        );
        const duration = (dist / speedHorizontal) * 1000;

        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let t = elapsed / duration;
            if (t > 1) t = 1;

            const curLat = startLat + (endLat - startLat) * t;
            const curLng = startLng + (endLng - startLng) * t;

            const newPosition = {
                lat: curLat,
                lng: curLng,
                altitude: fixedAltitude, // не меняется!
                heading: calculateHeading({ lat: curLat, lng: curLng }, { lat: endLat, lng: endLng }),
            };

            throttledSetDronePosition(newPosition);

            // Проверка столкновения (если нужно)
            const fAlt = getExternalFlightAltitude ? getExternalFlightAltitude() : null;
            if (
                // fAlt !== null &&
                fAlt < -0.2) {
                alert('Столкновение (horizontal stage)!');
                setIsMoving(false);
                return;
            }

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
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