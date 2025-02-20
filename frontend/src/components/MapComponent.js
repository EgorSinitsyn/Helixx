import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import * as turf from '@turf/turf';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import towerIcon from '../assets/tower-icon.png';
import galochkaIcon from '../assets/galochka-planiemer.png';
import greenCircle from '../assets/green_circle.png';

import { initTree3DLayers, updateTree3DLayers, removeTree3DLayers } from '../components/trees3D.js';
import '../components/drone_style.css';
import '../components/geomarker_style.css';
import '../components/custom_gl_draw.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

function MapComponent({
                        dronePosition,
                        route: confirmedRoute,
                        is3D,
                        cellTowers,
                        isCoverageEnabled,
                        droneHeading,
                        setDroneHeading,
                        isPlacingMarker,
                        onMapClick,
                        onTreeMapClick,
                        routePoints,
                        plantationPoints,
                        tempTreePoints,
                        isMissionBuilding,
                        isTreePlacingActive,
                        isMoving
                      }) {
  // -------------------------------
  // REFS для карты, слоёв, линейки
  // -------------------------------
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const markersRef = useRef([]); // Храним маркеры маршрута
  const routeLayerId = 'route-line';

  // -------------------------------
  // REFS для маркеров деревьев
  // -------------------------------
  const [treeMarkers, setTreeMarkers] = useState([]);   // Состояние для хранения дерева-маркеров
  const frozenTreeMarkersRef = useRef([]); // Рефы для заморозки маркеров при активации линейки или планомера
  const plantationMarkersRef = useRef([]);

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
      return new mapboxgl.Marker({ element: markerElement })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);
    });
  };

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

  function enable3D(map) {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
    }
    // map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });
  }

  function disable3D(map) {
    // Устанавливаем terrain в null
    map.setTerrain(null);

    // Если переключение только что произошло, сбрасываем pitch и bearing,
    // иначе оставляем пользовательские значения.
    // if (!map._userAdjusted) {
    //   map.setPitch(0);
    //   map.setBearing(0);
    // }

    if (map.getSource('mapbox-dem')) {
      map.removeSource('mapbox-dem');
    }
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
        console.log('Режим деревьев активен');
        const { lng, lat } = e.lngLat;
        onTreeMapClick(lat, lng);

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
        onMapClick(lat, lng);

        const markerElement = document.createElement('div');
        markerElement.className = 'route-marker';
        const marker = new mapboxgl.Marker({ element: markerElement })
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
  }, [isRulerOn, isPlanimeterOn, isPlacingMarker, onMapClick, onTreeMapClick]);


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
        saveButton.style.backgroundSize = '15px 15px';

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
  useEffect(() => {
  if (!mapRef.current) return;
  const map = mapRef.current;

  const createOrUpdate2DTreeLayer = () => {
    if (!map.isStyleLoaded()) return;

    // 1) Формируем массив Feature из tempTreePoints и plantationPoints
    const features = [];

    // Временные (не подтверждённые) точки
    tempTreePoints.forEach(pt => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pt.lng, pt.lat],
        },
        properties: {
          status: 'temp', // Можем хранить «статус» (пригодится для фильтра или выражений)
        },
      });
    });

    // Сохранённые точки
    plantationPoints.forEach((pt, index) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pt.lng, pt.lat],
        },
        properties: {
          number: pt.number || (index + 1),
          height: pt.height,      // Высота дерева
          crownSize: pt.crownSize, // Размер кроны
          status: 'saved',
        },
      });
    });

    const geojsonData = {
      type: 'FeatureCollection',
      features: features,
    };

    // 2) Проверяем, есть ли уже источник 'tree-marker-source'
    const source = map.getSource('tree-marker-source');
    if (source) {
      // Если есть — просто обновляем данные
      source.setData(geojsonData);
    } else {
      // Если нет — создаём источник и слой

      // Загружаем PNG-иконку (например, greenCircle или любую другую)
      map.loadImage(greenCircle, (error, image) => {
        if (error) {
          console.error('Ошибка загрузки иконки дерева:', error);
          return;
        }

        if (!map.hasImage('tree-icon')) {
          map.addImage('tree-icon', image);
          // Вы регистрируете иконку под ключом 'tree-icon',
          // которую ниже используете в "icon-image": 'tree-icon'.
        }

        // Создаём источник
        map.addSource('tree-marker-source', {
          type: 'geojson',
          data: geojsonData,
        });

        // Добавляем слой
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
            'icon-size': 0.03,
          },
          paint: {
            'icon-opacity': 1,
          },
        });
      });
    }
  };

    // Если режим 3D активен – работаем с 3D моделями
    if (is3D) {
      // Удаляем 2D‑слой, если он существует
      if (map.getLayer('tree-marker-layer')) {
        map.removeLayer('tree-marker-layer');
      }
      if (map.getSource('tree-marker-source')) {
        map.removeSource('tree-marker-source');
      }
      // Если 3D‑слои уже добавлены, обновляем их; иначе инициализируем
      if (map.getLayer('tree-trunk-layer') && map.getLayer('tree-crown-layer')) {
        updateTree3DLayers(map, plantationPoints);
      } else {
        initTree3DLayers(map, plantationPoints);
      }
    } else {
      // Если 3D режим выключен – удаляем 3D‑слои (если есть) и создаем 2D‑слой
      removeTree3DLayers(map);
      if (map.isStyleLoaded()) {
        createOrUpdate2DTreeLayer();
      }
      map.on('style.load', createOrUpdate2DTreeLayer);
    }


  // // Если стиль уже загружен, подгружаем слой сразу
  // if (map.isStyleLoaded()) {
  //   createOrUpdateTreeLayer();
  // }
  //
  // // На случай, если в будущем пользователь переключит стиль
  // map.on('style.load', createOrUpdateTreeLayer);

  return () => {
    if (map) {
      map.off('style.load', createOrUpdate2DTreeLayer);
    }
  };
}, [
    tempTreePoints,
    plantationPoints,
    is3D
]);


  // Всплывающая аннотация об объекте насаждений при наведении курсором
  useEffect(() => {
  if (!mapRef.current) return;
  const map = mapRef.current;

  const onMouseEnter = (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const coordinates = feature.geometry.coordinates.slice();
    const { height, crownSize, number } = feature.properties;

    const description = `
      <div style="font-size:12px;">
        <strong>Насаждение №${number}</strong><br/>
        Широта: ${coordinates[1].toFixed(5)}<br/>
        Долгота: ${coordinates[0].toFixed(5)}<br/>
        Высота: ${height || 'нет данных'}<br/>
        Размер кроны: ${crownSize || 'нет данных'}
      </div>
    `;

    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    })
      .setLngLat(coordinates)
      .setHTML(description)
      .addTo(map);

    map.getCanvas()._currentTreePopup = popup;
  };

  const onMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    const popup = map.getCanvas()._currentTreePopup;
    if (popup) {
      popup.remove();
      map.getCanvas()._currentTreePopup = null;
    }
  };

  map.on('mouseenter', 'tree-marker-layer', onMouseEnter);
  map.on('mouseleave', 'tree-marker-layer', onMouseLeave);

  return () => {
    if (map) {
      map.off('mouseenter', 'tree-marker-layer', onMouseEnter);
      map.off('mouseleave', 'tree-marker-layer', onMouseLeave);
    }
  };
}, [is3D, cellTowers, isCoverageEnabled, savedPolygons]);



  // -------------------------------
  // useEffect для ДРОНА и маршрута
  // -------------------------------
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

  // Ориентация дрона
  useEffect(() => {
    if (isMoving && droneLayerRef.current?.drone) {
      const adjustedHeading = droneHeading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading);
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
    if (isMoving && routePoints.length > 0) {
      const nextPoint = routePoints[0];
      const newHeading = calculateHeadingFromRoute(dronePosition, nextPoint);
      setDroneHeading(newHeading);
    }
  }, [dronePosition, isMoving, routePoints, setDroneHeading]);

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
      const marker = new mapboxgl.Marker({ element: el })
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
              left: '38.5%',
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

        {/* Кнопка Планирмер */}
        <button
            onClick={togglePlanimeter}
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '35.5%',
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
function addDroneModel(map, dronePosition, isMoving) {
  const customLayer = {
    id: 'drone-model-layer',
    type: 'custom',
    renderingMode: '3d',
    dronePosition: dronePosition,
    onAdd: function (map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      this.scene.add(ambientLight);

      const loader = new GLTFLoader();
      loader.load(
          'drone-model.glb', // Убедись, что путь к модели корректен
          (gltf) => {
            this.drone = gltf.scene;
            this.drone.rotation.set(Math.PI / 2, 0, 0); // Корректируем ориентацию
            this.scene.add(this.drone);
            this.initialized = true;

            this.drone.traverse((child) => {
              if (child.isMesh) {
                child.material.color.setHex(0xffffff);
                child.material.emissive = new THREE.Color(0xffffff);
                child.material.emissiveIntensity = 1;
                child.material.transparent = true;
                child.material.side = THREE.DoubleSide;
                child.material.opacity = 1.0;
                child.material.needsUpdate = true;
              }
            });
          },
          undefined,
          (error) => console.error('Ошибка при загрузке модели дрона:', error)
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      if (this.drone && this.dronePosition) {
        const { lat, lng, altitude } = this.dronePosition;
        const modelAsMercatorCoordinate = updateDronePositionInMercator(map, this.dronePosition);

        if (!modelAsMercatorCoordinate) return;

        const scaleFactor = 1;
        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * scaleFactor;
        this.drone.position.set(
            modelAsMercatorCoordinate.x,
            modelAsMercatorCoordinate.y,
            modelAsMercatorCoordinate.z
        );
        this.drone.scale.set(scale, scale, scale);

        if (isMoving) {
          const targetHeading = this.dronePosition.heading || 0;
          this.drone.rotation.y = -Math.PI / 180 * targetHeading;
        }

        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        this.renderer.state.reset();
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
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
  return new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
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