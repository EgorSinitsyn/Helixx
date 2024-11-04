// src/components/MapComponent.js
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

// Устанавливаем токен Mapbox из .env
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition, route, is3D }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    // Проверка на существование объекта карты перед созданием новой
    if (mapRef.current) {
      mapRef.current.remove();
    }

    // Инициализация карты с учетом режима 2D/3D
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v11', // Спутниковый стиль для лучшей 3D-визуализации
      center: [92.8932, 56.0153],
      zoom: 6,
      pitch: is3D ? 60 : 0,
      bearing: is3D ? -17.6 : 0,
      antialias: true
    });

    // Добавляем навигационные элементы
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Настройка рельефа для 3D режима после загрузки карты
    mapRef.current.on('load', () => {
      if (is3D && mapRef.current) {
        mapRef.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });

        mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        mapRef.current.setLight({ anchor: 'map', intensity: 0.5 });
      }
    });

    // Создаем маркер для текущей позиции дрона
    markerRef.current = new mapboxgl.Marker().setLngLat([dronePosition.lng, dronePosition.lat]).addTo(mapRef.current);

    // Функция для очистки карты при размонтировании
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null; // Очищаем ссылку на объект карты
      }
    };
  }, [is3D]);

  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);
    }
  }, [dronePosition.lat, dronePosition.lng]);

  useEffect(() => {
    if (mapRef.current && route.length) {
      if (mapRef.current.getSource('route')) {
        mapRef.current.getSource('route').setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: route,
            },
          }],
        });
      } else {
        mapRef.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: route,
              },
            }],
          },
        });
        mapRef.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#1db7dd',
            'line-width': 5,
          },
        });
      }
    }
  }, [route]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100vh' }} />;
};

export default MapComponent;