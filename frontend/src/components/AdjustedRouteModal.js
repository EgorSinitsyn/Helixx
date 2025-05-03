// src/components/AdjustedRouteModal.js

import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');

/**
 * Props
 *  - isOpen            : boolean
 *  - onClose           : () => void
 *  - initialMapUrl     : string – URL исходной Folium‑карты
 *  - routePoints       : array  – актуальный маршрут (может быть скорректированным)
 *  - userRoutePoints   : array  – оригинальный маршрут (снимок)
 *  - onRouteProcessed  : fn(points) – отдаём выбранный массив точек родителю
 */

const AdjustedRouteModal = ({
  isOpen,
  onClose,
  initialMapUrl,
  routePoints = [],
  userRoutePoints = [],
  onRouteProcessed = () => {},
}) => {
  const [offset, setOffset] = useState(3);              // расстояние до полигона, м
  const [mapUrl, setMapUrl] = useState(initialMapUrl);  // URL, отображаемый в <iframe>

  const bustCache = (url) => `${url}?ts=${Date.now()}`;

  // Когда окно открывается — показываем оригинальную карту и шлём userRoutePoints
  useEffect(() => {
    if (isOpen) {
      setMapUrl(bustCache(initialMapUrl));
      onRouteProcessed(userRoutePoints);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Показать исходный маршрут
  const handleOriginalRoute = () => {
    setMapUrl(bustCache(initialMapUrl));
    onRouteProcessed(userRoutePoints);      // ← меняем routePoints в App на пользовательский снимок
  };

  // Показать скорректированный маршрут
  const handleCorrectedRoute = async () => {
    try {
      const res = await fetch(
          `${process.env.REACT_APP_MEDIATOR_API}/process-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset }),
      }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.routePoints)) {
        setMapUrl(bustCache(data.mapUrl));
        onRouteProcessed(data.routePoints);  // ← отдаём скорректированный список точек
      } else {
        console.error('[AdjustedRouteModal] bad response', data);
        alert('Ошибка обработки маршрута на сервере');
      }
    } catch (err) {
      console.error('[AdjustedRouteModal] fetch failed', err);
      alert('Сбой запроса к серверу (см. консоль)');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Корректировщик маршрута"
      style={customStyles}
    >
      <h2 style={{ textAlign: 'center' }}>Корректировщик маршрута</h2>

      <iframe
        src={mapUrl}
        width="100%"
        height="400px"
        style={{ border: '1px solid #ccc' }}
        title="Карта маршрута"
      />

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <label style={{ marginRight: '10px' }}>
          Дистанция до границ полигонов:
          <input
            type="number"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button onClick={handleOriginalRoute} style={{ marginRight: '10px' }}>
          Изначальный маршрут
        </button>
        <button onClick={handleCorrectedRoute}>Скорректированный маршрут</button>
      </div>
    </Modal>
  );
};

// ---------------- Styles ----------------
const customStyles = {
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
    width: '70%',
    maxWidth: '800px',
    backgroundColor: '#333',
    color: 'white',
    border: 'none',
    padding: '20px',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
};

const inputStyle = {
  marginLeft: '5px',
  width: '80px',
  padding: '5px',
  backgroundColor: '#777',
  color: 'white',
  border: '1px solid #777',
};

export default AdjustedRouteModal;
