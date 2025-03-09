// MapComponent.js

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import * as turf from '@turf/turf';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import towerIcon from '../assets/tower-icon.png';
import galochkaIcon from '../assets/galochka-planiemer.png';
import greenCircle from '../assets/green_circle.png';
import TargetIcon from '../assets/target_icon.png';

import { initTree3DLayers, updateTree3DLayers, removeTree3DLayers } from '../components/trees3D.js';
import '../components/drone_style.css';
import '../components/geomarker_style.css';
import '../components/custom_gl_draw.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';


mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

function MapComponent({
                        dronePosition,
                        onCalibrationAltitude,
                        onGroundElevationChange,
                        calibrationCoordinates,
                        route: confirmedRoute,
                        is3D,
                        cellTowers,
                        isCoverageEnabled,
                        droneHeading,
                        currentRouteIndex,
                        setDroneHeading,
                        isPlacingMarker,
                        onMapClick,
                        onTreeMapClick,
                        routePoints,
                        plantationPoints,
                        tempTreePoints,
                        hoveredTreePoint,
                        isMissionBuilding,
                        isTreePlacingActive,
                        isMoving
                      }) {
  // -------------------------------
  // REFS для карты, слоёв, линейки
  // -------------------------------
  const mapContainerRef = useRef(null);
  const [isTerrainReady, setIsTerrainReady] = useState(false); // состояние для включения рельефа
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const markersRef = useRef([]); // Храним маркеры маршрута
  const routeLayerId = 'route-line';

  // -------------------------------
  // REFS для маркеров деревьев
  // -------------------------------
  const [treeMarkers, setTreeMarkers] = useState([]);   // Состояние для хранения дерева-маркеров
  const [treeOverlay, setTreeOverlay] = useState(null);  // Храним ссылку на текущий 3D overlay для деревьев для удаления при 2d

  // состояние для управления камерой в 2d режиме
  const [userAdjusted, setUserAdjusted] = useState(false);

  // -------------------------------
  // Состояния для режима ЛИНЕЙКИ
  // -------------------------------
  const [isRulerOn, setIsRulerOn] = useState(false);

  // Храним данные для измерений
  const geojsonRef = useRef({
    type: 'FeatureCollection',
    features: []
  });
  const lineStringRef = useRef({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: []
    }
  });
  // Отображаемое расстояние
  const [totalDistance, setTotalDistance] = useState('');


  // -------------------------------
  // Состояния для режима ПЛАНИМЕРА
  // -------------------------------
  const [isPlanimeterOn, setIsPlanimeterOn] = useState(false);
  const [roundedArea, setRoundedArea] = useState(null);
  const [savedPolygons, setSavedPolygons] = useState(null); // сохраняемые полигоны

  // Ref для экземпляра MapboxDraw
  const drawRef = useRef(null);

  const togglePlanimeter = () => {
    // if (isMissionBuilding) return; // Если идёт построение миссии – пропускаем. Во избежании конфликтов

    setIsPlanimeterOn((prev) => {
      if (prev) {
        // Режим отключается
        if (mapRef.current && drawRef.current) {

          // Удалять метки при выходе не будем – исключаем deleteAll().
          // drawRef.current.deleteAll();

          // можно снять только саму «панель» управления:
          mapRef.current.removeControl(drawRef.current);

          drawRef.current = null;
        }
        setRoundedArea(null);
        return false;
      }
      return true;
    });
  };

  // Сохраняем полигоны, размеченные через планимер
  const handleSavePolygons = () => {
    if (drawRef.current) {
      const drawnData = drawRef.current.getAll();
      if (drawnData.features && drawnData.features.length) {
        setSavedPolygons(drawnData);
        alert('Фигуры сохранены!');
      } else {
        alert('Нет нарисованных фигур для сохранения.');
      }
    }
  };

  // -------------------------------
  // ФУНКЦИЯ: построить (или обновить) маршрут / маркеры
  // -------------------------------
  const renderRoute = () => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    // Удаляем существующие слои маршрута
    if (mapRef.current.getSource(routeLayerId)) {
      mapRef.current.removeLayer(routeLayerId);
      mapRef.current.removeSource(routeLayerId);
    }
    if (mapRef.current.getSource('drone-to-first-point')) {
      mapRef.current.removeLayer('drone-to-first-point');
      mapRef.current.removeSource('drone-to-first-point');
    }

    // 1) Линия маршрута (если 2+ точек)
    if (confirmedRoute.length > 1) {
      const coordinates = confirmedRoute.map((point) => [point.lng, point.lat]);
      const routeGeoJson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates }
      };
      mapRef.current.addSource(routeLayerId, { type: 'geojson', data: routeGeoJson });
      mapRef.current.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)',
          'line-width': 2
        }
      });
    }

    // 2) Линия от дрона к первой точке
    if (confirmedRoute.length > 0) {
      const firstPoint = confirmedRoute[0];
      const droneToFirstPointGeoJson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [dronePosition.lng, dronePosition.lat],
            [firstPoint.lng, firstPoint.lat]
          ]
        }
      };
      mapRef.current.addSource('drone-to-first-point', {
        type: 'geojson',
        data: droneToFirstPointGeoJson
      });
      mapRef.current.addLayer({
        id: 'drone-to-first-point',
        type: 'line',
        source: 'drone-to-first-point',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)',
          'line-width': 2,
          'line-dasharray': [2, 4]
        }
      });
    }

    // 3) Маркеры точек маршрута
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = confirmedRoute.map((point) => {
      const markerElement = document.createElement('div');
      markerElement.className = 'route-marker';
      return new mapboxgl.Marker({
        element: markerElement,
        pitchAlignment: 'map',
        rotationAlignment: 'map'
      })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);
    });
  };

  // Обработчик для кнопки "target-button" (зум на позицию дрона)
  const handleTargetClick = useCallback(() => {
    if (!mapRef.current) return;
    const { lng, lat } = dronePosition;
    mapRef.current.flyTo({
      center: [dronePosition.lng, dronePosition.lat],
      zoom: is3D ? 18 : 16,       // примерный зум для 3D и 2D режимов
      pitch: is3D ? 60 : 0,       // наклон камеры в 3D, 0 в 2D
      bearing: is3D ? -17.6 : 0, // ориентация камеры для 3D или 0 для 2D
      offset: is3D ? [0, 500] : [0, 0],// для 3D сдвигаем камеру на 100 пикселей вниз
      speed: 1.2,               // скорость анимации
      curve: 1,                 // кривая анимации
      easing: (t) => t,         // функция сглаживания
    });
  }, [dronePosition, is3D]);

  // -------------------------------
  // ИНИЦИАЛИЗАЦИЯ КАРТЫ (Создается 1 раз)
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [dronePosition.lng, dronePosition.lat],
        zoom: 15,
        pitch: is3D ? 60 : 0,
        bearing: is3D ? -17.6 : 0,
        antialias: true
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Переносим кнопки масштаба
      const controlsContainer = document.querySelector('.mapboxgl-ctrl-top-right');
      if (controlsContainer) {
        controlsContainer.classList.add('custom-map-controls'); // CSS класс для сдвига
      }

      // Когда карта загрузилась
      mapRef.current.on('load', () => {
        // 1) ИСТОЧНИК/СЛОИ для режима линейки
        mapRef.current.addSource('measure-geojson', {
          type: 'geojson',
          data: geojsonRef.current
        });
        mapRef.current.addLayer({
          id: 'measure-points',
          type: 'circle',
          source: 'measure-geojson',
          paint: {
            'circle-radius': 5,
            'circle-color': '#000'
          },
          filter: ['==', '$type', 'Point']
        });
        mapRef.current.addLayer({
          id: 'measure-lines',
          type: 'line',
          source: 'measure-geojson',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#000',
            'line-width': 2.5
          },
          filter: ['==', '$type', 'LineString']
        });

        // 2) ИСТОЧНИК/СЛОИ для дрона
        if (is3D) {
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14
          });
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });

          droneLayerRef.current = addDroneModel(mapRef.current, dronePosition);
        } else {
          droneMarkerRef.current = addDroneMarker(mapRef.current, dronePosition);
        }
      });

      // Добавим обработчик ошибок загрузки стиля
      mapRef.current.on('error', (e) => {
        console.error('[MapComponent] Ошибка загрузки карты или стиля:', e);
      });

      // Логируем прогресс загрузки
      mapRef.current.on('styledata', () => {
        // console.log('[MapComponent] Данные стиля начинают загружаться');
      });

    }

    return () => {
      if (mapRef.current) {
        mapRef.current?.remove();
        mapRef.current = null;
      }
    };
  }, []);


  // UseEffect для режима 3D (is3D)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (is3D) {
      // 1) Если стиль УЖЕ загружен, сразу вызываем setTerrain
      if (map.isStyleLoaded()) {
        enable3D(map);
      }
      // 2) Если нет, ждём событие style.load
      else {
        const onLoad = () => {
          enable3D(map);
          map.off('style.load', onLoad);
        };
        map.on('style.load', onLoad);
      }
    } else {
      // Для отключения 3D аналогично
      if (map.isStyleLoaded()) {
        disable3D(map);
      } else {
        const onLoad = () => {
          disable3D(map);
          map.off('style.load', onLoad);
        };
        map.on('style.load', onLoad);
      }
    }
  }, [is3D]);

  // Включение 3D
  function enable3D(map) {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
      // console.log('[MapComponent] Источник mapbox-dem добавлен');
    } else {
      // console.log('[MapComponent] Источник mapbox-dem уже существует');
    }

    try {
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      // console.log('[MapComponent] setTerrain вызван');
    } catch (error) {
      // console.error('[MapComponent] Ошибка при установке рельефа:', error);
    }

    try {
      map.setLights({
        // flat: {
        //   type: 'flat',
        //   properties: {
        //     intensity: 0.5,
        //     anchor: 'map'
        //   }
        // }
          anchor: 'map',
          intensity: 0.5
      });
      // console.log('[MapComponent] setLights установлен');
    } catch (error) {
      // console.error('[MapComponent] Ошибка в setLights:', error);
    }

    map.once('terrain', () => {
      setIsTerrainReady(true);
      // updateTree3DLayers(map,plantationPoints,overlay);
      // console.log('[MapComponent] Рельеф загружен, isTerrainReady = true');
    });


    // Расширенная диагностика
    setTimeout(() => {
      if (map.getTerrain()) {
        setIsTerrainReady(true);
        // console.log('[MapComponent] (Проверка) Рельеф загружен через timeout, isTerrainReady = true');
      }
    }, 3000);

  }

  // Выключение 3D
  function disable3D(map) {
    // Устанавливаем terrain в null
    map.setTerrain(null);

    if (map.getSource('mapbox-dem')) {
      map.removeSource('mapbox-dem');
    }

    setIsTerrainReady(false);
  }

  // Подпишитесь на события карты, которые сигнализируют о начале управления камерой (например, ‘dragstart’ или ‘rotatestart’):
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleUserAdjust = () => {
      setUserAdjusted(true);
    };

    // События, сигнализирующие о начале перемещения или поворота
    map.on('dragstart', handleUserAdjust);
    map.on('rotatestart', handleUserAdjust);

    // Не забудьте убрать слушатели при размонтировании
    return () => {
      map.off('dragstart', handleUserAdjust);
      map.off('rotatestart', handleUserAdjust);
    };
  }, []);

  // При переходе в 2D режим сбрасывайте угол и наклон только один раз, если пользователь ещё не вмешивался:
  useEffect(() => {
    const map = mapRef.current;
    if (!is3D && map && !userAdjusted) {
      // Сброс только при переходе в 2D и если пользователь ещё не изменял камеру
      map.setPitch(0);
      map.setBearing(0);
    }
  }, [is3D, userAdjusted]);


  // useEffect для расставления вышек и зон покрытия
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Метод A: если стиль еще не загружен, прекращаем выполнение эффекта
    if (!map.isStyleLoaded()) return;

    // Удаляем старые слои/источники вышек (если есть)
    map.getStyle().layers?.forEach((layer) => {
      if (layer.id.startsWith('tower-coverage-')) {
        map.removeLayer(layer.id);
      }
    });
    Object.keys(map.getStyle().sources || {}).forEach((srcId) => {
      if (srcId.startsWith('tower-coverage-')) {
        map.removeSource(srcId);
      }
    });

    // Если массив cellTowers пуст, выходим
    if (!cellTowers || !cellTowers.length) return;

    // Рисуем вышки
    cellTowers.forEach((tower, index) => {
      const lat = parseFloat(tower.latitude || tower.lat);
      const lng = parseFloat(tower.longitude || tower.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      // Ставим иконку вышки
      const markerElement = document.createElement('div');
      markerElement.className = 'custom-marker';
      markerElement.style.backgroundImage = `url(${towerIcon})`;
      markerElement.style.width = '40px';
      markerElement.style.height = '40px';
      markerElement.style.backgroundSize = 'contain';
      markerElement.style.backgroundRepeat = 'no-repeat';
      markerElement.style.backgroundColor = 'transparent';
      markerElement.style.position = 'absolute';
      markerElement.style.filter = 'invert(100%)';

      new mapboxgl.Marker({ element: markerElement })
          .setLngLat([lng, lat])
          .addTo(map);

      // Если включено isCoverageEnabled, рисуем зону покрытия
      if (isCoverageEnabled && tower.radius) {
        const radius = (parseFloat(tower.radius) * 1000) / 10;
        const polygonCoords = [createCirclePolygon([lng, lat], radius)];
        const polygonSourceId = `tower-coverage-${index}`;

        map.addSource(polygonSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: polygonCoords
            }
          }
        });
        map.addLayer({
          id: `${polygonSourceId}-fill`,
          type: 'fill',
          source: polygonSourceId,
          paint: { 'fill-color': '#808080', 'fill-opacity': 0.2 }
        });
        map.addLayer({
          id: `${polygonSourceId}-outline`,
          type: 'line',
          source: polygonSourceId,
          paint: { 'line-color': '#FFFFFF', 'line-width': 2 }
        });
      }
    });

    function createCirclePolygon([lng, lat], radius, numPoints = 64) {
      const coords = [];
      for (let i = 0; i < numPoints; i++) {
        const angle = (i * 360) / numPoints;
        const radian = (angle * Math.PI) / 180;
        const dx = radius * Math.cos(radian);
        const dy = radius * Math.sin(radian);
        const offsetLng = lng + (dx / 6378137) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
        const offsetLat = lat + (dy / 6378137) * (180 / Math.PI);
        coords.push([offsetLng, offsetLat]);
      }
      coords.push(coords[0]);
      return coords;
    }
  }, [cellTowers, isCoverageEnabled]);


  // -------------------------------
  // ОБРАБОТЧИК КЛИКОВ
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = (e) => {
      // Если включён режим линейки или планимера – выход, чтобы не обрабатывать клики
      if (isRulerOn || isPlanimeterOn) return;

      // Если активен режим расстановки деревьев – ставим «дерево»
      if (isTreePlacingActive) {
        // console.log('Режим деревьев активен');
        const { lng, lat } = e.lngLat;
        // onTreeMapClick(lat, lng);

        // Вызываем callback для обновления координат в родительском компоненте
        if (typeof onTreeMapClick === 'function') {
          onTreeMapClick(lat, lng);
        }
         // Если нужно, можно добавить визуальный маркер на карте
        const newFeature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {}
        };
        setTreeMarkers((prev) => [...prev, newFeature]);

        return;
      }

      // Если включён режим планировщика маршрута – ставим маршрутный маркер
      if (isPlacingMarker) {
        const { lat, lng } = e.lngLat;
        let terrainElevation = 0;
        if (is3D) {
          // В 3D режиме пытаемся получить высоту рельефа
          if (mapRef.current && typeof mapRef.current.queryTerrainElevation === 'function') {
            terrainElevation = mapRef.current.queryTerrainElevation(e.lngLat) || 0;
          }
        } else {
          // В 2D режиме игнорируем высоту рельефа
          terrainElevation = 0;
        }
        // Вызываем callback с передачей lat, lng и terrainElevation
        onMapClick(lat, lng, terrainElevation);

        // Добавляем визуальный маркер, как и раньше
        const markerElement = document.createElement('div');
        markerElement.className = 'route-marker';
        const marker = new mapboxgl.Marker({
          element: markerElement,
          pitchAlignment: 'map',
          rotationAlignment: 'map'
        })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        markersRef.current.push(marker);
      }
    };

    mapRef.current.on('click', handleMapClick);
    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleMapClick);
      }
    };
  }, [isRulerOn, isPlanimeterOn, isPlacingMarker, onMapClick, onTreeMapClick, isTreePlacingActive, is3D]);


  // -------------------------------
  // ОБРАБОТЧИК КЛИКА (ЛИНЕЙКА)
  // -------------------------------
  const handleMapClickForRuler = (e) => {
    if (!isRulerOn) return;

    // Удаляем старый LineString
    if (geojsonRef.current.features.length > 1) {
      geojsonRef.current.features.pop();
    }

    // Проверяем, клик на уже существующую точку?
    const features = mapRef.current.queryRenderedFeatures(e.point, { layers: ['measure-points'] });

    if (features.length) {
      // Удаляем точку
      const id = features[0].properties.id;
      geojsonRef.current.features = geojsonRef.current.features.filter(
          (f) => f.properties.id !== id
      );
    } else {
      // Добавляем новую точку
      const point = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat]
        },
        properties: {
          id: String(Date.now())
        }
      };
      geojsonRef.current.features.push(point);
    }

    // Если ≥2 точек, формируем линию
    if (geojsonRef.current.features.length > 1) {
      lineStringRef.current.geometry.coordinates = geojsonRef.current.features.map(
          (pt) => pt.geometry.coordinates
      );
      // ❗ ВАЖНО: добавляем lineStringRef.current (не .current.current)
      geojsonRef.current.features.push(lineStringRef.current);

      // Вычисление расстояния
      const distanceKm = turf.length(lineStringRef.current); // km
      setTotalDistance(`Дистанция: ${distanceKm.toFixed(3)} км`);
    } else {
      setTotalDistance('');
    }

    // Обновляем источник
    mapRef.current.getSource('measure-geojson').setData(geojsonRef.current);
  };


  // -------------------------------
  // ОБРАБОТЧИК MOUSEMOVE (ЛИНЕЙКА)
  // -------------------------------
  const handleMouseMoveForRuler = (e) => {
    if (!isRulerOn) {
      mapRef.current.getCanvas().style.cursor = '';
      return;
    }
    const features = mapRef.current.queryRenderedFeatures(e.point, { layers: ['measure-points'] });
    mapRef.current.getCanvas().style.cursor = features.length ? 'pointer' : 'crosshair';
  };


  // -------------------------------
  // ВКЛЮЧИТЬ / ВЫКЛЮЧИТЬ РЕЖИМ ЛИНЕЙКИ
  // -------------------------------
  const toggleRuler = () => {
    // if (isMissionBuilding) return; // Если идёт построение миссии – пропускаем. (во избежании конфликтов)

    setIsRulerOn((prev) => {
    if (prev) {
      // Если режим уже был включён – сбрасываем измерения и выключаем режим
      resetMeasurements();
      return false;
    }
    return true;
  });
};

  // Очистка всех измерений
  const resetMeasurements = () => {
    geojsonRef.current = {
      type: 'FeatureCollection',
      features: []
    };
    setTotalDistance('');
    if (mapRef.current?.getSource('measure-geojson')) {
      mapRef.current.getSource('measure-geojson').setData(geojsonRef.current);
    }
  };

  // Отдельный useEffect для обработчиков линейки:
  useEffect(() => {
    if (!mapRef.current) return;

    if (isRulerOn) {
      // Привязываем обработчики для режима линейки
      mapRef.current.on('click', handleMapClickForRuler);
      mapRef.current.on('mousemove', handleMouseMoveForRuler);
    }

    return () => {
      if (!mapRef.current) return;
      mapRef.current.off('click', handleMapClickForRuler);
      mapRef.current.off('mousemove', handleMouseMoveForRuler);
    };
  }, [isRulerOn]);


  // -------------------------------
  // ОБРАБОТЧИК КЛИКА (ПЛАНИМЕР)
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current) return;

    if (isPlanimeterOn) {
      // Создаём экземпляр MapboxDraw
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'draw_polygon'
      });
      drawRef.current = draw;
      mapRef.current.addControl(draw);

      // Функция обновления площади
      const updateArea = () => {
        const data = draw.getAll();
        if (data.features.length > 0) {
          const area = turf.area(data);
          setRoundedArea(Math.round(area * 100) / 100);
        } else {
          setRoundedArea(null);
        }
      };

      // Подключаем обработчики событий
      mapRef.current.on('draw.create', updateArea);
      mapRef.current.on('draw.delete', updateArea);
      mapRef.current.on('draw.update', updateArea);

      // При очистке эффекта удаляем обработчики
      return () => {
        if (mapRef.current) {
          mapRef.current.off('draw.create', updateArea);
          mapRef.current.off('draw.delete', updateArea);
          mapRef.current.off('draw.update', updateArea);
        }
      };
    }
  }, [isPlanimeterOn]);

  // Обработчик окна планимера
  useEffect(() => {
    const observer = new MutationObserver((mutationsList, obs) => {
      const infoPanel = document.querySelector('div[style*="background-color: rgba(255, 255, 255, 0.9)"]');
      if (infoPanel) {
        infoPanel.style.bottom = 'auto';
        infoPanel.style.left = 'auto';
        infoPanel.style.top = '12%';
        infoPanel.style.right = '37.8%';
        infoPanel.style.transform = 'translate(-50%, -50%)';
        infoPanel.style.width = '145px';
        infoPanel.style.backgroundColor = 'rgba(0,0,0,0.5)';
        infoPanel.style.color = '#fff';
        // infoPanel.style.fontSize = '30px';
        // infoPanel.style.padding = '6px 10px';         // отступы
        // infoPanel.style.borderRadius = '4px';
        // Не отключаем наблюдатель, чтобы он продолжал корректировать элемент при каждом появлении
        // obs.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Сохраняем полигоны планимера (добавление нового слоя)
  useEffect(() => {
    // Если карта не инициализирована, нет сохранившихся полигонов или массив пуст – выходим
    if (!mapRef.current || !savedPolygons || !savedPolygons.features.length) return;

    const map = mapRef.current;

    // Если стиль ещё не загружен, подписываемся на событие
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        // Снова проверяем, что mapRef.current не null
        if (!mapRef.current) return;

        if (mapRef.current.getSource('saved-polygons')) {
          mapRef.current.removeLayer('saved-polygons-layer');
          mapRef.current.removeSource('saved-polygons');
        }

        mapRef.current.addSource('saved-polygons', {
          type: 'geojson',
          data: savedPolygons,
        });
        mapRef.current.addLayer({
          id: 'saved-polygons-layer',
          type: 'fill',
          source: 'saved-polygons',
          layout: {},
          paint: {
            'fill-color': 'rgba(0, 0, 255, 0.3)',
            'fill-outline-color': 'rgba(0, 0, 255, 1)',
          },
        });
      };

      map.on('style.load', onStyleLoad);

      // Функция очистки при размонтировании или пересоздании эффекта
      return () => {
        // Перед снятием обработчика проверяем, что карта всё ещё существует
        if (mapRef.current) {
          mapRef.current.off('style.load', onStyleLoad);
        }
      };
    }

    // Если стиль уже загружен, просто обновляем слой
    if (map.getSource('saved-polygons')) {
      map.removeLayer('saved-polygons-layer');
      map.removeSource('saved-polygons');
    }

    map.addSource('saved-polygons', {
      type: 'geojson',
      data: savedPolygons,
    });
    map.addLayer({
      id: 'saved-polygons-layer',
      type: 'fill',
      source: 'saved-polygons',
      layout: {},
      paint: {
        'fill-color': 'rgba(0, 0, 255, 0.3)',
        'fill-opacity': 0.5,
        'fill-outline-color': 'rgba(0, 0, 255, 1)',
      },
    });
  }, [savedPolygons, is3D, cellTowers, isCoverageEnabled]);


  // Добавление кнопки для сохранения полигонов в планимере
  useEffect(() => {
    const observer = new MutationObserver((mutationsList, obs) => {
      const polygonButton = document.querySelector('.mapbox-gl-draw_polygon');
      const controlsContainer = polygonButton ? polygonButton.parentElement : null;

      if (controlsContainer && !document.getElementById('save-polygons-btn')) {
        const saveButton = document.createElement('button');
        saveButton.id = 'save-polygons-btn';
        saveButton.className = 'mapbox-gl-draw_ctrl-draw-btn';
        // saveButton.title = 'Сохранить полигоны';
        // saveButton.innerText = 'Сохранить';

        // Добавляем фон из galochka-planiemer.png:
        saveButton.style.backgroundImage = `url(${galochkaIcon})`;
        saveButton.style.backgroundRepeat = 'no-repeat';
        saveButton.style.backgroundPosition = 'center center';
        saveButton.style.backgroundSize = 'contain';

        // При необходимости задайте размеры
        saveButton.style.width = '32px';
        saveButton.style.height = '32px';
        saveButton.style.backgroundSize = '16px 16px';

        // Используем нашу функцию handleSavePolygons
        saveButton.onclick = handleSavePolygons;

        controlsContainer.appendChild(saveButton);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);


  // -------------------------------
  // useEffect для деревьев
  // -------------------------------

  // Функция для добавления symbols деревьев
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const createOrUpdate2DTreeLayer = () => {
      if (!map.isStyleLoaded()) return;

      // Собираем features из tempTreePoints + plantationPoints
      const features = [];
      tempTreePoints.forEach((pt) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
          properties: { status: 'temp' }
        });
      });
      plantationPoints.forEach((pt, idx) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
          properties: {
            status: 'saved',
            number: pt.number ?? (idx + 1),
            height: pt.height,
            crownSize: pt.crownSize
          }
        });
      });

      const geojsonData = {
        type: 'FeatureCollection',
        features
      };

      // Проверяем, есть ли уже источник
      const source = map.getSource('tree-marker-source');
      if (source) {
        source.setData(geojsonData);
      } else {
        map.loadImage(greenCircle, (error, image) => {
          if (error) {
            console.error('Ошибка загрузки иконки дерева:', error);
            return;
          }
          if (!map.hasImage('tree-icon')) {
            map.addImage('tree-icon', image);
          }
          map.addSource('tree-marker-source', {
            type: 'geojson',
            data: geojsonData
          });
          map.addLayer({
            id: 'tree-marker-layer',
            type: 'symbol',
            source: 'tree-marker-source',
            layout: {
              'icon-image': 'tree-icon',
              'icon-anchor': 'center',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-rotation-alignment': 'map',
              'symbol-placement': 'point',
              'icon-size': 0.03
            }
          });
        });
      }
    };

    // Вызвать сразу
    if (map.isStyleLoaded()) {
      createOrUpdate2DTreeLayer();
    }

    // На случай, если стиль будет перезагружаться
    map.on('style.load', createOrUpdate2DTreeLayer);

    return () => {
      map.off('style.load', createOrUpdate2DTreeLayer);
    };
  }, [tempTreePoints, plantationPoints]);


  // Функция для добавления и удаления 3D моделей деревьев
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      // console.log('[MapComponent] Карта не инициализирована');
      return;
    }

    // console.log('[MapComponent] useEffect для деревьев: is3D =', is3D, 'isTerrainReady =', isTerrainReady);

    if (is3D && isTerrainReady) {
      // console.log('[MapComponent] Создание/обновление 3D-деревьев, plantationPoints:', plantationPoints);
      if (treeOverlay) {
        // console.log('[MapComponent] Обновляем существующий оверлей');
        const updated = updateTree3DLayers(map, plantationPoints, treeOverlay);
        setTreeOverlay(updated);
      } else {
        // console.log('[MapComponent] Создаём новый оверлей');
        const newOverlay = initTree3DLayers(map, plantationPoints);
        setTreeOverlay(newOverlay);
      }
    } else if (!is3D) {
      if (treeOverlay) {
        // console.log('[MapComponent] Удаляем оверлей при переходе в 2D');
        removeTree3DLayers(map, treeOverlay);
        setTreeOverlay(null);
      }
    }

    return () => {
      // console.log('[MapComponent] Очистка useEffect для деревьев');
      if (treeOverlay && !is3D) {
        removeTree3DLayers(map, treeOverlay);
        setTreeOverlay(null);
      }
    };
  }, [is3D, isTerrainReady, plantationPoints]); // следим за переключением is3D и обновлением plantationPoints


  // Всплывающая аннотация об объекте насаждений при наведении курсором
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const canvas = map.getCanvas();
    if (!canvas) return; // Если canvas не определён, выходим

    // Обработчики для событий на слое tree-marker-layer
    const onMapMouseEnter = (e) => {
      canvas.style.cursor = 'pointer';
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      const { height, crownSize, number } = feature.properties;

      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      const description = `
      <div style="font-size:12px;">
        <strong>Насаждение №${number}</strong><br/>
        Широта: ${coordinates[1].toFixed(5)}<br/>
        Долгота: ${coordinates[0].toFixed(5)}<br/>
        Высота: ${height || 'нет данных'}<br/>
        Размер кроны: ${crownSize || 'нет данных'}
      </div>
    `;

      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      })
          .setLngLat(coordinates)
          .setHTML(description)
          .addTo(map);

      popup.getElement().style.zIndex = '9999';
      canvas._currentTreePopup = popup;
    };

    const onMapMouseLeave = () => {
      canvas.style.cursor = '';
      if (canvas._currentTreePopup) {
        canvas._currentTreePopup.remove();
        canvas._currentTreePopup = null;
      }
    };

    map.on('mouseenter', 'tree-marker-layer', onMapMouseEnter);
    map.on('mouseleave', 'tree-marker-layer', onMapMouseLeave);

    // Обработка hoveredTreePoint для аннотации из списка
    if (hoveredTreePoint) {
      const { lat, lng, height, crownSize, number } = hoveredTreePoint;
      const coordinates = [lng, lat];
      const description = `
      <div style="font-size:12px;">
        <strong>Насаждение №${number}</strong><br/>
        Широта: ${lat.toFixed(5)}<br/>
        Долгота: ${lng.toFixed(5)}<br/>
        Высота: ${height || 'нет данных'}<br/>
        Размер кроны: ${crownSize || 'нет данных'}
      </div>
    `;
      const listPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      })
          .setLngLat(coordinates)
          .setHTML(description)
          .addTo(map);
      listPopup.getElement().style.zIndex = '9999';
      canvas._currentListPopup = listPopup;
    } else {
      if (canvas._currentListPopup) {
        canvas._currentListPopup.remove();
        canvas._currentListPopup = null;
      }
    }

    return () => {
      map.off('mouseenter', 'tree-marker-layer', onMapMouseEnter);
      map.off('mouseleave', 'tree-marker-layer', onMapMouseLeave);
      if (canvas && canvas._currentListPopup) {
        canvas._currentListPopup.remove();
        canvas._currentListPopup = null;
      }
    };
  }, [is3D, cellTowers, isCoverageEnabled, savedPolygons, hoveredTreePoint]);


  // -------------------------------
  // useEffect для ДРОНА и маршрута
  // -------------------------------
  // Калибровка высоты дрона после загрузки стиля и DEM-источника:
  useEffect(() => {
    // Если дрон выполняет миссию, не калибруем высоту
    if (isMoving) return;
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    if (!calibrationCoordinates) return;

    let groundAltitude;
    if (is3D) {
      // В 3D‑режиме пытаемся получить высоту рельефа
      const calibrationPoint = new mapboxgl.LngLat(
          calibrationCoordinates.lng,
          calibrationCoordinates.lat
      );
      groundAltitude = mapRef.current.queryTerrainElevation(calibrationPoint) || calibrationCoordinates.altitude;
    } else {
      // В 2D‑режиме используем значение, введённое пользователем, или 0
      groundAltitude = calibrationCoordinates.altitude || 0;
    }

    // if (typeof onCalibrationAltitude === 'function') {
    //   onCalibrationAltitude(groundAltitude);
    // }

    // Добавляем условие: обновляем только если разница существенная
    if (
        Math.abs(Number(dronePosition.altitude) - Number(groundAltitude)) <
        0.01
    ) {
      return;
    }

    if (typeof onCalibrationAltitude === 'function') {
      onCalibrationAltitude(groundAltitude);
    }

  }, [calibrationCoordinates, onCalibrationAltitude, isMoving, is3D, mapRef.current?.isStyleLoaded()]);

  // Получение высоты рельефа под дроном
  useEffect(() => {
    // Если карта не готова или проп не передан — ничего не делаем
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    if (typeof onGroundElevationChange !== 'function') return;

    // Включён ли режим 3D и есть ли DEM‑источник
    if (is3D) {
      // Координаты дрона
      const { lng, lat } = dronePosition;
      // Вызываем queryTerrainElevation — вернёт высоту рельефа в метрах
      // Если по каким-то причинам null / undefined — fallback на 0
      const groundElevation = mapRef.current.queryTerrainElevation([lng, lat]) || 0;

      // Отправляем наверх
      onGroundElevationChange(groundElevation);

    } else {
      // В 2D‑режиме можно передавать 0 (либо передавать ту «плоскую» высоту, которая у вас есть)
      onGroundElevationChange(0);
    }

  }, [dronePosition, is3D, onGroundElevationChange]);

  // Отвечает за добавление (удаление) 3D-модели дрона и 2D-маркера
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // 3D или 2D
    if (is3D && droneLayerRef.current?.drone) {
      droneLayerRef.current.dronePosition = dronePosition;
      mapRef.current.triggerRepaint();
    } else if (droneMarkerRef.current) {
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }

    if (is3D) {
      // Если карта уже загружена, включаем 3D
      if (map.isStyleLoaded()) {
        enable3D(map);
      } else {
        map.on('style.load', () => enable3D(map));
      }
      // Удаляем 2D-маркер, если он есть
      if (droneMarkerRef.current) {
        droneMarkerRef.current.remove();
        droneMarkerRef.current = null;
      }
      // Добавляем 3D-модель, если её еще нет
      if (!droneLayerRef.current) {
        droneLayerRef.current = addDroneModel(map, dronePosition);
      }
    } else {
      // Если режим 2D, выключаем 3D
      if (map.isStyleLoaded()) {
        disable3D(map);
      } else {
        map.on('style.load', () => disable3D(map));
      }
      // Удаляем 3D-модель, если она существует
      if (droneLayerRef.current) {
        if (map.getLayer(droneLayerRef.current.id)) {
          map.removeLayer(droneLayerRef.current.id);
        }
        if (map.getSource('drone-model-layer')) {
          map.removeSource('drone-model-layer');
        }
        droneLayerRef.current = null;
      }
      // Добавляем 2D-маркер, если его нет
      if (!droneMarkerRef.current) {
        droneMarkerRef.current = addDroneMarker(map, dronePosition);
      }
    }
  }, [is3D, dronePosition]);

 // Ориентация дрона (heading) при движении
  useEffect(() => {
    if (isMoving && droneMarkerRef.current) {
      droneMarkerRef.current.setRotation(droneHeading);
    }
    if (isMoving && droneLayerRef.current?.drone) {
      // const adjustedHeading = droneHeading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(droneHeading);
      mapRef.current.triggerRepaint();
    }
  }, [droneHeading, isMoving]);

  // Расчёт heading
  const calculateHeadingFromRoute = (currentPosition, nextPosition) => {
    const dx = nextPosition.lng - currentPosition.lng;
    const dy = nextPosition.lat - currentPosition.lat;
    let angle = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    return Math.round(angle);
  };


  useEffect(() => {
    if (isMoving && routePoints.length > 0 && currentRouteIndex < routePoints.length) {
      const nextPoint = routePoints[currentRouteIndex];
      const newHeading = calculateHeadingFromRoute(dronePosition, nextPoint);
      setDroneHeading(newHeading);
    }
  }, [dronePosition, isMoving, routePoints, currentRouteIndex]);

  // Первый рендер (3D дрон)
  useEffect(() => {
    if (is3D && droneLayerRef.current?.drone) {
      if (!droneLayerRef.current.initialized) {
        const initialHeading = dronePosition.heading || 0;
        droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(initialHeading);
        droneLayerRef.current.initialized = true;
      }
      const adjHeading = dronePosition.heading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjHeading);
      mapRef.current.triggerRepaint();
    }
  }, [dronePosition, is3D]);

  // Маркеры routePoints
  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const dataForMarkers = isMissionBuilding ? routePoints : confirmedRoute;
    dataForMarkers.forEach((pt) => {
      const el = document.createElement('div');
      el.className = 'route-marker';
      const marker = new mapboxgl.Marker({
        element: el,
        pitchAlignment: 'map',
        rotationAlignment: 'map'
      })
          .setLngLat([pt.lng, pt.lat])
          .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [routePoints, confirmedRoute, isMissionBuilding]);

  // Отрисовка route-line
  useEffect(() => {
    if (!mapRef.current || confirmedRoute.length <= 1) return;

    if (mapRef.current.getSource('route-line')) {
      mapRef.current.removeLayer('route-line');
      mapRef.current.removeSource('route-line');
    }

    const markerRadius = 0.0001;
    const getOffsetPoint = (p1, p2, radius) => {
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offsetX = (dx / dist) * radius;
      const offsetY = (dy / dist) * radius;
      return {
        start: { lat: p1.lat + offsetY, lng: p1.lng + offsetX },
        end: { lat: p2.lat - offsetY, lng: p2.lng - offsetX }
      };
    };

    const coords = [];
    for (let i = 0; i < confirmedRoute.length - 1; i++) {
      const start = confirmedRoute[i];
      const end = confirmedRoute[i + 1];
      const { start: so, end: eo } = getOffsetPoint(start, end, markerRadius);
      coords.push([so.lng, so.lat], [eo.lng, eo.lat]);
    }

    const routeGeoJson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords }
    };
    mapRef.current.addSource('route-line', { type: 'geojson', data: routeGeoJson });
    mapRef.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 2
      }
    });
  }, [confirmedRoute]);


  // -------------------------------
  // useEffect'ы с вызовами renderRoute
  // -------------------------------
  // Этот эффект гарантирует, что при изменении данных маршрута или режимов (3D, планировщика) вызывается renderRoute(). Он отвечает за обновление слоёв, когда изменяются входные данные (например, подтверждённый маршрут).
  useEffect(() => {
    renderRoute();
  }, [confirmedRoute, is3D, isMissionBuilding]);

  // Эффект для подписки на событие style.load
  useEffect(() => {
    if (!mapRef.current) return;

    // Обработчик для вызова renderRoute после загрузки стиля
    const onStyleLoad = () => {
      renderRoute();
    };

    mapRef.current.on('style.load', onStyleLoad);

    // Очистка обработчика при размонтировании
    return () => {
      if (mapRef.current) {
        mapRef.current.off('style.load', onStyleLoad);
      }
    };
  }, []);

  // Интервал в 100 мс с проверкой загрузки стиля карты
  useEffect(() => {
    const interval = setInterval(() => {
      if (mapRef.current?.isStyleLoaded()) {
        renderRoute();
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [confirmedRoute, is3D, isMissionBuilding]);


  // -------------------------------
  // RENDER
  // -------------------------------
  // let IsRulerOn;
  return (
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflowX: 'hidden' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Кнопка «Линейка» */}
        <button
            onClick={toggleRuler}
            className={`leaflet-ruler ${isRulerOn ? 'leaflet-ruler-clicked' : ''}`}
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '36.7%',
              transform: 'translateX(-50%)',
              zIndex: 999,
              width: '35px',
              height: '35px',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              backgroundImage: isRulerOn
                ? `url(${require('../assets/icon-ruler-colored.png')})`
                : `url(${require('../assets/icon-ruler.png')})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              cursor: 'pointer'
            }}
        />


        {/* кнопка "Target" для зума */}
        <button
            onClick={handleTargetClick}
            className="target-button"
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '39.5%',
              transform: 'translateX(-50%)',
              zIndex: 999,
              width: '35px',
              height: '35px',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              backgroundImage: `url(${TargetIcon})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
              cursor: 'pointer'
            }}
        />

        {/* Кнопка Планирмер */}
        <button
            onClick={togglePlanimeter}
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '33.9%',
              transform: 'translateX(-50%)',
              zIndex: 999,
              width: '35px',
              height: '35px',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              backgroundImage: `url(${require('../assets/planiemer.png')})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
              cursor: 'pointer'
            }}
        />

        {/* Отображение дистанции (если есть) */}
        {isRulerOn && totalDistance && (
            <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 999,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: '4px'
                }}
            >
              {totalDistance}
            </div>
        )}

        {/* Панель для отображения площади (режим Планимер) */}
        {isPlanimeterOn && (
            <div
                style={{
                  position: 'absolute',
                  bottom: '50px',
                  left: '10px',
                  width: '150px',
                  height: '75px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  padding: '15px',
                  textAlign: 'center',
                  zIndex: 999
                }}
            >
              <p style={{ fontFamily: 'Open Sans', margin: 0, fontSize: 13 }}>
                Нажмите на карту, чтобы разметить полигон.
              </p>
              <div>
                {roundedArea && (
                    <>
                      <p style={{ fontFamily: 'Open Sans', margin: 0, fontSize: 13 }}>
                        <strong>{roundedArea}</strong>
                      </p>
                      <p style={{ fontFamily: 'Open Sans', margin: 0, fontSize: 13 }}>
                        м²
                      </p>
                    </>
                )}
              </div>
            </div>
        )}
      </div>
  );
}

// ---------------------------------------------------------
// ФУНКЦИЯ: добавить 3D модель дрона
// ---------------------------------------------------------
// Глобальная переменная для кеширования модели
let droneModelCache = null;

function loadDroneModel(callback) {
  console.log("Загрузка модели дрона...");
  if (droneModelCache) {
    console.log("Используется кешированная модель");
    callback(droneModelCache.clone());
    return;
  }
  const loader = new GLTFLoader();
  loader.load(
      'drone-model.glb', // Убедитесь, что путь к модели корректный
      (gltf) => {
        console.log("Модель успешно загружена:", gltf);
        droneModelCache = gltf.scene;
        callback(droneModelCache.clone());
      },
      undefined,
      (error) => console.error("Ошибка при загрузке модели дрона:", error)
  );
}

function addDroneModel(map, dronePosition, isMoving) {
  const customLayer = {
    id: 'drone-model-layer',
    type: 'custom',
    renderingMode: '3d',
    dronePosition: dronePosition,
    onAdd: function (map, gl) {
      console.log("onAdd вызван");

      // Создаем камеру и сцену
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      // Создаем рендерер, используя canvas и контекст Mapbox
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
      // Устанавливаем pixel ratio и размеры рендера для высокого качества
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.setSize(
          map.getCanvas().clientWidth,
          map.getCanvas().clientHeight,
          false
      );

      // Настраиваем корректное отображение цветов и физически правильное освещение
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.physicallyCorrectLights = true;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0; // Подберите оптимальное значение

      // Добавляем освещение
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      this.scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(0, 1, 1).normalize();
      this.scene.add(directionalLight);

      // Загружаем модель дрона
      loadDroneModel((drone) => {
        this.drone = drone;
        // Корректируем первоначальную ориентацию (учитывая экспорт из Blender)
        this.drone.rotation.set(Math.PI / 2, 3, 0);
        this.scene.add(this.drone);
        this.initialized = true;
        console.log("Модель добавлена в сцену");

        // Обновляем настройки текстур для сохранения качества PBR-материалов
        this.drone.traverse((child) => {
          if (child.isMesh && child.material.map) {
            // Устанавливаем корректное цветовое пространство
            child.material.map.colorSpace = THREE.SRGBColorSpace;
            // Максимальная анизотропия для улучшения качества текстур
            child.material.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            // Рекомендуемые фильтры
            child.material.map.minFilter = THREE.LinearMipMapLinearFilter;
            child.material.map.magFilter = THREE.LinearFilter;
            child.material.needsUpdate = true;
          }
        });
      });
    },
    render: function (gl, matrix) {
      if (this.drone && this.dronePosition) {
        // Получаем координаты в системе Mercator
        const modelAsMercatorCoordinate = updateDronePositionInMercator(map, this.dronePosition);
        if (!modelAsMercatorCoordinate) {
          console.error("Некорректные координаты модели:", modelAsMercatorCoordinate);
          return;
        }

        // Расчет масштаба
        // Если масштаб 1 дает нужное качество, оставляем его; затем можно подбирать scaleFactor для нужного размера
        const scaleFactor = 20;
        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * scaleFactor;
        // console.log("Координаты дрона:", modelAsMercatorCoordinate, "Масштаб:", scale);

        // Устанавливаем позицию и масштаб модели
        this.drone.position.set(
            modelAsMercatorCoordinate.x,
            modelAsMercatorCoordinate.y,
            modelAsMercatorCoordinate.z
        );
        this.drone.scale.set(scale, scale, scale);

        // Если дрон движется, корректируем поворот по heading
        if (isMoving) {
          const targetHeading = this.dronePosition.heading || 0;
          this.drone.rotation.y = -Math.PI / 180 * targetHeading;
        }

        // Обновляем матрицу проекции камеры и рендерим сцену
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        this.renderer.state.reset();
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);

        // Запрашиваем перерисовку карты
        map.triggerRepaint();
      }
    }
  };

  map.addLayer(customLayer);
  return customLayer;
}

// ---------------------------------------------------------
// ФУНКЦИЯ: добавить Marker дрона в 2D
// ---------------------------------------------------------
function addDroneMarker(map, dronePosition) {
  const markerElement = document.createElement('div');
  markerElement.className = 'gps-marker';
  return new mapboxgl.Marker({
    element: markerElement,
    anchor: 'bottom',
    pitchAlignment: 'map',
    rotationAlignment: 'map'
  })
      .setLngLat([dronePosition.lng, dronePosition.lat])
      .addTo(map);
}

// ---------------------------------------------------------
// ФУНКЦИЯ: обновление позиции дрона в mercator
// ---------------------------------------------------------
function updateDronePositionInMercator(map, dronePosition) {
  const { lat, lng, altitude } = dronePosition;
  const alt = altitude && !isNaN(altitude) ? altitude : 0;
  const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], alt);
  return modelAsMercatorCoordinate;
}


export default React.memo(MapComponent);