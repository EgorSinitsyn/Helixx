// src/components/MapComponent.js
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import towerIcon from '../assets/tower-icon.png';
import '../components/drone_style.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MapComponent = ({ dronePosition, route, is3D, cellTowers, isCoverageEnabled }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const droneMarkerRef = useRef(null);

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

      const droneElement = document.createElement('div');
      droneElement.className = 'gps-marker';

      droneMarkerRef.current = new mapboxgl.Marker({ element: droneElement })
          .setLngLat([dronePosition.lng, dronePosition.lat])
          .addTo(mapRef.current);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [is3D, cellTowers, isCoverageEnabled]);

  // Обновляем позицию и размер маркера дрона при изменении координат или высоты
  useEffect(() => {
    if (droneMarkerRef.current) {
      droneMarkerRef.current.setLngLat([dronePosition.lng, dronePosition.lat]);

      // Изменение размера маркера в зависимости от высоты
      const heightFactor = Math.max(1, dronePosition.altitude / 10);
      droneMarkerRef.current.getElement().style.transform = `scale(${heightFactor})`;
    }
  }, [dronePosition]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100vh' }} />;
};

export default MapComponent;