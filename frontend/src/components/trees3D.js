// src/components/trees3D.js

import { MapboxOverlay } from '@deck.gl/mapbox';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { TruncatedConeGeometry, SphereGeometry } from '@luma.gl/engine';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import * as turf from '@turf/turf';

import crownTexture from '../assets/leaves.png';

/**
 * Подготавливает данные для каждого дерева
 * (только вычисления, без ручной проекции Mercator).
 */
function prepareTreeData(plantationPoints, map) {
    return plantationPoints.map(pt => {
        const trunkHeight = pt.height * 0.75;
        const trunkDiameter = pt.height * 0.1;
        const crownDiameter = pt.crownSize;
        const crownRadius = crownDiameter / 2;


        let elevation = 0;
        if (map && typeof map.queryTerrainElevation === 'function') {
            elevation = map.queryTerrainElevation([pt.lng, pt.lat]) || 0;
        } else {
            console.warn('[Tree3D] queryTerrainElevation недоступен!');
        }

        return {
            lng: pt.lng,
            lat: pt.lat,
            trunkHeight,
            trunkDiameter,
            crownDiameter,
            crownRadius,
            elevation
        };
    });
}

/**
 * Создаём слой ствола (усечённый конус).
 */
function createTrunkLayer(treeData, map) {
    return new SimpleMeshLayer({
        id: 'tree-trunk-layer',
        data: treeData,
        // Усечённый конус. В luma.gl высота вдоль оси Y.
        mesh: new TruncatedConeGeometry({
            topRadius: 0.4,
            bottomRadius: 1.0,
            height: 1,
            nradial: 6
        }),
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,

        // Позиция: базовая точка смещена так, чтобы основание ствола было на уровне земли.
        getPosition: d => [d.lng, d.lat, d.elevation + d.trunkHeight / 2],

        // Ориентация: корректировка для соответствия вертикали Deck.gl.
        getOrientation: [0, 0, 90],

        // Масштаб: [радиус по X, высота по Y, радиус по Z].
        getScale: d => {
            const radius = d.trunkDiameter / 2;
            return [radius, d.trunkHeight, radius];
        },

        getColor: [67, 39, 21],
        opacity: 1,
        parameters: {
            depthTest: true, // Включаем тест глубины
            depthFunc:  0x0201 // || GL.LESS  // Убедимся, что объекты рендерятся поверх terrain
        }
    });
}

/**
 * Создаём слой кроны (сфера).
 */
function createCrownLayer(treeData, map) {
    return new SimpleMeshLayer({
        id: 'tree-crown-layer',
        data: treeData,
        mesh: new SphereGeometry({ radius: 1, nradial: 16, nvertical: 8 }),
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        texture: crownTexture,

        //  Центр сферы на вершине ствола, с учётом высоты рельефа
        getPosition: d => [d.lng, d.lat, d.elevation + d.trunkHeight],

        getOrientation: [0, 0, 90],

        // Масштаб: задаём диаметр кроны по всем осям.
        getScale: d => [d.crownDiameter, d.crownDiameter, d.crownDiameter],

        getColor: [175, 216, 142],
        opacity: 1
    });
}

/**
 * Создаём Overlay из двух слоёв (ствол + крона).
 */
function createTreeOverlay(treeData, map) {
    const trunkLayer = createTrunkLayer(treeData);
    const crownLayer = createCrownLayer(treeData);

    return new MapboxOverlay({
        layers: [trunkLayer, crownLayer]
    });
}

/**
 * Инициализирует и добавляет 3D‑overlay деревьев на карту.
 */
export function initTree3DLayers(map, plantationPoints) {
    // if (!map || !plantationPoints || !plantationPoints.length) return;

    if (!map) {
        console.warn('[Tree3D] Ожидание инициализации карты...');
        setTimeout(() => initTree3DLayers(map, plantationPoints), 1000); // Пробуем снова через 1 сек
        return;
    }

    if (!map.getTerrain()) {
        console.warn('[Tree3D] Ожидание загрузки terrain...');
        setTimeout(() => initTree3DLayers(map, plantationPoints), 1000);
        return;
    }

    if (!plantationPoints || !plantationPoints.length) return;

    const treeData = prepareTreeData(plantationPoints, map);
    console.log('[Tree3D] Data with elevation:', treeData);

    const overlay = createTreeOverlay(treeData);
    map.addControl(overlay);
    return overlay;
}

/**
 * Обновляет overlay 3D деревьев при изменении данных.
 */
export function updateTree3DLayers(map, plantationPoints, overlay) {
    if (!map) return;
    if (overlay) {
        if (typeof overlay.finalize === 'function') {
            overlay.finalize();
        }
        map.removeControl(overlay);
    }
    return initTree3DLayers(map, plantationPoints);
}

/**
 * Удаляет overlay 3D деревьев с карты.
 */
export function removeTree3DLayers(map, overlay) {
    if (!map || !overlay) return;
    if (typeof overlay.finalize === 'function') {
        overlay.finalize();
    }
    map.removeControl(overlay);
}


/**
 * Генерирует точки деревьев по ряду точек на карте.
 */
export function generateTreePointsFromRow(rowPoints, { treeHeight, crownSize, step }) {
    // Если ряд состоит менее чем из 2 точек — ничего не генерируем
    if (rowPoints.length < 2) return [];

    // Преобразуем rowPoints в массив координат [lng, lat]
    const coordinates = rowPoints.map(pt => [pt.lng, pt.lat]);
    const line = turf.lineString(coordinates);

    // Получаем общую длину линии в километрах
    const totalLengthKm = turf.length(line, { units: 'kilometers' });

    // Переводим шаг из метров в километры
    const stepKm = step / 1000;
    const generatedPoints = [];

    // Проходим по линии с шагом stepKm
    for (let d = 0; d <= totalLengthKm; d += stepKm) {
        const pt = turf.along(line, d, { units: 'kilometers' });
        const [lng, lat] = pt.geometry.coordinates;
        generatedPoints.push({ lat, lng, height: treeHeight, crownSize: crownSize });
    }

    return generatedPoints;
}

/**
 * Устанавливает динамическое отображение 3D‑слоя в зависимости от зума.
 * При зуме ниже threshold (например, 12) 3D‑слой удаляется, а при зуме выше —
 * создаётся, если его ещё нет.
 *
 * Возвращает функцию для очистки (удаления слушателя).
 */
// export function setupTree3DZoomVisibility(map, plantationPoints, zoomThreshold = 12) {
//     let tree3DOverlay = null;
//
//     const updateOverlayVisibility = () => {
//         const currentZoom = map.getZoom();
//         console.log(`[setupTree3DZoomVisibility] currentZoom = ${currentZoom}, threshold = ${zoomThreshold}`);
//
//         if (currentZoom < zoomThreshold) {
//             console.log('Текущий зум ниже порога — удаляем overlay (если есть).');
//             if (tree3DOverlay) {
//                 removeTree3DLayers(map, tree3DOverlay);
//                 tree3DOverlay = null;
//             }
//         } else {
//             console.log('Текущий зум выше или равен порогу — создаём или обновляем overlay.');
//             if (!tree3DOverlay) {
//                 tree3DOverlay = initTree3DLayers(map, plantationPoints);
//             } else {
//                 tree3DOverlay = updateTree3DLayers(map, plantationPoints, tree3DOverlay);
//             }
//         }
//     };
//
//     // Проверяем начальный зум
//     updateOverlayVisibility();
//
//     // Подписываемся на изменение зума
//     map.on('zoomend', updateOverlayVisibility);
//
//     // Возвращаем функцию «очистки»
//     return () => {
//         map.off('zoomend', updateOverlayVisibility);
//         if (tree3DOverlay) {
//             removeTree3DLayers(map, tree3DOverlay);
//             tree3DOverlay = null;
//         }
//     };
// }