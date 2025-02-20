// trees3D.js

import { MapboxOverlay } from '@deck.gl/mapbox';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { TruncatedConeGeometry, SphereGeometry } from '@luma.gl/engine';
import { COORDINATE_SYSTEM } from '@deck.gl/core';

import crownTexture from '../assets/leaves.png';

/**
 * Подготавливает данные для каждого дерева
 * (только вычисления, без ручной проекции Mercator).
 */
function prepareTreeData(plantationPoints) {
    return plantationPoints.map(pt => {
        // Пусть height — общая высота дерева, а crownSize — диаметр кроны
        const trunkHeight = pt.height * 0.75; // 75% высоты — ствол
        const trunkDiameter = pt.height * 0.1; // 10% от высоты — диаметр ствола
        const crownDiameter = pt.crownSize;    // crownSize воспринимаем как диаметр кроны
        const crownRadius = crownDiameter / 2; // радиус кроны (для позиционирования сферы)

        return {
            lng: pt.lng,   // долгота
            lat: pt.lat,   // широта
            trunkHeight,
            trunkDiameter,
            crownDiameter,
            crownRadius
        };
    });
}

/**
 * Создаём слой ствола (усечённый конус).
 */
function createTrunkLayer(treeData) {
    return new SimpleMeshLayer({
        id: 'tree-trunk-layer',
        data: treeData,
        // Усечённый конус. В luma.gl высота вдоль оси Y.
        mesh: new TruncatedConeGeometry({
            topRadius: 1,
            bottomRadius: 1.0,
            height: 1,
            nradial: 6
            // по желанию можно добавить параметр nradial (кол-во граней)
            // например, nradial: 6 — тогда основание будет гексагональное
        }),
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,

        // Позиция (lng, lat, altitude)
        getPosition: d => [d.lng, d.lat, d.trunkHeight / 2],

        // Ориентация. Если хотим, чтобы конус «рос» по оси Y (как в luma.gl),
        // но в Deck.gl ось Z — вертикаль, обычно делают поворот на ±90° вокруг X.
        // Если при [0,0,0] у вас получается вертикальный ствол — оставляйте так.
        // Если лежит на боку, укажите [90,0,0] или [-90,0,0].
        getOrientation: [0, 0, 90],

        // Масштаб: [радиус_по_X, радиус_по_Y, высота_по_Z]
        // С учётом того, что TruncatedConeGeometry «вытягивается» по Y:
        //   - высота: идёт в компоненты, связанные с Y (или Z, если повернули)
        //   - радиусы: по X и Z.
        // Ниже пример, если NO поворота (orientation: [0,0,0]):
        //   → высота идёт по Y, значит => (X=trunkDiameter, Y=trunkHeight, Z=trunkDiameter).
        // Если поворот [90,0,0], тогда Y->Z, значит (X=..., Y=..., Z=trunkHeight).
        // getScale: d => [d.trunkDiameter, d.trunkHeight, d.trunkDiameter],

        getScale: d => {
            const radius = d.trunkDiameter / 2;
            return [radius, d.trunkHeight, radius];
        },

        getColor: [67, 39, 21],
        opacity: 1
    });
}

/**
 * Создаём слой кроны (сфера).
 */
function createCrownLayer(treeData) {
    return new SimpleMeshLayer({
        id: 'tree-crown-layer',
        data: treeData,
        mesh: new SphereGeometry({ radius: 1, nradial: 16, nvertical: 8 }),
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        texture: crownTexture,

        // Ставим центр сферы над вершиной ствола:
        // ствол высотой trunkHeight, у кроны радиус crownRadius
        // getPosition: d => [d.lng, d.lat, d.trunkHeight + (d.crownRadius * 0.25)],

        // Центр сферы на (вершина ствола) + (радиус сферы),
        // т. е. d.trunkHeight + d.crownDiameter/2
        getPosition: d => {
            // const crownRadius = d.crownDiameter / 2;
            return [d.lng, d.lat, d.trunkHeight];
        },

        getOrientation: [0, 0, 90],

        // Масштаб (три одинаковых значения, т.к. сфера).
        // Если crownDiameter=6 => радиус=3 => scale = [6,6,6].
        getScale: d => [d.crownDiameter, d.crownDiameter, d.crownDiameter],

        getColor: [175, 216, 142],
        opacity: 1
    });
}



/**
 * Создаём Overlay из двух слоёв (ствол + крона).
 */
function createTreeOverlay(treeData) {
    const trunkLayer = createTrunkLayer(treeData);
    const crownLayer = createCrownLayer(treeData);

    return new MapboxOverlay({
        layers: [trunkLayer, crownLayer]
    });
}

/**
 * Инициализирует и добавляет 3D overlay деревьев на карту.
 */
export function initTree3DLayers(map, plantationPoints) {
    if (!map || !plantationPoints || !plantationPoints.length) return;

    // Подготавливаем данные
    const treeData = prepareTreeData(plantationPoints);
    console.log('[Tree3D] Data:', treeData);

    // Создаём overlay
    const overlay = createTreeOverlay(treeData);

    // Добавляем overlay на карту
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