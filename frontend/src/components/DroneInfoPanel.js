// src/components/DroneInfoPanel.js

import React, { useState, useCallback } from 'react';
import './css/compass_style.css';

/**
 * DroneInfoPanel — панель отображения GNSS-информации с компасом
 * @param {Object} props
 * @param {number} props.latitude — широта в градусах
 * @param {number} props.longitude — долгота в градусах
 * @param {number|string} props.altitude — абсолютная высота (м)
 * @param {number} props.flightAltitude — надземная высота (м)
 * @param {number} props.heading — направление дрона (°)
 * @param {Function} props.onHide — колбэк скрытия панели
 */

const DroneInfoPanel = ({ latitude, longitude, altitude, flightAltitude, heading, onHide }) => {
  const [isMinimized, setIsMinimized] = useState(false);

  /**
   * Переключает состояние свёрнутости панели
   */
  const handleToggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  /**
   * Вызывает колбэк скрытия панели
   */
  const handleHide = useCallback(() => {
    onHide();
  }, [onHide]);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <button style={styles.hideButton} onClick={handleHide}>×</button>
        <button style={styles.toggleButton} onClick={handleToggleMinimize}>
          {isMinimized ? '+' : '−'}
        </button>
        <h3 style={styles.header}>GNSS Информация</h3>
        {!isMinimized && (
          <div style={styles.infoList}>
            <p>Широта: {latitude.toFixed(5)}</p>
            <p>Долгота: {longitude.toFixed(5)}</p>
            <p>Высота: {Number(altitude).toFixed(2)} м</p>
            <p>Высота полёта: {flightAltitude.toFixed(2)} м</p>
            <p>Направление: {heading}°</p>
          </div>
        )}
      </div>

      {!isMinimized && (
        <div className="compass-container" style={styles.compassContainer}>
          <div className="compass">
            <div className="compass-center" />
            <div className="arrow-south" />
            <div className="arrow" />
            <div
              className="compass-rotatable"
              style={{ transform: `rotate(${-heading}deg)`, transition: 'transform 2s ease' }}
            >
              <div className="tick tick-0" />
              <div className="tick tick-45" />
              <div className="tick tick-90" />
              <div className="tick tick-135" />
              <div className="tick tick-180" />
              <div className="tick tick-225" />
              <div className="tick tick-270" />
              <div className="tick tick-315" />
              <div className="compass-directions">
                <div className="north">С</div>
                <div className="east">В</div>
                <div className="south">Ю</div>
                <div className="west">З</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Стили для DroneInfoPanel
const styles = {
  container: { position: 'relative' },
  panel: {
    position: 'fixed',
    bottom: '5px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '15px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    borderRadius: '8px',
    width: '210px',
    fontSize: '14px',
    boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.5)',
  },
  hideButton: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    backgroundColor: 'transparent',
    color: 'white',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  toggleButton: {
    position: 'absolute',
    top: '5px',
    right: '25px',
    backgroundColor: 'transparent',
    color: 'white',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  header: { margin: '0 0 10px' },
  infoList: { margin: 0, padding: 0 },
  compassContainer: {
    position: 'absolute',
    bottom: '3px',
    right: '455px', // при необходимости скорректируйте
    zIndex: 9999,
  },
};

export default React.memo(DroneInfoPanel);