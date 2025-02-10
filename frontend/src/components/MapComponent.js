import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import * as turf from '@turf/turf';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

import towerIcon from '../assets/tower-icon.png';
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
                        routePoints,
                        isMissionBuilding,
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

  // Ref для экземпляра MapboxDraw
  const drawRef = useRef(null);

  const togglePlanimeter = () => {
    if (isMissionBuilding) return; // Если идёт построение миссии – пропускаем. Во избежании конфликтов

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

  // -------------------------------
  // ФУНКЦИЯ: построить (или обновить) маршрут
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
    markersRef.current = routePoints.map((point) => {
      const markerElement = document.createElement('div');
      markerElement.className = 'route-marker';
      return new mapboxgl.Marker({ element: markerElement })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);
    });
  };

  // -------------------------------
  // ИНИЦИАЛИЗАЦИЯ КАРТЫ
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

      // Слушаем клики по карте (планировщик)
      mapRef.current.on('click', (e) => {
        // Если активен режим линейки, этот обработчик не должен срабатывать
        if (isRulerOn) return;

        if (isPlacingMarker) {
          const { lat, lng } = e.lngLat;
          onMapClick(lat, lng);

          // Добавляем маршрутный маркер
          const markerElement = document.createElement('div');
          markerElement.className = 'route-marker';
          const marker = new mapboxgl.Marker({ element: markerElement })
              .setLngLat([lng, lat])
              .addTo(mapRef.current);
          markersRef.current.push(marker);
        }
      });

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

        // 2) ИСТОЧНИК/СЛОИ для дрона, вышек...
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

        // Вышки
        cellTowers.forEach((tower, index) => {
          const lat = parseFloat(tower.latitude || tower.lat);
          const lng = parseFloat(tower.longitude || tower.lng);
          const radius = (parseFloat(tower.radius) * 1000) / 10;
          if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
            console.error(`Недействительные данные вышки (index: ${index}):`, { lat, lng, radius });
            return;
          }
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
              .addTo(mapRef.current);

          // Если нужно отрисовать зону покрытия
          if (isCoverageEnabled) {
            const createCirclePolygon = (center, rad, numPoints = 64) => {
              const coords = [];
              for (let i = 0; i < numPoints; i++) {
                const angle = (i * 360) / numPoints;
                const radian = (angle * Math.PI) / 180;
                const dx = rad * Math.cos(radian);
                const dy = rad * Math.sin(radian);
                const offsetLng =
                    lng + (dx / 6378137) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
                const offsetLat = lat + (dy / 6378137) * (180 / Math.PI);
                coords.push([offsetLng, offsetLat]);
              }
              coords.push(coords[0]);
              return coords;
            };

            const polygonCoords = [createCirclePolygon([lng, lat], radius)];
            const polygonSourceId = `tower-coverage-${index}`;
            mapRef.current.addSource(polygonSourceId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: polygonCoords
                }
              }
            });
            mapRef.current.addLayer({
              id: `${polygonSourceId}-fill`,
              type: 'fill',
              source: polygonSourceId,
              paint: { 'fill-color': '#808080', 'fill-opacity': 0.2 }
            });
            mapRef.current.addLayer({
              id: `${polygonSourceId}-outline`,
              type: 'line',
              source: polygonSourceId,
              paint: { 'line-color': '#FFFFFF', 'line-width': 2 }
            });
          }
        });

        // Подключаем клики для режима линейки
        // mapRef.current.on('click', handleMapClickForRuler);
        // mapRef.current.on('mousemove', handleMouseMoveForRuler);
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleMapClickForRuler);
        mapRef.current.off('mousemove', handleMouseMoveForRuler);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, [is3D, cellTowers, isCoverageEnabled, isPlacingMarker, onMapClick]);


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
      setTotalDistance(`Total distance: ${distanceKm.toFixed(3)} km`);
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
    if (isMissionBuilding) return; // Если идёт построение миссии – пропускаем. (во избежании конфликтов)

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

  const element = document.querySelector('div[style*="background-color: rgba(255, 255, 255, 0.9)"]');
  if (element) {
    element.style.bottom = 'auto';
    element.style.left = 'auto';
    element.style.top = '50%';
    element.style.right = '50%'; // если нужно
    element.style.transform = 'translate(-50%, -50%)';
  }


  // -------------------------------
  // useEffect для ДРОНА и маршрута
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current) return;

    // 3D или 2D
    if (is3D && droneLayerRef.current?.drone) {
      droneLayerRef.current.dronePosition = dronePosition;
      mapRef.current.triggerRepaint();
    } else if (droneMarkerRef.current) {
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition, is3D]);

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
    routePoints.forEach((pt) => {
      const el = document.createElement('div');
      el.className = 'route-marker';
      const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pt.lng, pt.lat])
          .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [routePoints, isMissionBuilding]);

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

  // renderRoute при изменениях
  useEffect(() => {
    renderRoute();
  }, [confirmedRoute, is3D]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mapRef.current?.isStyleLoaded()) {
        renderRoute();
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [confirmedRoute, is3D]);

  // -------------------------------
  // RENDER
  // -------------------------------
  let IsRulerOn;
  return (
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflowX: 'hidden' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Кнопка «Линейка» */}
        <button
            onClick={toggleRuler}
            className={`leaflet-ruler ${isRulerOn ? 'leaflet-ruler-clicked' : ''}`}
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '32%',
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
              bottom: '10px',
              left: '35%',
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
                Click the map to draw a polygon.
              </p>
              <div>
                {roundedArea && (
                    <>
                      <p style={{ fontFamily: 'Open Sans', margin: 0, fontSize: 13 }}>
                        <strong>{roundedArea}</strong>
                      </p>
                      <p style={{ fontFamily: 'Open Sans', margin: 0, fontSize: 13 }}>
                        square meters
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
          '/drone-model.glb',
          (gltf) => {
            this.drone = gltf.scene;
            // Начальные повороты
            this.drone.rotation.set(0, 0, 0);
            this.drone.rotation.x = Math.PI / 2;

            this.scene.add(this.drone);
            this.initialized = true;

            this.drone.traverse((child) => {
              if (child.isMesh && child.material) {
                // Настройка материала
                if (child.material.map) {
                  child.material.map.anisotropy = 100;
                  child.material.map.magFilter = THREE.NearestFilter;
                  child.material.map.minFilter = THREE.NearestMipMapNearestFilter;
                  child.material.map.generateMipmaps = true;
                  child.material.map.needsUpdate = true;
                }
                child.material.color.setHex(0xffffff);
                child.material.emissive = new THREE.Color(0xffffff);
                child.material.emissiveIntensity = 1;
                child.material.transparent = true;
                child.material.side = THREE.DoubleSide;
                child.material.opacity = 1.0;
                child.material.needsUpdate = true;
                if (child.material.map) {
                  child.material.map = null;
                }
              }
            });
            this.scene.add(this.drone);
            this.initialized = false;
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

        // Масштаб
        const scaleFactor = 0.5;
        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * scaleFactor;
        this.drone.position.set(
            modelAsMercatorCoordinate.x,
            modelAsMercatorCoordinate.y,
            modelAsMercatorCoordinate.z
        );
        this.drone.scale.set(scale, scale, scale);

        // Поворот при движении
        if (isMoving) {
          const targetHeading = this.dronePosition.heading;
          this.drone.rotation.y = -Math.PI / 180 * targetHeading;
        }

        // Камера и рендер
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

export default MapComponent;