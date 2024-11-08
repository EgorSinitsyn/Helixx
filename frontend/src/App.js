// src/App.js
import React, { useState, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import Papa from 'papaparse';

const App = () => {
  const [dronePosition, setDronePosition] = useState({ lat: 55.967398, lng: 93.128459, altitude: 370 });
  const [newDronePosition, setNewDronePosition] = useState({ lat: '', lng: '', altitude: 0 });
  const [route, setRoute] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMissionOpen, setIsMissionOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [cellTowers, setCellTowers] = useState([]);
  const [isCoverageEnabled, setIsCoverageEnabled] = useState(true);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080/telemetry');

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'POSITION') {
        setDronePosition((prevPosition) => ({
          lat: data.lat,
          lng: data.lng,
          altitude: data.altitude !== undefined ? data.altitude : prevPosition.altitude,
        }));
      } else if (data.type === 'ROUTE') {
        setRoute(data.coordinates);
      }
    };

    socket.onclose = () => console.log("WebSocket соединение закрыто");
    socket.onerror = (error) => console.error("Ошибка WebSocket", error);

    return () => socket.close();
  }, []);

  const openSettings = () => {
    setIsSettingsOpen(true);
    setNewDronePosition({
      lat: dronePosition.lat,
      lng: dronePosition.lng,
      altitude: 0,
    });
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
    setNewDronePosition({ lat: '', lng: '', altitude: '' });
  };

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
            );
        setCellTowers(towers);
      },
      error: (error) => console.error("Ошибка при обработке CSV:", error)
    });
  };

  const toggleCoverage = () => setIsCoverageEnabled(!isCoverageEnabled);

  // Обновление местоположения дрона: новое значение высоты было равно текущей высоте плюс введённой дельты
  const handleConfirmDronePosition = () => {
    const { lat, lng, altitude } = newDronePosition;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const altitudeDelta = parseFloat(altitude);

    if (
        !isNaN(latNum) &&
        !isNaN(lngNum) &&
        lat !== '' &&
        lng !== '' &&
        !isNaN(altitudeDelta)
    ) {
      setDronePosition((prevPosition) => ({
        lat: latNum,
        lng: lngNum,
        altitude: prevPosition.altitude + altitudeDelta, // Добавляем дельту к текущей высоте
      }));
      closeSettings();
    } else {
      alert("Введите корректные координаты и дельту высоты дрона.");
    }
  };

  return (
      <div>
        <MapComponent
            dronePosition={dronePosition}
            route={route}
            is3D={is3D}
            cellTowers={cellTowers}
            isCoverageEnabled={isCoverageEnabled}
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
              <div style={styles.coverageControl}>
                <span>ВКЛ. отображение сигнала вышек</span>
                <button onClick={toggleCoverage} style={styles.toggleButton}>
                  {isCoverageEnabled ? '✔' : '✖'}
                </button>
              </div>
              <h3>Установить местоположение дрона</h3>
              <input
                  type="number"
                  placeholder="Широта"
                  value={newDronePosition.lat}
                  onChange={(e) => setNewDronePosition({ ...newDronePosition, lat: e.target.value })}
              />
              <input
                  type="number"
                  placeholder="Долгота"
                  value={newDronePosition.lng}
                  onChange={(e) => setNewDronePosition({ ...newDronePosition, lng: e.target.value })}
              />
              <input
                  type="number"
                  placeholder="Высота"
                  value={newDronePosition.altitude}
                  onChange={(e) => setNewDronePosition({ ...newDronePosition, altitude: e.target.value })}
              />
              <button onClick={handleConfirmDronePosition} style={styles.confirmButton}>Подтвердить местоположение</button>
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
  coverageControl: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '20px',
  },
  toggleButton: {
    padding: '5px 10px',
    fontSize: '16px',
    backgroundColor: '#444',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  confirmButton: {
    marginTop: '10px',
    padding: '10px',
    fontSize: '16px',
    backgroundColor: '#008CBA',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
};

export default App;