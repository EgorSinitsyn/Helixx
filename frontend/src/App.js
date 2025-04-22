// App.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapComponent from './components/MapComponent';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import Papa from 'papaparse';
import './components/css/compass_style.css';
import DraggableModal from './components/DraggableModal.js';
import DroneInfoPanel from './components/DroneInfoPanel.js';
import MissionPlannerSidebar from './components/MissionPlannerSidebar.js';
import PlantationPlanner from './components/PlantationPlanner';
import { loadRoute, moveDroneToRoutePoints } from './components/DroneRouteManager.js';
import { sendMissionDataToServer } from './components/route_transfer.js';
import ConfirmRouteModal from './components/AdjustedRouteModal';

const CALIBRATION_LATITUDE = 55.139592;
const CALIBRATION_LONGITUDE = 37.962471;
const CALIBRATION_ALTITUDE = 0;


const App = () => {

  // Состояние калибровки (будет обновляться в модальном окне)
  const [calibrationCoordinates, setCalibrationCoordinates] = useState({
    lat: CALIBRATION_LATITUDE,
    lng: CALIBRATION_LONGITUDE,
    altitude: CALIBRATION_ALTITUDE,
    // heading: 0,
  });

  const [dronePosition, setDronePosition] = useState({
    lat: CALIBRATION_LATITUDE,
    lng: CALIBRATION_LONGITUDE,
    altitude: CALIBRATION_ALTITUDE,
    // heading: 0,
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

  // Поднимаем состояние для режима линейки
    const [isRulerOn, setIsRulerOn] = useState(false);

  // Для построения маршрута
  const [routePoints, setRoutePoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState([]);
  const [userRoutePoints, setUserRoutePoints] = useState([]); // копия точек, введенных пользователем
  const [isMissionBuilding, setIsMissionBuilding] = useState(false);
  const [confirmedRoute, setConfirmedRoute] = useState([]);       // для подтверждённого маршрута
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0); // для отслеживания направления (heading) к текущей точки маршрута

  // --- Новые состояния для PlantationPlanner ---
  const [isTreePlacingActive, setIsTreePlacingActive] = useState(false);
  const [selectedTreePoint, setSelectedTreePoint] = useState({ lat: '', lng: '', height: '', crownSize: '' });
  const [plantationPoints, setPlantationPoints] = useState([]);
  const [tempTreePoints, setTempTreePoints] = useState([]); // Временные (не сохранённые ещё) точки
  const [hoveredTreePoint, setHoveredTreePoint] = useState(null);   // Новое состояние для точки, над которой наведен курсор в списке

  // --- Сохраненные полигоны в планимере
  const [savedPolygons, setSavedPolygons] = useState(null);

  // --- Новые состояния для режима разметки рядов ---
  const [isRowMarkingActive, setIsRowMarkingActive] = useState(false);
  const [rowPoints, setRowPoints] = useState([]);
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);

  const handleOpenRowModal = useCallback(() => {
    console.log('Открытие окна разметки рядов');
    setIsRowMarkingActive(true);
  }, []);

  const handleCloseRowModal = useCallback(() => {
    console.log('Закрытие окна разметки рядов');
    setIsRowMarkingActive(false);
  }, []);

  // -- Модальное окно для корректировки маршрута
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const initialMapUrl = "http://localhost:5005/mission_map"; // URL для изначальной карты
  const finalMapUrl = "http://localhost:5005/mission_map_final"; // URL для финальной карты


  // Обновление высоты дрона
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

    setCurrentRouteIndex(0); // сброс индекса чтобы дрон корректно обновлял heading при старте новой миссии

    setIsMoving(true);  // Начинаем движение
    moveDroneToRoutePoints(
        dronePosition,
        setDronePosition,
        routePoints,
        setIsMoving,
        () => groundElevation,  // функция, возвращающая актуальное значение
        () => flightAltitudeRef.current, // функция, возвращающая актуальное значение
        () => setCurrentRouteIndex(prevIndex => prevIndex + 1)
    );
  }, [dronePosition, routePoints, groundElevation]); // добавляем groundElevation

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
    if (isRowMarkingActive) {
      return;
    }
    setTempTreePoints((prev) => [
      ...prev,
      { lat, lng, height: '', crownSize: '' },
    ]);
  }, [isRowMarkingActive]);

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

  // Функция отмены насаждений: очищает treePoints и tempTreePoints
  const handleCancelPlantation = () => {
    if (setPlantationPoints) {
      setPlantationPoints([]);
    }
    if (typeof setTempTreePoints === 'function') {
      setTempTreePoints([]);
    }
  };

  // Обработчики наведения/снятия наведения
  const handleTreeHover = useCallback((point, index) => {
    // Можно добавить номер точки, если требуется для аннотации
    setHoveredTreePoint({ ...point, number: index + 1 });
  }, []);

  const handleTreeLeave = useCallback(() => {
    setHoveredTreePoint(null);
  }, []);


  // --- Остальные обработчики (для миссий и настроек) ---

  // const flightAltitude = Number(dronePosition.altitude) - Number(groundElevation);

  const [flightAltitude, setFlightAltitude] = useState(0);
  const flightAltitudeRef = useRef(0);


  useEffect(() => {
    const newFlightAltitude = Number(dronePosition.altitude) - Number(groundElevation);
    // Обновляем стейт (чтобы интерфейс перерисовывался)
    setFlightAltitude(newFlightAltitude);
    // Одновременно пишем в ref (чтобы анимация могла читать «напрямую» без задержек)
    flightAltitudeRef.current = newFlightAltitude;
  }, [dronePosition.altitude, groundElevation]);

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
          heading: droneHeading, // добавляем значение heading
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


 // Универсальный обработчик кликов по карте
  const handleMapClick = useCallback((lat, lng, groundAltitude = 0) => {
    // условие для режима расстановки рядов деревьев
    if (isRowMarkingActive) {
      // console.log('Добавляем точку в rowPoints:', lat, lng);
      setRowPoints(prev => [...prev, { lat, lng }]);
    } else {
      // Маршрутные точки
      setSelectedPoint({
        lat,
        lng,
        groundAltitude,
        flightAltitude: '',
        altitude: groundAltitude
      });
      // Одиночные точки для насаждений
      if (isTreePlacingActive) {
        setSelectedTreePoint({ lat, lng, height: '', crownSize: '' });
      }
    }
  }, [isRowMarkingActive, isTreePlacingActive]);

  const handleAltitudeChange = useCallback((value, is3D) => {
    const numericValue = Number(value);
    setSelectedPoint(prev => {
      if (is3D) {
        // В 3D‑режиме обновляем надземную высоту и вычисляем абсолютную высоту
        return {
          ...prev,
          flightAltitude: numericValue,
          altitude: Number(prev.groundAltitude) + numericValue
        };
      } else {
        return {
          ...prev,
          // В 2D‑режиме обновляем только абсолютную высоту
          altitude: numericValue
        };
      }
    });
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

const handleConfirmRoute = useCallback(async () => {
  // 1) Подтверждаем маршрут в локальном состоянии
  setConfirmedRoute([...routePoints]);

  // 2) Снимок текущего (пользовательского) маршрута
   setUserRoutePoints(routePoints.map(p => ({ ...p })));

  // 3) Перед отправкой данных на сервер можно подготовить то, что мы хотим отправить
  // Допустим, мы хотим отправить:
  //   - dronePosition => droneData
  //   - routePoints
  //   - plantationPoints как savedPolygons (или пустой объект, если не нужно)
  const droneData = {
    lat: dronePosition.lat,
    lng: dronePosition.lng,
    altitude: dronePosition.altitude,
  };

  // Если вы хотите передавать свои «полилинии» вместо «полигонов», или вообще не передавать,
  // можно передать пустой объект/массив. Для примера возьмём plantationPoints.
  const polygonsToSend = savedPolygons || {
    type: 'FeatureCollection',
    features: []
  };

  try {
    // 4) Вызываем функцию отправки на бэкенд
    const response = await sendMissionDataToServer(
      droneData,       // droneData
      routePoints,     // routePoints
      savedPolygons    // savedPolygons или другое, что хотите отправить
    );

    console.log('[handleConfirmRoute] Ответ от сервера:', response);

    // При необходимости, если сервер вернул обновлённые данные (updatedRoutePoints),
    // вы можете обновить их в стейте:
    if (response.updatedRoutePoints) {
      setRoutePoints(response.updatedRoutePoints);
    }

  } catch (error) {
    console.error('[handleConfirmRoute] Ошибка при отправке данных:', error);
  }

  //5) Открываем модальное окно с картой
  setIsConfirmModalOpen(true);

}, [routePoints, dronePosition, plantationPoints]);

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
        currentRouteIndex={currentRouteIndex}
        updateDroneAltitude={updateDroneAltitude}
        isPlacingMarker={isMissionBuilding}
        isMissionBuilding={isMissionBuilding}
        isRulerOn={isRulerOn}
        setIsRulerOn={setIsRulerOn}
        isTreePlacingActive={isTreePlacingActive}
        plantationPoints={plantationPoints}
        savedPolygons={savedPolygons}
        setSavedPolygons={setSavedPolygons}
        tempTreePoints={tempTreePoints}
        hoveredTreePoint={hoveredTreePoint}
        onTreeMapClick={handleTreeMapClick}
        routePoints={routePoints}
        confirmedRoute={confirmedRoute}
        onMapClick={handleMapClick}
        isMoving={isMoving}
        isRowMarkingActive={isRowMarkingActive}
        rowPoints={rowPoints}
      />

      {isDroneInfoVisible && (
        <DroneInfoPanel
          latitude={dronePosition.lat}
          longitude={dronePosition.lng}
          altitude={dronePosition.altitude}
          flightAltitude={flightAltitude}
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
        onStartMission={handleStartRoute}
      />

      {isMissionBuilding && (
        <MissionPlannerSidebar
          isMissionBuilding={isMissionBuilding}
          is3D={is3D}
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
              style={{
                transform: `rotate(${-droneHeading}deg)`,
                transition: 'transform 2s ease',
                transitionProperty: 'transform',
              }}
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

      {/* Окно с корректировкой миссии */}
      {isConfirmModalOpen && (
          <ConfirmRouteModal
              isOpen={isConfirmModalOpen}
              onClose={() => setIsConfirmModalOpen(false)}
              initialMapUrl={initialMapUrl}
              routePoints={routePoints}          // ← исходные точки
              userRoutePoints={userRoutePoints}
              onRouteProcessed={(points) => {
                if (Array.isArray(points) && points.length) {
                  setRoutePoints(points);               // меняем текущий маршрут
                  setConfirmedRoute(points);            // чтобы дрон летел по новым
                }
              }}
            />
        )}

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
          onCancelPlantation={handleCancelPlantation}
          onConfirmPlantation={handleConfirmPlantation}
          treePoints={plantationPoints}
          onClose= {handleClosePlanner}
          onRemoveTreePoint={handleRemoveTreePoint}
          onTreeHover={handleTreeHover}
          onTreeLeave={handleTreeLeave}
          isRulerOn={isRulerOn}
          setIsRulerOn={setIsRulerOn}
          onOpenRowModal={handleOpenRowModal}
          onCloseRowModal={handleCloseRowModal}
          isRowModalOpen={isRowModalOpen}
          setIsRowModalOpen={setIsRowModalOpen}
          rowPoints={rowPoints}
          setRowPoints={setRowPoints}
          setPlantationPoints={setPlantationPoints}
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