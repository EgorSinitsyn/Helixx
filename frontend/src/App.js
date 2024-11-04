// src/App.js
import React, { useState, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import Papa from 'papaparse'; // Для парсинга CSV файлов

const App = () => {
  const [dronePosition, setDronePosition] = useState({ lat: 56.0153, lng: 92.8932 });
  const [route, setRoute] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMissionOpen, setIsMissionOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [cellTowers, setCellTowers] = useState([]); // Состояние для хранения вышек

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

  const openSettings = () => setIsSettingsOpen(true);
  const closeSettings = () => setIsSettingsOpen(false);
  const openHistory = () => setIsHistoryOpen(true);
  const closeHistory = () => setIsHistoryOpen(false);
  const openMission = () => setIsMissionOpen(true);
  const closeMission = () => setIsMissionOpen(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleSceneModeChange = (event) => {
    setIs3D(event.target.value === "3D");
  };

// Обработка загрузки файла CSV
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    complete: (results) => {
      // Преобразуем данные из CSV в формат [{lat, lng, radius}, ...]
      const towers = results.data
        .map(row => ({
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude),
          radius: parseFloat(row.radius),
        }))
        .filter(tower =>
          !isNaN(tower.lat) &&
          !isNaN(tower.lng) &&
          !isNaN(tower.radius)
        ); // Отфильтровываем некорректные данные
      setCellTowers(towers);
    },
    error: (error) => console.error("Ошибка при обработке CSV:", error)
  });
};

  return (
    <div>
      <MapComponent
        dronePosition={dronePosition}
        route={route}
        is3D={is3D}
        cellTowers={cellTowers} // Передаем вышки на карту
      />

      <Sidebar
        onOpenSettings={openSettings}
        onOpenHistory={openHistory}
        onOpenMission={openMission}
        isOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      {isSettingsOpen && (
        <div style={styles.modal}>
          <h2>Настройки карты</h2>
          <div style={styles.selectorContainer}>
            <label style={styles.label}>Режим сцены</label>
            <select
              value={is3D ? "3D" : "2D"}
              onChange={handleSceneModeChange}
              style={styles.selector}
            >
              <option value="2D">2D</option>
              <option value="3D">3D</option>
            </select>
          </div>
          <div style={{ marginTop: '20px' }}>
            <p>Импортировать локации сотовых вышек (CSV):</p>
            <input type="file" accept=".csv" onChange={handleFileUpload} />
          </div>
          <button onClick={closeSettings} style={styles.closeButton}>Закрыть</button>
        </div>
      )}

      {isHistoryOpen && (
        <div style={styles.modal}>
          <h2>История полетов</h2>
          <p>Просмотр истории выполненных миссий.</p>
          <button onClick={closeHistory} style={styles.closeButton}>Закрыть</button>
        </div>
      )}

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
  selectorContainer: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
  },
  label: {
    marginRight: '10px',
    fontSize: '16px',
  },
  selector: {
    fontSize: '16px',
    padding: '5px',
  },
};

export default App;