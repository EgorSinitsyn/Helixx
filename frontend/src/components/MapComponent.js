// src/components/MapComponent.js
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';
import * as THREE from 'three';
// import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { GLTFLoader } from 'three-stdlib';


mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition, route: _route, is3D, cellTowers, isCoverageEnabled }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.remove();
    }

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

    mapRef.current.on('load', () => {
      if (is3D && mapRef.current) {
        mapRef.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });

        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });

      // Добавляем 3D модель дрона
      droneLayerRef.current = addDroneModel(mapRef.current, dronePosition);
      } else {
      // Добавляем маркер дрона в 2D режиме
      droneMarkerRef.current = addDroneMarker(mapRef.current, dronePosition);
      }

      cellTowers.forEach((tower, index) => {
        const lat = parseFloat(tower.latitude || tower.lat);
        const lng = parseFloat(tower.longitude || tower.lng);
        const radius = (parseFloat(tower.radius) * 1000) / 10;

        if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
          console.error(`Invalid tower data at index ${index}:`, { lat, lng, radius });
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

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [is3D, cellTowers, isCoverageEnabled]);

  // Обновляем позицию дрона при изменении dronePosition
  useEffect(() => {
    if (is3D) {
      if (droneLayerRef.current) {
        droneLayerRef.current.dronePosition = dronePosition;
        if (mapRef.current) {
          mapRef.current.triggerRepaint();
        }
      }
    } else {
      if (droneMarkerRef.current) {
        droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
      }
    }
  }, [dronePosition, is3D]);

    return <div ref={mapContainerRef} style={{ width: '100%', height: '100vh' }} />;
  };

// Функция для добавления 3D-модели дрона
// Функция для добавления 3D-модели дрона
function addDroneModel(map, dronePosition) {
  const customLayer = {
    id: 'drone-model-layer',
    type: 'custom',
    renderingMode: '3d',
    dronePosition: dronePosition, // Инициализируем без позиции
    onAdd: function (map, gl) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      // Добавляем базовое освещение
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      this.scene.add(ambientLight);

      // Загрузка модели дрона
      const loader = new GLTFLoader();
      loader.load(
          '/drone-model.glb',
          (gltf) => {
            console.log('Модель загружена успешно');
            this.drone = gltf.scene;
            // Установка первоначальной ориентации модели дрона
            // Предположим, что модель изначально ориентирована вдоль оси Z
            // Чтобы нос указывал на север (ось Y), поворачиваем модель на -90 градусов вокруг оси Y
            this.drone.rotation.set(-Math.PI / 0, 2, 0);

            // Инвертирование цветов модели
            this.drone.traverse((child) => {
              if (child.isMesh) {
                if (child.material.color) {
                  child.material.color.setRGB(1 - child.material.color.r, 1 - child.material.color.g, 1 - child.material.color.b);
                }
                // Если материал имеет карту, можно инвертировать её, но это более сложный процесс
              }
            });

            this.scene.add(this.drone);
            // Добавление свечения
            addGlow(this.scene, this.drone);
          },
          undefined,
          (error) => {
            console.error('Ошибка при загрузке модели дрона:', error);
          }
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      console.log('Метод render вызывается');

      // Обновляем матрицу проекции камеры
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);

      // Очищаем состояние рендерера
      this.renderer.state.reset();

      // Очищаем буфер глубины
      this.renderer.clearDepth();

      // Проверяем, что модель загружена и позиция дрона определена
      if (this.drone && this.dronePosition) {
        const { lng, lat, altitude } = this.dronePosition;
        const modelOrigin = [lng, lat];
        const modelAltitude = altitude || 209;

        const modelAsMercatorCoordinate =
            mapboxgl.MercatorCoordinate.fromLngLat(
                modelOrigin,
                modelAltitude
            );

        const scale =
            modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
        const modelScale = scale * 150;

        // Обновляем позицию и масштаб модели
        this.drone.position.set(
            modelAsMercatorCoordinate.x,
            modelAsMercatorCoordinate.y,
            modelAsMercatorCoordinate.z
        );

        // Устанавливаем масштаб модели
        this.drone.scale.set(scale, scale, scale);

        // Настраиваем поворот модели, если необходимо
         this.drone.rotation.x = Math.PI / 2; // Поворот по оси X на 90 градусов
      }

      // Рендерим сцену
      this.renderer.render(this.scene, this.camera);

      // Сообщаем карте, что нужно перерисовать кадр
      this.map.triggerRepaint();
    },
  };

  map.addLayer(customLayer);

  return customLayer; // Возвращаем слой для доступа к dronePosition
}

// Функция для добавления маркера дрона в 2D режиме
function addDroneMarker(map, dronePosition) {
  const markerElement = document.createElement('div');
  markerElement.className = 'gps-marker';

  const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
      .setLngLat([dronePosition.lng, dronePosition.lat])
      .addTo(map);

  return marker;
}

// Функция для добавления свечения
function addGlow(scene, drone) {
  // Создаём материал для свечения
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000, // Красный цвет свечения
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending, // Используем аддитивное смешивание
    side: THREE.DoubleSide,
  });

  // Создаём и добавляем свечение для каждой меш-сети в модели дрона
  drone.traverse((child) => {
    if (child.isMesh) {
      const glowGeometry = child.geometry.clone();
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial.clone());
      glowMesh.scale.multiplyScalar(1.2); // Увеличиваем размер свечения
      glowMesh.rotation.copy(child.rotation);
      glowMesh.position.copy(child.position);
      scene.add(glowMesh);

      // Сохраняем ссылку на свечение для анимации
      child.userData.glow = glowMesh;
    }
  });

  // Определяем функцию анимации свечения
  const animateGlow = () => {
    const time = Date.now() * 0.005;
    scene.children.forEach((child) => {
      if (child.userData.glow) {
        const opacity = 0.5 + 0.5 * Math.sin(time); // Пульсация от 0 до 1
        child.userData.glow.material.opacity = opacity;
      }
    });
  };
}

  export default MapComponent;
