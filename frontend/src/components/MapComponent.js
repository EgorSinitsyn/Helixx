// src/components/MapComponent.js
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png'; // Импорт вашего изображения вышки

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition, route, is3D, cellTowers }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.remove();
    }

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [92.8932, 56.0153],
      zoom: 6,
      pitch: is3D ? 60 : 0,
      bearing: is3D ? -17.6 : 0,
      antialias: true
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

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

      // Добавляем сотовые вышки на карту с изображением вместо стандартного маркера
      cellTowers.forEach(tower => {
        // Создаем кастомный элемент маркера с изображением
        const markerElement = document.createElement('div');
        markerElement.className = 'custom-marker';
        markerElement.style.backgroundImage = `url(${towerIcon})`;
        markerElement.style.width = '40px'; // Задайте нужный размер
        markerElement.style.height = '40px';
        markerElement.style.backgroundSize = 'contain';
        markerElement.style.backgroundRepeat = 'no-repeat';
        markerElement.style.backgroundColor = 'transparent';
        markerElement.style.position = 'absolute';
        markerElement.style.filter = 'invert(100%)'; // Применяем фильтр, чтобы изображение стало белым


        // Добавляем маркер на карту
        new mapboxgl.Marker({ element: markerElement })
          .setLngLat([tower.lng, tower.lat])
          .addTo(mapRef.current);

        // Добавляем радиус покрытия вышки
        mapRef.current.addLayer({
          id: `tower-radius-${tower.lat}-${tower.lng}`,
          type: 'circle',
          source: {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [tower.lng, tower.lat]
              }
            }
          },
          paint: {
            'circle-radius': tower.radius / 100, // Радиус в километрах, делим на 100 для корректного отображения
            'circle-color': '#FF0000',
            'circle-opacity': 0.3,
          }
        });
      });
    });

    markerRef.current = new mapboxgl.Marker().setLngLat([dronePosition.lng, dronePosition.lat]).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [is3D, cellTowers]);

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