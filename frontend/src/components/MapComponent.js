import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import '../components/geomarker_style.css';
// import RulerManager from './RulerManager.js';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({
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
                      }) => {
  // -------------------------------
  // REFS для карты, слоёв, линейки
  // -------------------------------
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const markersRef = useRef([]); // Храним маркеры маршрута
  const routeLayerId = 'route-line';

  // // RulerManager ref
  // const rulerRef = useRef(null);

  // Состояние для отображения кнопки
  const [isRulerOn, setIsRulerOn] = useState(false);

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

    // 1) Линия маршрута
    if (confirmedRoute.length > 1) {
      const coordinates = confirmedRoute.map((point) => [point.lng, point.lat]);
      const routeGeoJson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
      };
      mapRef.current.addSource(routeLayerId, { type: 'geojson', data: routeGeoJson });
      mapRef.current.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)', // Мягкий оранжевый
          'line-width': 2,
        },
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
            [firstPoint.lng, firstPoint.lat],
          ],
        },
      };
      mapRef.current.addSource('drone-to-first-point', {
        type: 'geojson',
        data: droneToFirstPointGeoJson,
      });
      mapRef.current.addLayer({
        id: 'drone-to-first-point',
        type: 'line',
        source: 'drone-to-first-point',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)',
          'line-width': 2,
          'line-dasharray': [2, 4],
        },
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
      // Создаём карту
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v11',
        center: [dronePosition.lng, dronePosition.lat],
        zoom: 15,
        pitch: is3D ? 60 : 0,
        bearing: is3D ? -17.6 : 0,
        antialias: true,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Находим стандартный контейнер кнопок масштаба для переноса в другое место
      const controlsContainer = document.querySelector('.mapboxgl-ctrl-top-right');
      if (controlsContainer) {
        controlsContainer.classList.add('custom-map-controls'); // Добавляем класс
      }

      // Слушаем клики по карте (для постановки маркеров маршрута — ваш функционал)
      mapRef.current.on('click', (e) => {
        if (isPlacingMarker) {
          const { lat, lng } = e.lngLat;
          onMapClick(lat, lng);

          // Создаём элемент для маркера
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
        // Если 3D, то подключаем DEM, свет, дрон-модель
        if (is3D) {
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });

          droneLayerRef.current = addDroneModel(mapRef.current, dronePosition);
        } else {
          // 2D метка дрона
          droneMarkerRef.current = addDroneMarker(mapRef.current, dronePosition);
        }

        // Расставляем вышки
        cellTowers.forEach((tower, index) => {
          const lat = parseFloat(tower.latitude || tower.lat);
          const lng = parseFloat(tower.longitude || tower.lng);
          const radius = (parseFloat(tower.radius) * 1000) / 10;
          if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
            console.error(`Недействительные данные вышки на индексе ${index}:`, {
              lat,
              lng,
              radius,
            });
            return;
          }
          // Создаём маркер для вышки
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

          // Отрисовываем зону покрытия (если разрешено)
          if (isCoverageEnabled) {
            const createCirclePolygon = (center, radius, numPoints = 64) => {
              const coords = [];
              for (let i = 0; i < numPoints; i++) {
                const angle = (i * 360) / numPoints;
                const radian = (angle * Math.PI) / 180;
                const dx = radius * Math.cos(radian);
                const dy = radius * Math.sin(radian);
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
                  coordinates: polygonCoords,
                },
              },
            });
            mapRef.current.addLayer({
              id: `${polygonSourceId}-fill`,
              type: 'fill',
              source: polygonSourceId,
              paint: { 'fill-color': '#808080', 'fill-opacity': 0.2 },
            });
            mapRef.current.addLayer({
              id: `${polygonSourceId}-outline`,
              type: 'line',
              source: polygonSourceId,
              paint: { 'line-color': '#FFFFFF', 'line-width': 2 },
            });
          }
        });

        // -----------
        // Создаём RulerManager после загрузки карты
        // -----------
        // rulerRef.current = new RulerManager(mapRef.current, {
        //   lineColor: '#888',  // Серый для линии
        //   pointColor: '#888', // Серый для точек
        // });
      });
    }

    // cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [is3D, cellTowers, isCoverageEnabled, isPlacingMarker, onMapClick]);

  // -------------------------------
  // Обновление позиции дрона (3D / 2D)
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current) return;

    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      // Обновляем dronePosition в кастомном слое
      droneLayerRef.current.dronePosition = dronePosition;
      mapRef.current.triggerRepaint();
    } else if (droneMarkerRef.current) {
      // Обновляем Marker (2D)
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition, is3D]);

  // -------------------------------
  // Обновляем ориентацию дрона при изменении droneHeading
  // -------------------------------
  useEffect(() => {
    if (isMoving && droneLayerRef.current && droneLayerRef.current.drone) {
      const adjustedHeading = droneHeading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading);
      mapRef.current.triggerRepaint();
    }
  }, [droneHeading, isMoving]);

  // -------------------------------
  // Расчёт heading (угла) дрона при движении по маршруту
  // -------------------------------
  const calculateHeadingFromRoute = (currentPosition, nextPosition) => {
    const deltaLng = nextPosition.lng - currentPosition.lng;
    const deltaLat = nextPosition.lat - currentPosition.lat;
    let angle = (Math.atan2(deltaLng, deltaLat) * 180) / Math.PI;
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

  // -------------------------------
  // Первый рендер дрона (3D)
  // -------------------------------
  useEffect(() => {
    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      if (!droneLayerRef.current.initialized) {
        const initialHeading = dronePosition.heading || 0;
        droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(initialHeading);
        droneLayerRef.current.initialized = true;
      }
      const adjustedHeading = dronePosition.heading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading);
      mapRef.current.triggerRepaint();
    }
  }, [dronePosition, is3D]);

  // -------------------------------
  // Обновляем маркеры routePoints
  // -------------------------------
  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    routePoints.forEach((point) => {
      const markerElement = document.createElement('div');
      markerElement.className = 'route-marker';
      const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [routePoints, isMissionBuilding]);

  // -------------------------------
  // Отрисовка route-line
  // -------------------------------
  useEffect(() => {
    if (!mapRef.current || confirmedRoute.length <= 1) return;

    // Удаляем старый layer/source
    if (mapRef.current.getSource('route-line')) {
      mapRef.current.removeLayer('route-line');
      mapRef.current.removeSource('route-line');
    }
    const markerRadius = 0.0001; // ~ 10м
    const getOffsetPoint = (point1, point2, radius) => {
      const dx = point2.lng - point1.lng;
      const dy = point2.lat - point1.lat;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const offsetX = (dx / distance) * radius;
      const offsetY = (dy / distance) * radius;
      return {
        start: { lat: point1.lat + offsetY, lng: point1.lng + offsetX },
        end: { lat: point2.lat - offsetY, lng: point2.lng - offsetX },
      };
    };

    const coordinates = [];
    for (let i = 0; i < confirmedRoute.length - 1; i++) {
      const start = confirmedRoute[i];
      const end = confirmedRoute[i + 1];
      const { start: startOffset, end: endOffset } = getOffsetPoint(start, end, markerRadius);
      coordinates.push([startOffset.lng, startOffset.lat], [endOffset.lng, endOffset.lat]);
    }
    const routeGeoJson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
    };
    mapRef.current.addSource('route-line', { type: 'geojson', data: routeGeoJson });
    mapRef.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 2,
      },
    });
  }, [confirmedRoute]);

  // -------------------------------
  // Вызываем renderRoute при изменениях
  // -------------------------------
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
  // Кнопка «Линейка»: включить/выключить RulerManager
  // -------------------------------
  // const toggleRuler = () => {
  //   if (!rulerRef.current) return;
  //
  //   if (rulerRef.current.isEnabled) {
  //     // Если уже включена линейка — сбросим
  //     rulerRef.current.clear();
  //     setIsRulerOn(false);
  //   } else {
  //     // Иначе включаем
  //     rulerRef.current.enable();
  //     setIsRulerOn(true);
  //   }
  // };

  // -------------------------------
  // РЕНДЕР
  // -------------------------------
  return (
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflowX: 'hidden' }}>
        {/* Контейнер карты */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Кнопка «Линейка» внизу по центру */}
        <button
            // onClick={toggleRuler}
            className={`leaflet-ruler ${isRulerOn ? 'leaflet-ruler-clicked' : ''}`}
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '25%',
              transform: 'translateX(-50%)',
              zIndex: 999,
              width: '35px',
              height: '35px',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              backgroundImage: `url(${require('../assets/icon-ruler.png')})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundImage = `url(${require('../assets/icon-ruler-colored.png')})`}
            onMouseLeave={(e) => e.currentTarget.style.backgroundImage = `url(${require('../assets/icon-ruler.png')})`}
        />
      </div>
  );
};

// -----------------------------------------------------------------------------
// ФУНКЦИЯ: добавить 3D модель дрона
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
        antialias: true,
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
    },
  };
  map.addLayer(customLayer);
  return customLayer;
}

// -----------------------------------------------------------------------------
// ФУНКЦИЯ: добавить Marker дрона в 2D
function addDroneMarker(map, dronePosition) {
  const markerElement = document.createElement('div');
  markerElement.className = 'gps-marker';
  return new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
      .setLngLat([dronePosition.lng, dronePosition.lat])
      .addTo(map);
}

// -----------------------------------------------------------------------------
// ФУНКЦИЯ: обновление позиции дрона в mercator
function updateDronePositionInMercator(map, dronePosition) {
  const { lat, lng, altitude } = dronePosition;
  const adjustedAltitude = altitude && !isNaN(altitude) ? altitude : 0;
  const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      [lng, lat],
      adjustedAltitude
  );
  return modelAsMercatorCoordinate;
}

export default MapComponent;