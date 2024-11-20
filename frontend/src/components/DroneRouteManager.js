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
                altitude,
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

    const moveToNextPoint = () => {
        if (index >= routePoints.length) {
            alert('Маршрут завершён!');
            setIsMoving(false);  // Устанавливаем isMoving в false
            return;
        }

        const target = routePoints[index];
        const speed = 20; // Скорость дрона в метрах в секунду
        const refreshRate = 50; // Частота обновлений в миллисекундах

        const distanceToTarget = calculateDistance(dronePosition, target);
        const duration = (distanceToTarget / speed) * 1000;
        const steps = Math.ceil(duration / refreshRate);

        const deltaLat = (target.lat - dronePosition.lat) / steps;
        const deltaLng = (target.lng - dronePosition.lng) / steps;
        const deltaAlt = (target.altitude - dronePosition.altitude) / steps;

        let currentStep = 0;

        const intervalId = setInterval(() => {
            if (currentStep >= steps || calculateDistance(dronePosition, target) < 0.001) {
                clearInterval(intervalId);
                setDronePosition({
                    lat: target.lat,
                    lng: target.lng,
                    altitude: target.altitude,
                    heading: calculateHeading(dronePosition, target),
                });
                index++;
                moveToNextPoint();
            } else {
                setDronePosition((prev) => ({
                    lat: prev.lat + deltaLat,
                    lng: prev.lng + deltaLng,
                    altitude: prev.altitude + deltaAlt,
                    heading: calculateHeading(prev, target),
                }));
                currentStep++;
            }
        }, refreshRate);
    };

    setIsMoving(true);  // Начинаем движение
    moveToNextPoint();
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