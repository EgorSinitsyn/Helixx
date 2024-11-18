import React, { useEffect, useRef} from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';
import '../components/geomarker_style.css';

// Импортируем Three.js и GLTFLoader для оптимизации 3D моделек и сцены
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({
                        dronePosition,
                        route: confirmedRoute,
                        is3D,
                        cellTowers,
                        isCoverageEnabled,
                        droneHeading,
                        isPlacingMarker,
                        onMapClick,
                        routePoints,
                        isMissionBuilding,
                      }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]); // Массив для хранения маркеров маршрута
  const droneLayerRef = useRef(null); // Реф для хранения кастомного слоя дрона
  const droneMarkerRef = useRef(null); // Реф для маркера дрона в 2D режиме
  const routeLineRef = useRef(null);
  const routePointsRef = useRef([]);
  const towerMarkersRef = useRef([]);
  const coverageLayerIdsRef = useRef([]);
  const coverageSourceIdsRef = useRef([]);
  const routeLayerId = 'route-line';

  // Функция для отображения маршрута в 2D режиме
  const renderRoute2D = () => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    const routeLayerId = 'route-line';

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

      mapRef.current.addSource('drone-to-first-point', {
        type: 'geojson',
        data: droneToFirstPointGeoJson,
      });
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

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v11',
        center: [dronePosition.lng, dronePosition.lat],
        zoom: 15,
        pitch: 0,
        bearing: 0,
        antialias: true,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Обработчик клика по карте для добавления точек маршрута
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
    }

    // Очистка при размонтировании компонента
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Инициализируем карту только один раз

  // Добавление маркеров вышек
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    // Удаляем существующие маркеры вышек
    towerMarkersRef.current.forEach((marker) => marker.remove());
    towerMarkersRef.current = [];

    // Добавляем маркеры вышек
    cellTowers.forEach((tower) => {
      const lat = parseFloat(tower.latitude || tower.lat);
      const lng = parseFloat(tower.longitude || tower.lng);

      if (isNaN(lat) || isNaN(lng)) {
        console.error(`Недействительные данные вышки:`, { lat, lng });
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

      const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat([lng, lat])
          .addTo(mapRef.current);

      towerMarkersRef.current.push(marker);
    });
  }, [cellTowers]);

  // Управление зонами покрытия
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    // Функция для удаления зон покрытия
    const removeCoverageAreas = () => {
      cellTowers.forEach((tower, index) => {
        const polygonSourceId = `tower-coverage-${index}`;
        const fillLayerId = `${polygonSourceId}-fill`;
        const outlineLayerId = `${polygonSourceId}-outline`;

        // Удаляем слои
        if (mapRef.current.getLayer(fillLayerId)) {
          mapRef.current.removeLayer(fillLayerId);
        }
        if (mapRef.current.getLayer(outlineLayerId)) {
          mapRef.current.removeLayer(outlineLayerId);
        }

        // Удаляем источник
        if (mapRef.current.getSource(polygonSourceId)) {
          mapRef.current.removeSource(polygonSourceId);
        }
      });
    };

    // Удаляем существующие зоны покрытия
    removeCoverageAreas();

    if (isCoverageEnabled) {
      // Добавляем зоны покрытия
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

        const createCirclePolygon = (center, radius, numPoints = 64) => {
          const coords = [];
          for (let i = 0; i < numPoints; i++) {
            const angle = (i * 360) / numPoints;
            const radian = (angle * Math.PI) / 180;
            const dx = radius * Math.cos(radian);
            const dy = radius * Math.sin(radian);
            const offsetLng =
                lng +
                ((dx / 6378137) * (180 / Math.PI)) /
                Math.cos((lat * Math.PI) / 180);
            const offsetLat = lat + (dy / 6378137) * (180 / Math.PI);
            coords.push([offsetLng, offsetLat]);
          }
          coords.push(coords[0]);
          return coords;
        };

        const polygonCoords = [createCirclePolygon([lng, lat], radius)];
        const polygonSourceId = `tower-coverage-${index}`;
        const fillLayerId = `${polygonSourceId}-fill`;
        const outlineLayerId = `${polygonSourceId}-outline`;

        // Удаляем существующие источники и слои с теми же идентификаторами
        if (mapRef.current.getLayer(fillLayerId)) {
          mapRef.current.removeLayer(fillLayerId);
        }
        if (mapRef.current.getLayer(outlineLayerId)) {
          mapRef.current.removeLayer(outlineLayerId);
        }
        if (mapRef.current.getSource(polygonSourceId)) {
          mapRef.current.removeSource(polygonSourceId);
        }

        // Добавляем источник
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

        // Добавляем слои
        mapRef.current.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: polygonSourceId,
          paint: {
            'fill-color': '#808080',
            'fill-opacity': 0.2,
          },
        });

        mapRef.current.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: polygonSourceId,
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 2,
          },
        });
      });
    }
  }, [isCoverageEnabled, cellTowers]); // Обновляем при изменении cellTowers или isCoverageEnabled

  // Обновление карты при переключении между 2D и 3D режимами
  useEffect(() => {
    if (mapRef.current) {
      const enable3DMode = () => {
        mapRef.current.setPitch(60);
        mapRef.current.setBearing(-17.6);

        if (!mapRef.current.getSource('mapbox-dem')) {
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });

        // Удаляем 2D маркеры и слои
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
        ['route-line', 'drone-to-first-point'].forEach((layerId) => {
          if (mapRef.current.getSource(layerId)) {
            mapRef.current.removeLayer(layerId);
            mapRef.current.removeSource(layerId);
          }
        });

        // Удаляем маркер дрона в 2D режиме
        if (droneMarkerRef.current) {
          droneMarkerRef.current.remove();
          droneMarkerRef.current = null;
        }
      };

      const disable3DMode = () => {
        mapRef.current.setPitch(0);
        mapRef.current.setBearing(0);
        mapRef.current.setTerrain(null);

        // Удаляем 3D объекты
        if (droneLayerRef.current) {
          mapRef.current.removeLayer('drone-model-layer');
          droneLayerRef.current = null;
        }
        if (routeLineRef.current) {
          mapRef.current.removeLayer('3d-route-line');
          routeLineRef.current = null;
        }
        routePointsRef.current.forEach((obj) =>
            mapRef.current.removeLayer(obj.layerId)
        );
        routePointsRef.current = [];

        // Отображаем маршрут в 2D
        renderRoute2D();

        // Добавляем маркер дрона в 2D режиме
        if (!droneMarkerRef.current) {
          const markerElement = document.createElement('div');
          markerElement.className = 'gps-marker';
          droneMarkerRef.current = new mapboxgl.Marker({
            element: markerElement,
            anchor: 'bottom',
          })
              .setLngLat([dronePosition.lng, dronePosition.lat])
              .addTo(mapRef.current);
        }
      };

      if (mapRef.current.isStyleLoaded()) {
        if (is3D) {
          enable3DMode();
        } else {
          disable3DMode();
        }
      } else {
        mapRef.current.once('style.load', () => {
          if (is3D) {
            enable3DMode();
          } else {
            disable3DMode();
          }
        });
      }
    }
  }, [is3D]);

  // Добавление модели дрона в 3D режиме
  useEffect(() => {
    if (mapRef.current && is3D) {
      // Если слой уже существует, удаляем его перед добавлением
      if (droneLayerRef.current) {
        mapRef.current.removeLayer('drone-model-layer');
        droneLayerRef.current = null;
      }

      const dronePositionRef = { current: dronePosition }; // Используем реф для передачи позиции в слой

      const customLayer = {
        id: 'drone-model-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
          this.map = map; // Сохраняем ссылку на карту
          this.camera = new THREE.Camera();
          this.scene = new THREE.Scene();
          const ambientLight = new THREE.AmbientLight(0xffffff, 1);
          this.scene.add(ambientLight);

          // Добавляем часы для анимации
          this.clock = new THREE.Clock();

          const loader = new GLTFLoader();
          loader.load(
              '/drone-model.glb',
              (gltf) => {
                this.drone = gltf.scene;
                this.drone.rotation.set(0, 2, 0); // Настройка ориентации модели
                this.drone.rotation.x = Math.PI / 2;

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

                // Инициализируем AnimationMixer
                this.mixer = new THREE.AnimationMixer(this.drone);

                // Запускаем первую анимацию из доступных
                if (gltf.animations.length > 0) {
                  this.action = this.mixer.clipAction(gltf.animations[0]);
                  this.action.play();
                }

                this.scene.add(this.drone);
              },
              undefined,
              (error) => console.error('Ошибка при загрузке модели:', error)
          );

          this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
          });
          this.renderer.autoClear = false;
        },
        render: function (gl, matrix) {
          if (this.drone && dronePositionRef.current) {
            // Обновляем анимацию
            const delta = this.clock.getDelta();
            if (this.mixer) {
              this.mixer.update(delta);
            }

            const { lng, lat, altitude } = dronePositionRef.current;
            const modelOrigin = [lng, lat];
            const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
                modelOrigin,
                altitude || 0
            );
            const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

            this.drone.position.set(
                modelAsMercatorCoordinate.x,
                modelAsMercatorCoordinate.y,
                modelAsMercatorCoordinate.z
            );
            this.drone.scale.set(scale, scale, scale);

            // Обновляем ориентацию модели в соответствии с droneHeading
            this.drone.rotation.z = THREE.MathUtils.degToRad(droneHeading);

            this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
            this.renderer.state.reset();
            this.renderer.render(this.scene, this.camera);
            this.map.triggerRepaint(); // Используем this.map вместо map
          }
        },
      };

      mapRef.current.addLayer(customLayer);
      droneLayerRef.current = customLayer;

      // Обновляем позицию при изменении dronePosition
      droneLayerRef.current.dronePositionRef = dronePositionRef;
    } else if (mapRef.current && !is3D) {
      // Удаляем слой модели дрона в 2D режиме
      if (droneLayerRef.current) {
        mapRef.current.removeLayer('drone-model-layer');
        droneLayerRef.current = null;
      }
    }
  }, [is3D]);

  // Обновление позиции модели дрона при изменении позиции или ориентации
  useEffect(() => {
    if (droneLayerRef.current && droneLayerRef.current.dronePositionRef) {
      droneLayerRef.current.dronePositionRef.current = dronePosition;
    }

    // Обновляем маркер дрона в 2D режиме
    if (!is3D && droneMarkerRef.current) {
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition, droneHeading]);

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
    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      const adjustedHeading = droneHeading + 90;
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(adjustedHeading);
      mapRef.current.triggerRepaint();
    }
  }, [droneHeading]);

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

  // Обновление линии маршрута
  useEffect(() => {
    if (mapRef.current) {
      if (is3D) {
        // Здесь можно добавить код для отображения 3D линии маршрута, если необходимо
      } else {
        // Отображаем маршрут в 2D режиме
        renderRoute2D();
      }
    }
  }, [confirmedRoute, is3D]);

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

  // Обновление маркеров при добавлении новых точек маршрута
  useEffect(() => {
    if (!is3D && mapRef.current) {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = routePoints.map((point) => {
        const markerElement = document.createElement('div');
        markerElement.className = 'route-marker';

        const marker = new mapboxgl.Marker({ element: markerElement })
            .setLngLat([point.lng, point.lat])
            .addTo(mapRef.current);

        return marker;
      });
    }
  }, [routePoints, is3D]);

  return (
      <div
          ref={mapContainerRef}
          style={{ width: '100%', height: '100vh', overflowX: 'hidden' }}
      />
  );
};

export default MapComponent;