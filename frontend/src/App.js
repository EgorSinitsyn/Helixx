// src/App.js
import React, { useState, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import Papa from 'papaparse';
import './components/compass_style.css';
import DraggableModal from './components/DraggableModal.js';
import DroneInfoPanel from './components/DroneInfoPanel.js';

const CALIBRATION_LATITUDE = 55.967398;
const CALIBRATION_LONGITUDE = 93.128459;
const CALIBRATION_ALTITUDE = 370;

const App = () => {
  const [dronePosition, setDronePosition] = useState({
    lat: CALIBRATION_LATITUDE,
    lng: CALIBRATION_LONGITUDE,
    altitude: CALIBRATION_ALTITUDE,
    heading: 0,
  });

  const [newDronePosition, setNewDronePosition] = useState({ lat: '', lng: '', altitude: '' });
  const [route, setRoute] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMissionOpen, setIsMissionOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [cellTowers, setCellTowers] = useState([]);
  const [isCoverageEnabled, setIsCoverageEnabled] = useState(true);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [droneHeading, setDroneHeading] = useState(0);
  const [isDroneInfoVisible, setIsDroneInfoVisible] = useState(false);

  const updateDroneAltitude = (newAltitude) => {
    setDronePosition((prev) => ({ ...prev, altitude: newAltitude }));
  };

  // Функция для скрытия панели
  const hideDroneInfoPanel = () => setIsDroneInfoVisible(false);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080/telemetry');

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'POSITION') {
        setDronePosition((prevPosition) => ({
          ...prevPosition,
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
      altitude: dronePosition.altitude || CALIBRATION_ALTITUDE,
    });
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
    setNewDronePosition({ lat: '', lng: '', altitude: '' });
  };

  const openHistory = () => setIsHistoryOpen(true);
  const openMission = () => setIsMissionOpen(true);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const openCalibration = () => {
    setIsCalibrationOpen(true);
    setNewDronePosition({
      lat: dronePosition.lat,
      lng: dronePosition.lng,
      altitude: dronePosition.altitude || CALIBRATION_ALTITUDE,
    });
  };

  const closeCalibration = () => setIsCalibrationOpen(false);

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
      error: (error) => console.error("Ошибка при обработке CSV:", error),
    });
  };

  const handleConfirmDronePosition = () => {
    const { lat, lng, altitude } = newDronePosition;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const altitudeNum = parseFloat(altitude);

    setIsDroneInfoVisible(true);

    if (!isNaN(latNum) && !isNaN(lngNum) && lat !== '' && lng !== '' && !isNaN(altitudeNum)) {
      setDronePosition({
        lat: latNum,
        lng: lngNum,
        altitude: altitudeNum,
        heading: droneHeading,
      });
      console.log("Новое положение дрона:", { lat: latNum, lng: lngNum, altitude: altitudeNum, heading: droneHeading });
    } else {
      alert("Введите корректные координаты и дельту высоты дрона.");
    }
  };

  const handleHeadingChange = (angle) => {
    setDroneHeading(angle);
  };

  return (
      <div>
        <MapComponent
            dronePosition={dronePosition}
            route={route}
            is3D={is3D}
            cellTowers={cellTowers}
            isCoverageEnabled={isCoverageEnabled}
            droneHeading={droneHeading}
            updateDroneAltitude={updateDroneAltitude}
        />

        {isDroneInfoVisible && (
            <DroneInfoPanel
                latitude={dronePosition.lat}
                longitude={dronePosition.lng}
                altitude={dronePosition.altitude}
                heading={droneHeading}
                onHide={hideDroneInfoPanel} // передаем функцию для скрытия
            />
        )}

        <Sidebar
            onOpenSettings={openSettings}
            onOpenHistory={openHistory}
            onOpenMission={openMission}
            isOpen={isSidebarOpen}
            onToggleSidebar={toggleSidebar}
            onOpenCalibration={openCalibration}
        />

        <DraggableModal isOpen={isSettingsOpen} onClose={closeSettings}>
          <h2>Настройки карты</h2>
          <div style={styles.selectorContainer}>
            <label style={styles.label}>Режим сцены</label>
            <select
                value={is3D ? "3D" : "2D"}
                onChange={(e) => setIs3D(e.target.value === "3D")}
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
            <button onClick={() => setIsCoverageEnabled(!isCoverageEnabled)} style={styles.toggleButton}>
              {isCoverageEnabled ? '✔' : '✖'}
            </button>
          </div>
        </DraggableModal>

        <DraggableModal isOpen={isCalibrationOpen} onClose={closeCalibration}>
          <h3>Калибровка дрона</h3>
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
          <div className="compass-container">
            <div className="compass">
              <div className="compass-center"></div>
              <div className="arrow-south"></div>
              <div className="arrow"></div>
              <div
                  className="compass-rotatable"
                  style={{ transform: `rotate(${droneHeading}deg)` }}
              >
                <div className="tick tick-0"></div>
                <div className="tick tick-45"></div>
                <div className="tick tick-90"></div>
                <div className="tick tick-135"></div>
                <div className="tick tick-180"></div>
                <div className="tick tick-225"></div>
                <div className="tick tick-270"></div>
                <div className="tick tick-315"></div>
                <div className="compass-directions">
                  <div className="north">С</div>
                  <div className="east">В</div>
                  <div className="south">Ю</div>
                  <div className="west">З</div>
                </div>
              </div>
            </div>
            <input
                type="range"
                min="0"
                max="360"
                value={droneHeading}
                onChange={(e) => handleHeadingChange(parseFloat(e.target.value))}
                className="slider"
            />
            <p>Направление: {droneHeading}°</p>
          </div>
          <button onClick={handleConfirmDronePosition} style={styles.confirmButton}>Подтвердить местоположение</button>
        </DraggableModal>
      </div>
  );
};

const styles = {
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