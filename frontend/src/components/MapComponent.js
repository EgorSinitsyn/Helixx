// src/components/MapComponent.js
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition, route: _route, is3D, cellTowers, isCoverageEnabled, droneHeading }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);

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

      mapRef.current.on('load', () => {
        if (is3D) {
          // Добавляем DEM данные и освещение только один раз
          mapRef.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
          mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });

          // Добавляем 3D модель дрона без ауры
          droneLayerRef.current = addDroneModel(mapRef.current, dronePosition);
        } else {
          // Добавляем маркер дрона в 2D режиме
          droneMarkerRef.current = addDroneMarker(mapRef.current, dronePosition);
        }

        // Добавляем базовые вышки и зоны покрытия один раз
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
  }, [is3D, cellTowers, isCoverageEnabled]);

  // Обновляем позицию дрона и ориентацию при изменении dronePosition и droneHeading
  useEffect(() => {
    if (is3D && droneLayerRef.current && droneLayerRef.current.drone) {
      // Обновляем позицию 3D модели
      droneLayerRef.current.dronePosition = dronePosition;
      // Устанавливаем поворот по оси Y
      droneLayerRef.current.drone.rotation.y = THREE.MathUtils.degToRad(droneHeading);
      mapRef.current.triggerRepaint();
    } else if (droneMarkerRef.current) {
      // Обновляем позицию маркера
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition, droneHeading]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100vh' }} />;
};

// Функция для добавления модели дрона
function addDroneModel(map, dronePosition) {
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
            this.drone.rotation.set(0, 0, 0);
            this.drone.rotation.x = Math.PI / 2;

            this.drone.traverse((child) => {
              if (child.isMesh && child.material) {
                child.material.color.setHex(0xffffff); // Белый цвет
                child.material.emissive = new THREE.Color(0xffffff); // Белая эмиссия
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
          },
          undefined,
          (error) => console.error('Ошибка при загрузке модели:', error)
      );

      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      if (this.drone && this.dronePosition) {
        const { lng, lat, altitude } = this.dronePosition;
        const modelOrigin = [lng, lat];
        const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(modelOrigin, altitude);
        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

        this.drone.position.set(modelAsMercatorCoordinate.x, modelAsMercatorCoordinate.y, modelAsMercatorCoordinate.z);
        this.drone.scale.set(scale, scale, scale);
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        this.renderer.state.reset();
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
        map.triggerRepaint();
      }
    },
  };

  map.addLayer(customLayer);
  return customLayer; // Возвращаем слой для доступа к dronePosition
}

// Функция для добавления маркера дрона в 2D режиме
function addDroneMarker(map, dronePosition) {
  const markerElement = document.createElement('div');
  markerElement.className = 'gps-marker';

  return new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
      .setLngLat([dronePosition.lng, dronePosition.lat])
      .addTo(map);
}

export default MapComponent;