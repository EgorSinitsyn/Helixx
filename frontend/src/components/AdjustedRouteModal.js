// ConfirmRouteModal.js
import React, { useState } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');


const ConfirmRouteModal = ({ isOpen, onClose, initialMapUrl, onRouteProcessed }) => {
  const [offset, setOffset] = useState(3); // значение по умолчанию
  const [mapUrl, setMapUrl] = useState(initialMapUrl);

  // Обработчик для кнопки "Изначальный маршрут"
  const handleOriginalRoute = () => {
    onClose();
  };

  // Обработчик для кнопки "Скорректированный маршрут"
  const handleCorrectedRoute = async () => {
    try {
      // Пример отправки запроса на сервер с параметром offset.
      // Функция sendCorrectedRouteRequest должна быть реализована отдельно и отправлять запрос на сервер.
      const response = await sendCorrectedRouteRequest({ offset });
      if (response.success) {
        // Обновляем URL карты. Можно добавить cache-buster, чтобы iframe точно перезагрузился.
        setMapUrl(response.mapUrl + '?t=' + new Date().getTime());
        // Можно также уведомить родительский компонент об успешном изменении маршрута
        onRouteProcessed && onRouteProcessed(response.mapUrl);
      } else {
        alert('Ошибка обработки маршрута на сервере');
      }
    } catch (error) {
      console.error('Ошибка запроса:', error);
      alert('Ошибка запроса к серверу');
    }
  };

  // Функция для отправки запроса на сервер (пример реализации)
  async function sendCorrectedRouteRequest({ offset }) {
    // Допустим, сервер доступен по адресу http://localhost:5005/process-route,
    // и ожидает JSON с offset.
    const res = await fetch('http://localhost:5005/process-route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ offset })
    });
    return res.json();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Подтверждение маршрута"
      style={customStyles}
    >
      <h2 style={{ textAlign: 'center' }}>Корректировщик маршрута</h2>
      {/* iframe с картой folium */}
      <iframe
        src={mapUrl}
        width="100%"
        height="400px"
        style={{ border: '1px solid #ccc' }}
        title="Карта маршрута"
      ></iframe>
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
        <button onClick={handleCorrectedRoute}>
          Скорректированный маршрут
        </button>
      </div>
    </Modal>
  );
};

// Определяем стили для модального окна и его overlay
const customStyles = {
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
    width: '70%',
    maxWidth: '800px',
    backgroundColor: '#333',      // серый фон
    color: 'white',               // белый текст
    border: 'none',
    padding: '20px'
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)'
  }
};

// Стили для элемента ввода OFFSET
const inputStyle = {
  marginLeft: '5px',
  width: '80px',
  padding: '5px',
  backgroundColor: '#777',
  color: 'white',
  border: '1px solid #777'
};

export default ConfirmRouteModal;