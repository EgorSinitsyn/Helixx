// src/App.js
import React, { useState, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import Sidebar from './components/Sidebar';

const App = () => {
  const [dronePosition, setDronePosition] = useState({ lat: 56.0153, lng: 92.8932 });
  const [route, setRoute] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Состояние для боковой панели
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Состояние для модального окна "Настройки карты"
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // Состояние для модального окна "История полетов"
  const [isMissionOpen, setIsMissionOpen] = useState(false); // Состояние для модального окна "Старт миссии"
  const [is3D, setIs3D] = useState(false); // Состояние для 2D/3D режима

  // Подключение к WebSocket серверу
  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080/telemetry');

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'POSITION') {
        setDronePosition({ lat: data.lat, lng: data.lng });
      } else if (data.type === 'ROUTE') {
        setRoute(data.coordinates);
      }
    };

    socket.onclose = () => console.log("WebSocket соединение закрыто");
    socket.onerror = (error) => console.error("Ошибка WebSocket", error);

    return () => socket.close();
  }, []);

  // Управление видимостью модальных окон
  const openSettings = () => setIsSettingsOpen(true);
  const closeSettings = () => setIsSettingsOpen(false);

  const openHistory = () => setIsHistoryOpen(true);
  const closeHistory = () => setIsHistoryOpen(false);

  const openMission = () => setIsMissionOpen(true);
  const closeMission = () => setIsMissionOpen(false);

  // Управление видимостью боковой панели
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Переключение между 2D и 3D режимами карты
  const toggle3DMode = () => setIs3D(!is3D);

  return (
    <div>
      <MapComponent dronePosition={dronePosition} route={route} is3D={is3D} />

      {/* Боковая панель */}
      <Sidebar
        onOpenSettings={openSettings}
        onOpenHistory={openHistory}
        onOpenMission={openMission}
        isOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      {/* Модальное окно для "Настройки карты" */}
      {isSettingsOpen && (
        <div style={styles.modal}>
          <h2>Настройки карты</h2>
          <p>Выберите режим видимости:</p>
          <div style={styles.toggleContainer}>
            <label>
              <input
                type="checkbox"
                checked={is3D}
                onChange={toggle3DMode}
              />
              Режим {is3D ? '3D' : '2D'}
            </label>
          </div>
          <button onClick={closeSettings} style={styles.closeButton}>Закрыть</button>
        </div>
      )}

      {/* Модальное окно для истории полетов */}
      {isHistoryOpen && (
        <div style={styles.modal}>
          <h2>История полетов</h2>
          <p>Просмотр истории выполненных миссий.</p>
          <button onClick={closeHistory} style={styles.closeButton}>Закрыть</button>
        </div>
      )}

      {/* Модальное окно для запуска миссии */}
      {isMissionOpen && (
        <div style={styles.modal}>
          <h2>Старт миссии</h2>
          <p>Установите параметры дрона и запустите миссию.</p>
          <button onClick={closeMission} style={styles.closeButton}>Закрыть</button>
        </div>
      )}
    </div>
  );
};

const styles = {
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '300px',
    padding: '20px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    zIndex: 1001,
  },
  closeButton: {
    marginTop: '10px',
    padding: '10px',
    fontSize: '16px',
    backgroundColor: '#444',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
  },
};

export default App;