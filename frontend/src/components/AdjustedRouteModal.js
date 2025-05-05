// src/components/AdjustedRouteModal.js

import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { trace, context } from '@opentelemetry/api';

Modal.setAppElement('#root');
const tracer = trace.getTracer('react-frontend');

/**
 * Props:
 *  - isOpen            : boolean
 *  - onClose           : () => void
 *  - initialMapUrl     : string – URL исходной Folium-карты
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
  const [offset, setOffset]     = useState(3);
  const [mapUrl, setMapUrl]     = useState(initialMapUrl);

  const bustCache = (url) => `${url}?ts=${Date.now()}`;

  // 1. Трассируем открытие модального окна и показ оригинального маршрута
  useEffect(() => {
    if (!isOpen) return;

    const span = tracer.startSpan('AdjustedRouteModal.open', {
      attributes: {
        'initialMapUrl': initialMapUrl,
        'userPoints.count': userRoutePoints.length,
      }
    });

    try {
      setMapUrl(bustCache(initialMapUrl));
      onRouteProcessed(userRoutePoints);
      span.addEvent('originalRouteProcessed', {
        points_count: userRoutePoints.length
      });
    } catch (err) {
      span.recordException(err);
      console.error('[AdjustedRouteModal] error in open handler', err);
    } finally {
      span.end();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 2. Показать исходный маршрут
  const handleOriginalRoute = () => {
    const span = tracer.startSpan('AdjustedRouteModal.showOriginalRoute', {
      attributes: {
        'userPoints.count': userRoutePoints.length
      }
    });
    try {
      setMapUrl(bustCache(initialMapUrl));
      onRouteProcessed(userRoutePoints);
      span.addEvent('originalRouteProcessed', {
        points_count: userRoutePoints.length
      });
    } catch (err) {
      span.recordException(err);
      console.error('[AdjustedRouteModal] error in handleOriginalRoute', err);
    } finally {
      span.end();
    }
  };

  // 3. Показать скорректированный маршрут через сервер
  const handleCorrectedRoute = async () => {
    const span = tracer.startSpan('AdjustedRouteModal.processRoute', {
      attributes: { offset }
    });

    try {
      return await context.with(
        trace.setSpan(context.active(), span),
        async () => {
          span.addEvent('requestPreparing', { offset });
          const res = await fetch(
            `${process.env.REACT_APP_MEDIATOR_API}/process-route`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ offset }),
            }
          );
          span.addEvent('requestSent');

          if (!res.ok) {
            const err = new Error(`Server error: ${res.status}`);
            span.recordException(err);
            throw err;
          }

          const data = await res.json();
          span.addEvent('responseReceived', {
            success: data.success === true
          });

          if (data.success && Array.isArray(data.routePoints)) {
            setMapUrl(bustCache(data.mapUrl));
            span.addEvent('mapUrlUpdated', { mapUrl: data.mapUrl });

            onRouteProcessed(data.routePoints);
            span.addEvent('adjustedRouteProcessed', {
              points_count: data.routePoints.length
            });

            return data;
          } else {
            const err = new Error(`Bad response payload`);
            span.recordException(err);
            console.error('[AdjustedRouteModal] bad response', data);
            alert('Ошибка обработки маршрута на сервере');
            throw err;
          }
        }
      );
    } catch (err) {
      span.recordException(err);
      console.error('[AdjustedRouteModal] fetch failed', err);
      alert('Сбой запроса к серверу (см. консоль)');
      // Пробросим ошибку дальше, если нужно
      throw err;
    } finally {
      span.end();
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
        <button
          onClick={handleOriginalRoute}
          style={{ marginRight: '10px' }}
        >
          Изначальный маршрут
        </button>
        <button onClick={handleCorrectedRoute}>
          Скорректированный маршрут
        </button>
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