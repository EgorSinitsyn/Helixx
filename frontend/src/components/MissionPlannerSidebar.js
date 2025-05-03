// src/components/MissionPlannerSidebar.js

import React, { useState, useCallback } from 'react';

/**
 * MissionPlannerSidebar — боковая панель планировщика миссий
 * @param {Object} props
 * @param {Object} props.selectedPoint — текущая точка для добавления
 * @param {boolean} props.is3D — режим высот: 3D или 2D
 * @param {Function} props.onAltitudeChange — колбэк при изменении высоты
 * @param {number|string} props.calibratedAltitude — откалиброванная высота дрона
 * @param {Function} props.onSavePoint — колбэк сохранения точки
 * @param {Function} props.onCancelRoute — колбэк отмены всего маршрута
 * @param {Function} props.onRemoveLastPoint — колбэк удаления последней точки
 * @param {Function} props.onRemoveRoutePoint — колбэк удаления точки по индексу
 * @param {Function} props.onConfirmRoute — колбэк подтверждения маршрута
 * @param {Array<Object>} props.routePoints — массив точек маршрута
 * @param {Function} props.onClose — колбэк закрытия панели
 */

const MissionPlannerSidebar = ({
  selectedPoint,
  is3D,
  onAltitudeChange,
  calibratedAltitude,
  onSavePoint,
  onCancelRoute,
  onRemoveLastPoint,
  onRemoveRoutePoint,
  onConfirmRoute,
  routePoints,
  onClose,
}) => {
  // Индекс точки под курсором
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);

  /**
   * exportRouteToGeoJSON — экспортирует маршрут в файл GeoJSON
   * @param {Array<Object>} points — массив точек маршрута
   */
  const exportRouteToGeoJSON = useCallback((points) => {
    const geoJson = {
      type: 'FeatureCollection',
      features: points.map((pt, idx) => ({
        type: 'Feature',
        properties: { id: idx + 1, altitude: Number(pt.flightAltitude) },
        geometry: {
          type: 'Point',
          coordinates: [Number(pt.lng), Number(pt.lat), Number(pt.altitude)],
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
  }, []);

  /**
   * handleSavePoint — обработка сохранения текущей точки
   */
  const handleSavePoint = useCallback(() => {
    onSavePoint();
  }, [onSavePoint]);

  /**
   * handleRemoveLastPoint — обработка удаления последней точки маршрута
   */
  const handleRemoveLastPoint = useCallback(() => {
    onRemoveLastPoint();
  }, [onRemoveLastPoint]);

  /**
   * handleCancelRoute — обработка отмены всего маршрута
   */
  const handleCancelRoute = useCallback(() => {
    onCancelRoute();
  }, [onCancelRoute]);

  /**
   * handleConfirmRoute — обработка подтверждения и обновления маршрута
   */
  const handleConfirmRoute = useCallback(() => {
    onConfirmRoute();
  }, [onConfirmRoute]);

  /**
   * handleRemoveRoutePoint — обработка удаления точки по индексу
   * @param {number} index — индекс удаляемой точки
   */
  const handleRemoveRoutePoint = useCallback((index) => {
    onRemoveRoutePoint(index);
  }, [onRemoveRoutePoint]);

  return (
    <div style={{ ...styles.sidebar, overflowX: 'hidden', overflowY: 'auto' }}>
      <button onClick={onClose} style={styles.closeButton}>✕</button>
      <h3 style={styles.header}>Планировщик миссий</h3>

      <div style={styles.pointInputContainer}>
        <p>Добавить точку маршрута</p>

        <div style={styles.inputRow}>
          <label>Широта:</label>
          <input type="number" value={selectedPoint.lat} readOnly style={styles.input} />
        </div>

        <div style={styles.inputRow}>
          <label>Долгота:</label>
          <input type="number" value={selectedPoint.lng} readOnly style={styles.input} />
        </div>

        <div style={styles.inputRow}>
          <label>Высота:</label>
          <input
            type="number"
            value={is3D ? selectedPoint.flightAltitude : selectedPoint.altitude}
            onChange={(e) => onAltitudeChange(e.target.value, is3D)}
            placeholder={
              is3D ? 'Введите надземную высоту' : 'Введите абсолютную высоту'
            }
            style={styles.input}
          />
        </div>

        <p style={{ fontSize: '12px', color: '#ccc' }}>
          Высота точки с учетом позиции дрона:{' '}
          {(Number(calibratedAltitude) + Number(selectedPoint.flightAltitude)).toFixed(2)} м
        </p>

        <div style={styles.buttonRow}>
          <button onClick={handleRemoveLastPoint} style={styles.cancelButton}>
            Отменить точку
          </button>
          <button onClick={handleSavePoint} style={styles.saveButton}>
            Сохранить точку
          </button>
        </div>

        <div style={styles.buttonRow}>
          <button
            onClick={() => exportRouteToGeoJSON(routePoints)}
            style={styles.downloadButton}
          >
            Скачать маршрут
          </button>
        </div>

        <button onClick={handleCancelRoute} style={styles.cancelRouteButton}>
          Отменить маршрут
        </button>
        <button onClick={handleConfirmRoute} style={styles.confirmButton}>
          Подтвердить | Обновить
        </button>
      </div>

      <div style={styles.routeListContainer}>
        <h4>Маршрутные точки</h4>
        {routePoints.map((point, index) => (
          <div
            key={index}
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
            <span
              style={styles.removeIcon}
              onClick={() => handleRemoveRoutePoint(index)}
            >
              ❌
            </span>

            <p style={{ color: '#FFD700', textAlign: 'center' }}>
              Точка {index + 1}
            </p>
            <p>Широта: {point.lat}</p>
            <p>Долгота: {point.lng}</p>
            <p>Надземная высота: {point.flightAltitude} м</p>
            <p>Абсолютная высота: {Number(point.altitude).toFixed(2)} м</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// Стили для компонента
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
  pointInputContainer: { marginBottom: '20px' },
  inputRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  input: { width: '50%', padding: '6px', fontSize: '12px', textAlign: 'right' },
  buttonRow: { display: 'flex', justifyContent: 'space-between', marginTop: '10px' },
  saveButton: {
    width: '45%',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#444',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  downloadButton: {
    width: '100%',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    opacity: 0.8,
  },
  confirmButton: {
    width: '100%',
    margin: '10px 0',
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
    width: '100%',
    marginTop: '10px',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#c9302c',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  routeListContainer: { marginBottom: '20px' },
  routePoint: {
    marginBottom: '10px',
    padding: '10px',
    backgroundColor: '#555',
    borderRadius: '4px',
    border: '1px solid #555',
    position: 'relative',
  },
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
