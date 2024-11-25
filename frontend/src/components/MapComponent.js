import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import '../components/geomarker_style.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition,
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
                        isMoving }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const markersRef = useRef([]); // Массив для хранения маркеров маршрута
  const routeLayerId = 'route-line';

  const renderRoute = () => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    // Удаляем существующие слои маршрута и линии к первой точке, если они уже есть
    if (mapRef.current.getSource(routeLayerId)) {
      mapRef.current.removeLayer(routeLayerId);
      mapRef.current.removeSource(routeLayerId);
    }
    if (mapRef.current.getSource('drone-to-first-point')) {
      mapRef.current.removeLayer('drone-to-first-point');
      mapRef.current.removeSource('drone-to-first-point');
    }

    // Создаем линию маршрута, если есть больше одной точки
    if (confirmedRoute.length > 1) {
      const coordinates = confirmedRoute.map((point) => [point.lng, point.lat]);
      const routeGeoJson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
      };

      mapRef.current.addSource(routeLayerId, { type: 'geojson', data: routeGeoJson });
      mapRef.current.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)', // Мягкий оранжевый цвет
          'line-width': 2,
        },
      });
    }

    // Если есть хотя бы одна точка маршрута, соединяем дроном и первую точку маршрута
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

      mapRef.current.addSource('drone-to-first-point', { type: 'geojson', data: droneToFirstPointGeoJson });
      mapRef.current.addLayer({
        id: 'drone-to-first-point',
        type: 'line',
        source: 'drone-to-first-point',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': 'rgba(255, 165, 0, 0.6)', // Мягкий оранжевый цвет для соединения
          'line-width': 2,
          'line-dasharray': [2, 4],
        },
      });
    }

    // Добавляем маркеры для каждой точки маршрута
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = routePoints.map((point) => {
      const markerElement = document.createElement('div');
      markerElement.className = 'route-marker';

      const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);

      return marker;
    });
  };

  // Создаем карту только один раз
  useEffect(() => {
    if (!mapRef.current) {
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

      mapRef.current.on('click', (e) => {
        if (isPlacingMarker) {
          const { lat, lng } = e.lngLat;
          onMapClick(lat, lng);

          // Создаем элемент для маркера маршрута
          const markerElement = document.createElement('div');
          markerElement.className = 'route-marker'; // Используем стиль из geomarker_style.css

          const marker = new mapboxgl.Marker({ element: markerElement })
              .setLngLat([lng, lat])
              .addTo(mapRef.current);

          markersRef.current.push(marker);
        }
      });

      mapRef.current.on('load', () => {
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
          droneMarkerRef.current = addDroneMarker(mapRef.current, dronePosition);
        }

        // Добавляем вышки и зоны покрытия
        cellTowers.forEach((tower, index) => {
          const lat = parseFloat(tower.latitude || tower.lat);
          const lng = parseFloat(tower.longitude || tower.lng);
          const radius = (parseFloat(tower.radius) * 1000) / 10;

          if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
            console.error(`Недействительные данные вышки на индексе ${index}:`, { lat, lng, radius });
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

          if (isCoverageEnabled) {
            const createCirclePolygon = (center, radius, numPoints = 64) => {
              const coords = [];
              for (let i = 0; i < numPoints; i++) {
                const angle = (i * 360) / numPoints;
                const radian = (angle * Math.PI) / 180;
                const dx = radius * Math.cos(radian);
                const dy = radius * Math.sin(radian);
                const offsetLng = lng + (dx / 6378137) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
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
              paint: {
                'fill-color': '#808080',
                'fill-opacity': 0.2,
              },
            });

            mapRef.current.addLayer({
              id: `${polygonSourceId}-outline`,
              type: 'line',
              source: polygonSourceId,
              paint: {
                'line-color': '#FFFFFF',
                'line-width': 2,
              },
            });
          }
        });
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [is3D, cellTowers, isCoverageEnabled, isPlacingMarker, onMapClick]);

  // Обновляем позицию дрона и ориентацию при изменении dronePosition и droneHeading
  useEffect(() => {
    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      droneLayerRef.current.dronePosition = dronePosition;
      mapRef.current.triggerRepaint();
    } else if (droneMarkerRef.current) {
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition, is3D]);

  // Отдельный useEffect для обновления ориентации дрона при изменении droneHeading
  useEffect(() => {
    if (isMoving && droneLayerRef.current && droneLayerRef.current.drone) {
      // Обновление ориентации дрона на основе текущего движения
      const adjustedHeading = droneHeading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading);
      mapRef.current.triggerRepaint();
    }
  }, [droneHeading, isMoving]); // Следим за изменениями heading и флагом движения

  // код для вычисления угла
  const calculateHeadingFromRoute = (currentPosition, nextPosition) => {
    const deltaLng = nextPosition.lng - currentPosition.lng;
    const deltaLat = nextPosition.lat - currentPosition.lat;
    const angle = Math.atan2(deltaLng, deltaLat); // Получаем угол в радианах

    let heading = (angle * 180) / Math.PI; // Преобразуем угол в градусы

    // Приводим угол в диапазон от 0 до 360
    if (heading < 0) {
      heading += 360; // Если угол отрицательный, добавляем 360
    }

    return Math.round(heading);
  };

  // юзэф для обновления угла
  useEffect(() => {
    if (isMoving && routePoints.length > 0) {
      // Берем первую точку маршрута, к которой движется дрон
      const nextPoint = routePoints[0];
      // Вычисляем угол
      const newHeading = calculateHeadingFromRoute(dronePosition, nextPoint);
      // Обновляем состояние угла
      setDroneHeading(newHeading);
    }
  }, [dronePosition, isMoving, routePoints, setDroneHeading]);

  // Используем useEffect для инициализации начального положения и ориентации дрона
  useEffect(() => {
    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      // Если это первый рендер, установим начальную ориентацию
      if (!droneLayerRef.current.initialized) {
        const initialHeading = dronePosition.heading || 0; // Начальный угол (если не задан, используем 0)
        droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(initialHeading); // Устанавливаем ориентацию
        droneLayerRef.current.initialized = true; // Флаг, чтобы не перезаписывать ориентацию каждый раз
      }

      // Устанавливаем новое положение и ориентацию, если дрон движется
      const adjustedHeading = dronePosition.heading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading); // Поворачиваем модель по направлению
      mapRef.current.triggerRepaint(); // Перерисовываем карту
    }
  }, [dronePosition, is3D]); // Обновляем ориентацию и позицию при изменении dronePosition и is3D

  // Обновление маркеров маршрута на основе изменения routePoints
  useEffect(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    routePoints.forEach((point) => {
      const markerElement = document.createElement('div');
      markerElement.className = 'route-marker'; // Используем стиль из geomarker_style.css

      const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current);

      markersRef.current.push(marker);
    });
  }, [routePoints, isMissionBuilding]);

  useEffect(() => {
    if (mapRef.current && confirmedRoute.length > 1) {
      // Удаляем существующий слой, если он есть
      if (mapRef.current.getSource('route-line')) {
        mapRef.current.removeLayer('route-line');
        mapRef.current.removeSource('route-line');
      }

      const markerRadius = 0.0001; // Пример радиуса в градусах (приблизительно 10 метров на экваторе)

      const getOffsetPoint = (point1, point2, radius) => {
        // Вычисляем вектор от точки 1 к точке 2
        const dx = point2.lng - point1.lng;
        const dy = point2.lat - point1.lat;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Нормализуем вектор и умножаем на радиус
        const offsetX = (dx / distance) * radius;
        const offsetY = (dy / distance) * radius;

        return {
          start: { lat: point1.lat + offsetY, lng: point1.lng + offsetX },
          end: { lat: point2.lat - offsetY, lng: point2.lng - offsetX }
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
        geometry: {
          type: 'LineString',
          coordinates
        }
      };

      mapRef.current.addSource('route-line', { type: 'geojson', data: routeGeoJson });
      mapRef.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2
        }
      });
    }
  }, [confirmedRoute]);

  // Обновляем маршрут при изменении confirmedRoute или is3D
  useEffect(() => {
    renderRoute();
  }, [confirmedRoute, is3D]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mapRef.current && mapRef.current.isStyleLoaded()) {
        renderRoute();
        clearInterval(interval); // Остановить проверку после загрузки стиля
      }
    }, 100); // Проверяем каждые 100 миллисекунд

    return () => clearInterval(interval);
  }, [confirmedRoute, is3D]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100vh', overflowX: 'hidden' }} />;
};

// Функция для добавления модели дрона
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
          '/drone-model.glb', // Путь к модели дрона
          (gltf) => {
            this.drone = gltf.scene;
            this.drone.rotation.set(0, 2, 0);
            this.drone.rotation.x = Math.PI / 2;
            this.scene.add(this.drone);
            this.initialized = true; // Устанавливаем флаг в true после инициализации

            this.drone.traverse((child) => {
              if (child.isMesh && child.material) {
                child.material.color.setHex(0xffffff);
                child.material.emissive = new THREE.Color(0xffffff);
                child.material.emissiveIntensity = 1;
                child.material.transparent = true;
                child.material.opacity = 1.0;
                child.material.needsUpdate = true;
                if (child.material.map) {
                  child.material.map = null;
                }
              }
            });
            this.scene.add(this.drone);

            // Инициализация флага, чтобы не перезаписывать ориентацию
            this.initialized = false;
          },
          undefined,
          (error) => console.error('Ошибка при загрузке модели:', error)
      );

      // Рендеринг с использованием WebGL
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      if (this.drone && this.dronePosition) {
        const { lat, lng, altitude, heading } = this.dronePosition;
        const modelOrigin = [lng, lat];

        // Convert geographic coordinates to Mercator coordinates
        const modelAsMercatorCoordinate = updateDronePositionInMercator(map, this.dronePosition);

        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

        // Set the position of the drone model using Mercator z-coordinate
        this.drone.position.set(
            modelAsMercatorCoordinate.x,
            modelAsMercatorCoordinate.y,
            modelAsMercatorCoordinate.z // Use the z-coordinate from Mercator conversion
        );
        this.drone.scale.set(scale, scale, scale);

        // Rotate the drone model if it's moving
        if (isMoving) {
          const targetHeading = this.dronePosition.heading;
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

// Функция для обновления позиции модели с проверкой высоты
function updateDronePositionInMercator(map, dronePosition) {
  const { lat, lng, altitude } = dronePosition;
  const modelOrigin = [lng, lat];

  // Преобразуем высоту в число и корректируем её
  const adjustedAltitude = (altitude && !isNaN(altitude)) ? altitude : 0;  // Если высота корректна, используем её, иначе 0

  // Логируем перед преобразованием
  console.log('Adjusted Altitude Before Mercator:', adjustedAltitude);

  // Преобразуем географические координаты в Mercator с учетом высоты
  const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(modelOrigin, adjustedAltitude);

  // Проверяем корректность Mercator координат
  if (isNaN(modelAsMercatorCoordinate.x) || isNaN(modelAsMercatorCoordinate.y) || isNaN(modelAsMercatorCoordinate.z)) {
    console.error('Invalid Mercator Coordinates:', modelAsMercatorCoordinate);
  }

  return modelAsMercatorCoordinate;
}

// Функция для добавления маркера дрона в 2D режиме
function addDroneMarker(map, dronePosition) {
  const markerElement = document.createElement('div');
  markerElement.className = 'gps-marker'; // Используем стиль из drone_style.css

  return new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
      .setLngLat([dronePosition.lng, dronePosition.lat])
      .addTo(map);
}

export default MapComponent;