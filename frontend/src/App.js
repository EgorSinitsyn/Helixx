// App.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapComponent from './components/MapComponent';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import Papa from 'papaparse';
import './components/compass_style.css';
import DraggableModal from './components/DraggableModal.js';
import DroneInfoPanel from './components/DroneInfoPanel.js';
import MissionPlannerSidebar from './components/MissionPlannerSidebar.js';
import PlantationPlanner from './components/PlantationPlanner';
import { loadRoute, moveDroneToRoutePoints } from './components/DroneRouteManager.js';

const CALIBRATION_LATITUDE = 55.139592;
const CALIBRATION_LONGITUDE = 37.962471;
const CALIBRATION_ALTITUDE = '';


const App = () => {

  // Состояние калибровки (будет обновляться в модальном окне)
  const [calibrationCoordinates, setCalibrationCoordinates] = useState({
    lat: CALIBRATION_LATITUDE,
    lng: CALIBRATION_LONGITUDE,
    altitude: CALIBRATION_ALTITUDE,
  });

  const [dronePosition, setDronePosition] = useState({
    lat: CALIBRATION_LATITUDE,
    lng: CALIBRATION_LONGITUDE,
    altitude: CALIBRATION_ALTITUDE,
    heading: 0,
  });

  const markersRef = useRef([]); // Инициализация markersRef

  const [newDronePosition, setNewDronePosition] = useState({ lat: '', lng: '', altitude: '' });
  const [groundElevation, setGroundElevation] = useState(0); // получение высоты рельефа под дроном
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

  // Для построения маршрута
  const [routePoints, setRoutePoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState([]);
  const [isMissionBuilding, setIsMissionBuilding] = useState(false);
  const [confirmedRoute, setConfirmedRoute] = useState([]);       // для подтверждённого маршрута

  // --- Новые состояния для PlantationPlanner ---
  const [isTreePlacingActive, setIsTreePlacingActive] = useState(false);
  const [selectedTreePoint, setSelectedTreePoint] = useState({ lat: '', lng: '', height: '', crownSize: '' });
  const [plantationPoints, setPlantationPoints] = useState([]);
  const [tempTreePoints, setTempTreePoints] = useState([]); // Временные (не сохранённые ещё) точки
  const [hoveredTreePoint, setHoveredTreePoint] = useState(null);   // Новое состояние для точки, над которой наведен курсор в списке


  // Определяем callback для обновления координат точки насаждения
  const updateDroneAltitude = useCallback((newAltitude) => {
    setDronePosition((prev) => ({ ...prev, altitude: newAltitude }));
  }, []);

  const hideDroneInfoPanel = useCallback(() => setIsDroneInfoVisible(false), []);

  // Callback для установки высоты рельефа
  const handleCalibrationAltitude = (elevation) => {
    setDronePosition((prev) => ({
      ...prev,
      altitude: elevation,
    }));
  };

  const [isMoving, setIsMoving] = useState(false); // Флаг для отслеживания движения дрона

  const handleStartRoute = useCallback(() => {
    if (routePoints.length === 0) {
      alert('Маршрут пуст!');
      return;
    }
    setIsMoving(true);  // Начинаем движение
    moveDroneToRoutePoints(dronePosition, setDronePosition, routePoints, setIsMoving);
  }, [dronePosition, routePoints]);

  useEffect(() => {
    const initializeRoute = async () => {
      try {
        const routeGeoJson = await import('./route/route.geojson');
        const points = routeGeoJson.features.map((feature) => {
          const [lng, lat, altitude] = feature.geometry.coordinates;
          return {
            lat,
            lng,
            altitude,
          };
        });

        console.log('Маршрут успешно загружен:', points);

        if (points.length > 0) {
          setRoutePoints(points);
        }
      } catch (error) {
        console.error('Ошибка при загрузке маршрута:', error);
      }
    };

    initializeRoute();
  }, []);

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


  // --- Обработчики для PlantationPlanner ---

  // Переключение режима расстановки насаждений
  const toggleTreePlacing = useCallback(() => {
    // При активации режима насаждений выключаем режим миссий
    setIsMissionBuilding(false);
    setTempTreePoints([]);
    setIsTreePlacingActive(prev => !prev);
  }, []);


  // Когда пользователь кликает по карте в режиме посадки деревьев
  const handleTreeMapClick = useCallback((lat, lng) => {
    // Добавляем во временный массив
    setTempTreePoints((prev) => [
      ...prev,
      { lat, lng, height: '', crownSize: '' },
    ]);
  }, []);

  const handleTreeHeightChange = useCallback((height) => {
    setSelectedTreePoint(prev => ({ ...prev, height }));
  }, []);

  const handleCrownSizeChange = useCallback((crownSize) => {
    setSelectedTreePoint(prev => ({ ...prev, crownSize }));
  }, []);


  // Сохранение текущей точки из tempTreePoints в plantationPoints
  const confirmPlantation = useCallback(() => {
  // Очищаем все оставшиеся временные точки (если нужно)
  setTempTreePoints([]);
  // alert('Насаждения подтверждены и сохранены!');
  // setIsTreePlacingActive(false);
  }, [tempTreePoints]);
  // Подтверждаем все насаждения по кнопке
  const handleConfirmPlantation = useCallback(() => {
  confirmPlantation();
}, [confirmPlantation]);
  // Подтверждаем все насаждения при закрытии режима
  const handleClosePlanner = useCallback(() => {
  // Вызываем подтверждение насаждений
    setTempTreePoints([]);
    confirmPlantation();
    setIsTreePlacingActive(false);
    }, [confirmPlantation]);


  const handleSaveTreePoint = useCallback(() => {
    if (tempTreePoints.length > 0) {
      const lastTempPoint = tempTreePoints[tempTreePoints.length - 1];

      // Проверяем, что поля "height" и "crownSize" не пустые
      if (!lastTempPoint.height || !lastTempPoint.crownSize) {
        alert('Введите корректные данные');
        return;
      }

      // Переносим последнюю временную точку в "сохранённые"
      setPlantationPoints(prev => [...prev, lastTempPoint]);
      // Убираем её из списка временных
      setTempTreePoints(prev => prev.slice(0, -1));
    } else {
      alert('Нет точки для сохранения');
    }
  }, [tempTreePoints]);

  // Отмена последней точки
  const handleCancelTreePoint = useCallback(() => {
    if (tempTreePoints.length > 0) {
      // Если есть несохранённые — удаляем последнюю из temp
      setTempTreePoints(prev => prev.slice(0, -1));
    } else if (plantationPoints.length > 0) {
      // Иначе убираем последнюю сохранённую
      setPlantationPoints(prev => prev.slice(0, -1));
    }
  }, [tempTreePoints, plantationPoints]);

  // --- обработчики кликов/наведения мыши в plantationplanner.js
  // Обработчик удаления точки
  const handleRemoveTreePoint = useCallback((index) => {
    setPlantationPoints((prev) => prev.filter((_, i) => i !== index));
    setTempTreePoints((prev) => prev.filter((_, i) => i !== index));
    setHoveredTreePoint(null);
    // При изменении plantationPoints в MapComponent обновятся 2D‑символы и 3D‑модели
  }, []);

  // Обработчики наведения/снятия наведения
  const handleTreeHover = useCallback((point, index) => {
    // Можно добавить номер точки, если требуется для аннотации
    setHoveredTreePoint({ ...point, number: index + 1 });
  }, []);

  const handleTreeLeave = useCallback(() => {
    setHoveredTreePoint(null);
  }, []);


  // --- Остальные обработчики (для миссий и настроек) ---

  // Колбэк для получения высоты рельефа под дроном
  const handleGroundElevationChange = useCallback((newElevation) => {
    setGroundElevation(newElevation);
  }, []);

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
    setNewDronePosition({
      lat: dronePosition.lat,
      lng: dronePosition.lng,
      altitude: dronePosition.altitude || CALIBRATION_ALTITUDE,
    });
  }, [dronePosition]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setNewDronePosition({ lat: '', lng: '', altitude: '' });
  }, []);

  const openHistory = useCallback(() => setIsHistoryOpen(true), []);
  const openMission = useCallback(() => setIsMissionOpen(true), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), []);

  const openCalibration = useCallback(() => {
    setIsCalibrationOpen(true);
    setNewDronePosition({
      lat: dronePosition.lat,
      lng: dronePosition.lng,
      altitude: dronePosition.altitude || CALIBRATION_ALTITUDE,
    });
  }, [dronePosition]);

  const closeCalibration = useCallback(() => setIsCalibrationOpen(false), []);

  const handleFileUpload = useCallback((event) => {
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
  }, []);

  const handleConfirmDronePosition = useCallback(() => {
    const { lat, lng, altitude } = newDronePosition;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    // Не используем введённое значение высоты в 3D‑режиме
    if (!isNaN(latNum) && !isNaN(lngNum) && lat !== '' && lng !== '') {
      setIsDroneInfoVisible(true);
      if (is3D) {
        // Обновляем только координаты калибровки, высота пересчитается MapComponent
        setCalibrationCoordinates({
          lat: latNum,
          lng: lngNum,
          altitude: CALIBRATION_ALTITUDE, // fallback, если запрос не сработает
        });
        // Обновляем позицию дрона: lat и lng обновляются, высота остаётся прежней пока MapComponent не пересчитает
        setDronePosition((prev) => ({
          ...prev,
          lat: latNum,
          lng: lngNum,
        }));
      } else {
        // Для 2D используем введённое значение высоты
        const altitudeNum = parseFloat(altitude);
        if (!isNaN(altitudeNum)) {
          setDronePosition({
            lat: latNum,
            lng: lngNum,
            altitude: altitudeNum,
            heading: droneHeading,
          });
        }
      }
      console.log("Новое положение дрона:", { lat: latNum, lng: lngNum });
    } else {
      alert("Введите корректные координаты.");
    }
  }, [newDronePosition, is3D, droneHeading]);

  const handleHeadingChange = useCallback((angle) => {
    setDroneHeading(angle);
  }, []);

  const startRouteBuilding = useCallback(() => {
    // При активации режима миссий выключаем режим насаждений
    setIsTreePlacingActive(false);
    setIsMissionBuilding(true);
  }, []);

  const handleMapClick = useCallback((lat, lng, groundAltitude = 0) => {
    setSelectedPoint({
      lat,
      lng,
      groundAltitude,
      flightAltitude: '', // Значение по умолчанию – пустая строка
      altitude: groundAltitude // Итоговая высота на начальном этапе
    });

    // Если в режиме расстановки деревьев, можно установить и точку для насаждения
    if (isTreePlacingActive) {
      setSelectedTreePoint({ lat, lng, height: '', crownSize: '' });
    }
  }, [isTreePlacingActive]);

  const handleAltitudeChange = useCallback((flightAltitude) => {
    setSelectedPoint(prev => ({
      ...prev,
      flightAltitude, // Теперь это строка, введённая пользователем
      altitude: Number(prev.groundAltitude) + Number(flightAltitude) // Итоговая высота
    }));
  }, []);

  const handleSavePoint = useCallback(() => {
    if (selectedPoint.lat && selectedPoint.lng && selectedPoint.altitude) {
      setRoutePoints((prev) => [...prev, selectedPoint]);
      setSelectedPoint({ lat: '', lng: '', altitude: '' });
    } else {
      alert("Введите корректные координаты и высоту.");
    }
  }, [selectedPoint]);


  const cancelRoute = useCallback(() => {
    setRoutePoints([]);
    setSelectedPoint({ lat: '', lng: '', altitude: '' });
  }, []);


  const removeLastPoint = useCallback(() => {
    // 1) Если есть «несохранённая» точка (selectedPoint), «откатываем» её
    if (selectedPoint.lat !== '' || selectedPoint.lng !== '') {
      // Сбросим selectedPoint в пустое состояние
      setSelectedPoint({
        lat: '',
        lng: '',
        flightAltitude: '',
        groundAltitude: 0,
      });
    }
    // 2) Иначе, если нет несохранённой, но есть «сохранённые» (routePoints)
    else if (routePoints.length > 0) {
      setRoutePoints(prev => prev.slice(0, -1));
    }
  }, [selectedPoint, routePoints]);

  // Удаление точки маршрута по ❌
  const handleRemoveRoutePoint = (index) => {
    setRoutePoints((prev) => prev.filter((_, i) => i !== index));
  };

  const saveRoute = useCallback(() => {
    const geoJson = {
      type: "FeatureCollection",
      features: routePoints.map((point, index) => ({
        type: "Feature",
        properties: { id: index + 1 },
        geometry: {
          type: "Point",
          coordinates: [parseFloat(point.lng), parseFloat(point.lat), parseFloat(point.altitude)],
        },
      })),
    };
    console.log("Маршрут в формате GeoJSON:", JSON.stringify(geoJson, null, 2));
  }, [routePoints]);

  const handleConfirmRoute = useCallback(() => {
    setConfirmedRoute([...routePoints]);
  }, [routePoints]);

  return (
    <div>
      <MapComponent
        dronePosition={dronePosition}
        onCalibrationAltitude={handleCalibrationAltitude} // калибровка высоты дрона относительно рельефа
        onGroundElevationChange={handleGroundElevationChange}
        calibrationCoordinates={calibrationCoordinates}
        route={confirmedRoute}
        is3D={is3D}
        cellTowers={cellTowers}
        isCoverageEnabled={isCoverageEnabled}
        droneHeading={droneHeading}
        setDroneHeading={setDroneHeading}
        updateDroneAltitude={updateDroneAltitude}
        isPlacingMarker={isMissionBuilding}
        isMissionBuilding={isMissionBuilding}
        isTreePlacingActive={isTreePlacingActive}
        plantationPoints={plantationPoints}
        tempTreePoints={tempTreePoints}
        hoveredTreePoint={hoveredTreePoint}
        onTreeMapClick={handleTreeMapClick}
        routePoints={routePoints}
        confirmedRoute={confirmedRoute}
        onMapClick={handleMapClick}
        isMoving={isMoving}
      />

      {isDroneInfoVisible && (
        <DroneInfoPanel
          latitude={dronePosition.lat}
          longitude={dronePosition.lng}
          altitude={dronePosition.altitude}
          groundElevation={groundElevation}
          heading={droneHeading}
          onHide={hideDroneInfoPanel}
        />
      )}

      <Sidebar
        onOpenSettings={openSettings}
        onOpenCalibration={openCalibration}
        onOpenHistory={openHistory}
        onOpenMission={startRouteBuilding}
        onToggleTreePlacing={toggleTreePlacing}
        isOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        onStartMission={() => moveDroneToRoutePoints(dronePosition, setDronePosition, routePoints, setIsMoving)}
      />

      {isMissionBuilding && (
        <MissionPlannerSidebar
          isMissionBuilding={isMissionBuilding}
          routePoints={routePoints}
          onSaveRoute={saveRoute}
          onRemoveLastPoint={removeLastPoint}
          onRemoveRoutePoint={handleRemoveRoutePoint}
          onCancelRoute={cancelRoute}
          onConfirmRoute={handleConfirmRoute}
          selectedPoint={selectedPoint}
          onAltitudeChange={handleAltitudeChange}
          calibratedAltitude={dronePosition.altitude}
          onSavePoint={handleSavePoint}
          onClose={() => setIsMissionBuilding(false)}
        />
      )}

      {/* Модальное окно для настроек карты */}
      <DraggableModal key="settings" isOpen={isSettingsOpen} onClose={closeSettings}>
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

      {/* Модальное окно для калибровки дрона */}
      <DraggableModal key="calibration" isOpen={isCalibrationOpen} onClose={closeCalibration}>
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
              style={{ transform: `rotate(${-droneHeading}deg)` }}
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

      {/* Отображение PlantationPlanner, если включён режим расстановки насаждений */}
      {isTreePlacingActive && (
        <PlantationPlanner
          selectedPoint={
            tempTreePoints.length
              ? tempTreePoints[tempTreePoints.length - 1] // берем последнюю из temp
              : { lat: '', lng: '', height: '', crownSize: '' }
          }
          onTreeHeightChange={(newHeight) => {
            // Меняем height в последней temp-точке (или иной логикой)
            setTempTreePoints((prev) => {
              if (!prev.length) return [];
              const updated = [...prev];
              updated[updated.length - 1].height = newHeight;
              return updated;
            });
          }}
          onCrownSizeChange={(newCrownSize) => {
            setTempTreePoints((prev) => {
              if (!prev.length) return [];
              const updated = [...prev];
              updated[updated.length - 1].crownSize = newCrownSize;
              return updated;
            });
          }}
          onSavePoint={handleSaveTreePoint}
          onCancelPoint={handleCancelTreePoint}
          onConfirmPlantation={handleConfirmPlantation}
          treePoints={plantationPoints}
          onClose= {handleClosePlanner}
          onRemoveTreePoint={handleRemoveTreePoint}
          onTreeHover={handleTreeHover}
          onTreeLeave={handleTreeLeave}
        />
      )}
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

export default React.memo(App);