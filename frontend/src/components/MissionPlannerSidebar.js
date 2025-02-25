// MissionPlannerSidebar.js

import React, { useState } from 'react';

const MissionPlannerSidebar = ({
                                   selectedPoint,
                                   onAltitudeChange,
                                   onSavePoint,
                                   onCancelRoute,
                                   onRemoveLastPoint,
                                   onRemoveRoutePoint,
                                   onConfirmRoute,
                                   routePoints,
                                   onClose,
                               }) => {

    // **NEW** — добавляем состояние для отслеживания «подсвеченной» точки
    const [hoveredPointIndex, setHoveredPointIndex] = useState(null);

    // Функция для сохранения маршрута в проект
    const saveRouteToProject = async (routePoints) => {
        const geoJson = {
            type: 'FeatureCollection',
            features: routePoints.map((point, index) => ({
                type: 'Feature',
                properties: { id: index + 1, altitude: Number(point.flightAltitude) },
                geometry: {
                    type: 'Point',
                    coordinates: [Number(point.lng), Number(point.lat), Number(point.altitude)],
                },
            })),
        };

        try {
            const response = await fetch('http://localhost:5001/save-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geoJson),
            });

            if (response.ok) {
                alert('Маршрут успешно сохранён в директорию проекта: frontend/src/route');
            } else {
                alert('Ошибка при сохранении маршрута');
            }
        } catch (error) {
            console.error('Ошибка при запросе к серверу:', error);
            alert('Не удалось сохранить маршрут');
        }
    };

    // Функция для скачивания маршрута
    const exportRouteToGeoJSON = (routePoints) => {
        const geoJson = {
            type: 'FeatureCollection',
            features: routePoints.map((point, index) => ({
                type: 'Feature',
                properties: { id: index + 1, altitude: Number(point.flightAltitude) },
                geometry: {
                    type: 'Point',
                    coordinates: [Number(point.lng), Number(point.lat), Number(point.altitude)],
                },
            })),
        };

        const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'route.geojson';
        link.click();

        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ ...styles.sidebar, overflowX: 'hidden', overflowY: 'auto' }}>
            <button onClick={onClose} style={styles.closeButton}>✕</button>

            <h3 style={styles.header}>Планировщик миссий</h3>

            <div style={styles.pointInputContainer}>
                <p>Добавить точку маршрута</p>

                <div style={styles.inputRow}>
                    <label>Широта:</label>
                    <input
                        type="number"
                        value={selectedPoint.lat}
                        readOnly
                        style={styles.input}
                    />
                </div>

                <div style={styles.inputRow}>
                    <label>Долгота:</label>
                    <input
                        type="number"
                        value={selectedPoint.lng}
                        readOnly
                        style={styles.input}
                    />
                </div>

                <div style={styles.inputRow}>
                    <label>Высота:</label>
                    <input
                        type="number"
                        value={selectedPoint.flightAltitude}
                        onChange={(e) => onAltitudeChange(e.target.value)}
                        placeholder="Введите надземную высоту"
                        style={styles.input}
                    />
                </div>
                <p style={{ fontSize: '12px', color: '#ccc' }}>
                    Высота точки с учетом рельефа: {Number(selectedPoint.groundAltitude) + Number(selectedPoint.flightAltitude)} м
                </p>

                <div style={styles.buttonRow}>
                    <button onClick={onRemoveLastPoint} style={styles.cancelButton}>Отменить точку</button>
                    <button onClick={onSavePoint} style={styles.saveButton}>Сохранить точку</button>
                </div>

                <div style={styles.buttonRow}>
                    <button onClick={() => saveRouteToProject(routePoints)} style={styles.saveRouteButton}>Сохранить маршрут</button>
                    <button onClick={() => exportRouteToGeoJSON(routePoints)} style={styles.downloadButton}>
                        Скачать маршрут
                    </button>
                </div>

                <button onClick={onCancelRoute} style={styles.cancelRouteButton}>Отменить маршрут</button>
                <button onClick={onConfirmRoute} style={styles.confirmButton}>Подтвердить маршрут</button>
            </div>

            <div style={styles.routeListContainer}>
                <h4>Маршрутные точки</h4>
                {routePoints.map((point, index) => (
                    <div
                        key={index}
                        // Делаем обёртку с position:relative для крестика, а при наведении — синяя рамка
                        style={{
                            ...styles.routePoint,
                            border:
                                hoveredPointIndex === index
                                    ? '2px solid blue'
                                    : styles.routePoint.border,
                        }}
                        onMouseEnter={() => setHoveredPointIndex(index)}
                        onMouseLeave={() => setHoveredPointIndex(null)}
                    >
                        {/* Крестик ❌ в правом верхнем углу */}
                        <span
                            style={styles.removeIcon}
                            onClick={() => onRemoveRoutePoint(index)}
                        >
              ❌
            </span>

                        <p>Точка {index + 1}</p>
                        <p>Широта: {point.lat}</p>
                        <p>Долгота: {point.lng}</p>
                        <p>Высота: {point.flightAltitude}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};


const styles = {
    sidebar: {
        position: 'fixed',
        top: 0,
        right: 0,
        width: '200px',
        fontSize: '14px',
        maxHeight: '100vh',
        height: '100%',
        backgroundColor: '#333',
        color: 'white',
        padding: '10px',
        zIndex: 1000,
        overflowX: 'hidden',
        overflowY: 'auto',
    },
    closeButton: {
        position: 'absolute',
        top: '5px',
        right: '2px',
        backgroundColor: 'transparent',
        border: 'none',
        color: 'white',
        fontSize: '16px',
        cursor: 'pointer',
    },
    header: {
        margin: '20px 0 10px',
        textAlign: 'center',
    },
    pointInputContainer: {
        marginBottom: '20px',
    },
    inputRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
    },
    input: {
        width: '50%',
        padding: '6px',
        fontSize: '12px',
        textAlign: 'right',
    },
    buttonRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '10px',
    },
    saveButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#444',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    saveRouteButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    downloadButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        opacity: 0.8,
    },
    confirmButton: {
        flex: 1,
        width: '100%',
        marginBottom: '10px',
        marginTop: '10px',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#008CBA',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    cancelButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#555',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    cancelRouteButton: {
        flex: 1,
        width: '100%',
        marginTop: '10px',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#c9302c',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    routeListContainer: {
        marginBottom: '20px',
    },
    routePoint: {
        marginBottom: '10px',
        padding: '10px',
        backgroundColor: '#555',
        borderRadius: '4px',
        border: '1px solid #555',
        position: 'relative',
    },

    // **NEW** — стили для крестика «❌»
    removeIcon: {
        position: 'absolute',
        top: '5px',
        right: '5px',
        cursor: 'pointer',
        fontSize: '16px',
        color: 'red',
    },
};

export default MissionPlannerSidebar;