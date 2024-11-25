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

// Функция для перемещения дрона по точкам маршрута
export const moveDroneToRoutePoints = (dronePosition, setDronePosition, routePoints, setIsMoving) => {
    if (!routePoints || routePoints.length === 0) {
        alert('Маршрут пуст!');
        return;
    }

    let index = 0;

    const moveToNextPoint = (currentDronePosition) => {
        if (index >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);  // Останавливаем движение
            return;
        }

        const target = routePoints[index];
        const speed = 20; // Скорость дрона в метрах в секунду
        const refreshRate = 50; // Частота обновлений в миллисекундах

        const distanceToTarget = calculateDistance(currentDronePosition, target);
        const duration = (distanceToTarget / speed) * 1000;
        const steps = Math.ceil(duration / refreshRate);

        const deltaLat = (target.lat - currentDronePosition.lat) / steps;
        const deltaLng = (target.lng - currentDronePosition.lng) / steps;

        const targetAltitude = parseFloat(target.altitude); // Преобразование в число
        const currentAltitude = parseFloat(currentDronePosition.altitude); // Преобразование в число

        if (isNaN(targetAltitude) || isNaN(currentAltitude)) {
            console.error('Ошибка при преобразовании высоты:', target.altitude, currentDronePosition.altitude);
            return;
        }

        const deltaAlt = (targetAltitude - currentAltitude) / steps;

        let currentStep = 0;

        const intervalId = setInterval(() => {
            if (currentStep >= steps || calculateDistance(currentDronePosition, target) < 0.001) {
                clearInterval(intervalId);

                const newPosition = {
                    lat: target.lat,
                    lng: target.lng,
                    altitude: targetAltitude,
                    heading: calculateHeading(currentDronePosition, target),
                };

                setDronePosition(newPosition);
                index++;  // Переходим к следующей точке

                // Переходим к следующей точке с обновленной позицией
                moveToNextPoint(newPosition);
            } else {
                const newPosition = {
                    lat: currentDronePosition.lat + deltaLat,
                    lng: currentDronePosition.lng + deltaLng,
                    altitude: currentDronePosition.altitude + deltaAlt,
                    heading: calculateHeading(currentDronePosition, target),
                };

                setDronePosition(newPosition);
                currentDronePosition = newPosition; // Обновляем текущую позицию
                currentStep++;
            }
        }, refreshRate);
    };

    setIsMoving(true);  // Начинаем движение
    moveToNextPoint(dronePosition); // Передаем начальную позицию дрона
};

// Функция для вычисления расстояния между точками (Haversine formula)
const calculateDistance = (start, end) => {
    const R = 6371000; // Радиус Земли в метрах
    const lat1 = (start.lat * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const deltaLat = ((end.lat - start.lat) * Math.PI) / 180;
    const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Расстояние в метрах
};

// Функция для вычисления угла (heading)
const calculateHeading = (start, end) => {
    const deltaLng = end.lng - start.lng;
    const deltaLat = end.lat - start.lat;

    const angle = Math.atan2(deltaLng, deltaLat); // angle between start and end point
    let heading = (angle * 180) / Math.PI; // Convert to degrees
    if (heading < 0) heading += 360;  // Поворот на 360 градусов для диапазона от 0 до 360

    return heading;
};