"""
main.py – формирует offset‑маршрут дрона вокруг запрещённых полигонов,
с последовательностью точек, соответствующей порядку исходного маршрута,
с обработкой boundary‑участков по предложенной логике, очисткой от лишних точек,
а также удалением повторных проходов одного участка с учётом направления движения.

Алгоритм:
1. Получаем данные миссии с сервера (droneData, routePoints, savedPolygons).
2. Строим исходный маршрут, корректируем его (обход пересечений) и дискретизируем с шагом 1 м.
   Каждая точка получает тип: "safe", если расстояние до исходного маршрута меньше порога,
   иначе – "boundary".
3. Для safe‑точек вычисляем offset‑координаты (смещение наружу от ближайшей грани полигона).
4. Для групп boundary‑точек:
   – Преобразуем точки группы в систему UTM.
   – Для каждой точки рассчитываем смещение согласно алгоритму с использованием
     shift_by_neighbor и shift_point (с fallback‑механизмом через буфер полигона).
   – Преобразуем результат обратно в WGS84 и записываем их на соответствующие индексы.
5. Формируется финальный маршрут – последовательность offset‑точек (в порядке дискретизации).
6. После этого маршрут сначала "разрежается" (удаляются точки, слишком близкие друг к другу),
   а затем применяется дополнительная очистка, которая ищет повторные проходы (циклы).
   Если точка появляется повторно (на расстоянии меньше заданного порога) и направления движения
   между началом цикла и его завершением почти противоположны (угол ≥ 150°), то промежуточный участок удаляется.
7. Сохраняется карта (mission_map.html) и JSON с координатами маршрута (offset_route.json).

"""

from __future__ import annotations
import json
import math
import pathlib
import time
import webbrowser
from datetime import datetime, timedelta
from typing import List, Tuple, Dict, Any

import numpy as np
import requests
from geopy.distance import geodesic
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import linemerge
import folium
from folium.plugins import TimestampedGeoJson

# -------------------------
# Константы и трансформеры
# -------------------------
OFFSET = 3.0       # смещение (метров) наружу от полигона
STEP = 1.0         # шаг дискретизации (в метрах)
TOLERANCE_M = 1.0  # порог для классификации safe/boundary (в метрах)

# Трансформеры для преобразования координат (WGS84 ↔ UTM)
TRANS_TO_M = Transformer.from_crs("epsg:4326", "epsg:32637", always_xy=True)   # WGS84 → UTM
TRANS_TO_WGS = Transformer.from_crs("epsg:32637", "epsg:4326", always_xy=True)   # UTM → WGS84

def wgs_to_utm(lng: float, lat: float) -> Tuple[float, float]:
    """
    Преобразует координаты из формата WGS84 (lng, lat) в UTM.

    Args:
        lng (float): Долгота.
        lat (float): Широта.

    Returns:
        Tup
    """
    return TRANS_TO_M.transform(lng, lat)

def utm_to_wgs(x: float, y: float) -> Tuple[float, float]:
    """
    Преобразует координаты из формата UTM в WGS84 (lat, lng).

    Args:
        x (float): Координата X в UTM.
        y (float): Координата Y в UTM.

    Returns:
        Tuple[float, float]: Координаты в формате (lat, lng) WGS84.
    """
    lng, lat = TRANS_TO_WGS.transform(x, y)
    return lat, lng

# -------------------------
# Функция "разрежения" маршрута – удаляет точки, которые слишком близки друг к другу
# -------------------------
def reduce_route(route: List[Tuple[float, float]], min_distance_m: float = 0.9) -> List[Tuple[float, float]]:
    """
    Удаляет из маршрута точки, которые расположены ближе друг к другу, чем min_distance_m.

    Args:
        route (List[Tuple[float, float]]): Список точек маршрута в формате (lat, lng).
        min_distance_m (float): Минимальное допустимое расстояние между соседними точками (в метрах).

    Returns:
        List[Tuple[float, float]]: Разрежённый маршрут без избыточных точек.
    """
    if not route:
        return []

    reduced = [route[0]]
    for pt in route[1:]:
        last_pt = reduced[-1]
        if geodesic(last_pt, pt).meters >= min_distance_m:
            reduced.append(pt)
    return reduced

# -------------------------
# Функция комбинированного удаления циклов (учитывает повторное приближение и изменение направления)
# -------------------------
def remove_loops_composite(route: List[Tuple[float, float]],
                           distance_threshold: float = 2.0,
                           angle_threshold: float = 150.0) -> List[Tuple[float, float]]:
    """
    Удаляет циклы из маршрута, используя сочетание проверки расстояния и направления движения.

    Если точка route[j] оказывается ближе, чем distance_threshold к точке route[i] (при условии, что между ними как минимум 2 точки),
    и угол между векторами направления (от route[i]→route[i+1] и от route[j-1]→route[j]) превышает angle_threshold,
    удаляются все точки между route[i] и route[j].

    Args:
        route (List[Tuple[float, float]]): Маршрут в виде списка точек (lat, lng).
        distance_threshold (float): Порог расстояния для определения повторного прохода (в метрах).
        angle_threshold (float): Порог угла (в градусах) для определения разворота.

    Returns:
        List[Tuple[float, float]]: Очистенный маршрут без циклических повторов.
    """
    if not route:
        return []

    cleaned = route.copy()
    i = 0
    while i < len(cleaned) - 2:
        j = i + 2
        while j < len(cleaned):
            if geodesic(cleaned[i], cleaned[j]).meters < distance_threshold:
                # Вычисляем направления: от i к i+1 и от j-1 к j
                v1 = np.array([cleaned[i+1][0] - cleaned[i][0], cleaned[i+1][1] - cleaned[i][1]])
                v2 = np.array([cleaned[j][0] - cleaned[j-1][0], cleaned[j][1] - cleaned[j-1][1]])
                norm1 = np.linalg.norm(v1)
                norm2 = np.linalg.norm(v2)
                if norm1 == 0 or norm2 == 0:
                    angle = 0.0
                else:
                    cos_angle = np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0)
                    angle = math.degrees(math.acos(cos_angle))
                if angle >= angle_threshold:
                    # Обнаружен цикл – удаляем все точки от i+1 до j-1
                    cleaned = cleaned[:i+1] + cleaned[j:]
                    # После удаления начинаем проверку с той же точки i
                    j = i + 2
                    continue
            j += 1
        i += 1
    return cleaned

# -------------------------
# Функции для обработки boundary‑участков (ваша логика смещения)
# -------------------------
def is_valid(pt: Point, poly: Polygon) -> bool:
    """
    Проверяет, что точка не находится внутри полигона и не касается его границ.

    Args:
        pt (Point): Объект точки (Shapely).
        poly (Polygon): Объект полигона (Shapely).

    Returns:
        bool: True, если точка валидна, иначе False.
    """
    return (not poly.contains(pt)) and (not poly.touches(pt))

def shift_by_neighbor(point: Point, idx: int, points: List[Point], poly: Polygon, base_offset: float) -> Point:
    """
    Вычисляет смещение точки по биссектрисе угла, образованного соседними точками.

    Если один из рассчитанных кандидатов удовлетворяет условию (точка выходит за границы полигона),
    возвращается смещенная точка, иначе возвращается исходная точка.

    Args:
        point (Point): Текущая точка, которую нужно сместить.
        idx (int): Индекс точки в списке.
        points (List[Point]): Список точек (сегмент) в UTM.
        poly (Polygon): Полигон (в UTM), относительно которого вычисляется смещение.
        base_offset (float): Базовое смещение (в метрах).

    Returns:
        Point: Смещённая точка (если вычисление прошло успешно) или исходная точка.
    """
    n = len(points)
    if n < 2:
        return point

    neighbor_prev = points[(idx - 1) % n]
    neighbor_next = points[(idx + 1) % n]

    v1 = np.array([neighbor_next.x - point.x, neighbor_next.y - point.y])
    v2 = np.array([point.x - neighbor_prev.x, point.y - neighbor_prev.y])
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return point

    v1_unit = v1 / norm1
    v2_unit = v2 / norm2
    bisector = v1_unit + v2_unit
    norm_bis = np.linalg.norm(bisector)
    if norm_bis == 0:
        bisector = np.array([-v1_unit[1], v1_unit[0]])
    else:
        bisector = bisector / norm_bis

    perp1 = np.array([-bisector[1], bisector[0]])
    perp2 = np.array([bisector[1], -bisector[0]])

    candidate1 = Point(point.x + base_offset * perp1[0], point.y + base_offset * perp1[1])
    candidate2 = Point(point.x + base_offset * perp2[0], point.y + base_offset * perp2[1])

    if is_valid(candidate1, poly):
        return candidate1
    elif is_valid(candidate2, poly):
        return candidate2
    else:
        return point

def shift_point(point: Point, idx: int, points: List[Point], poly: Polygon,
                base_offset: float, poly_offset: Polygon) -> Point:
    """
    Смещает точку, используя функцию shift_by_neighbor.

    Если полученный кандидат не удовлетворяет условиям валидности, применяется fallback‑механизм:
    проекция точки на внешний контур offset‑полигона с корректировкой.

    Args:
        point (Point): Исходная точка для смещения.
        idx (int): Индекс точки в списке.
        points (List[Point]): Список точек, составляющих сегмент (в UTM).
        poly (Polygon): Полигон (в UTM), относительно которого происходит смещение.
        base_offset (float): Базовое смещение (в метрах).
        poly_offset (Polygon): Буферный полигон для fallback‑проекции.

    Returns:
        Point: Смещённая точка (в UTM), соответствующая заданным критериям.
    """
    candidate = shift_by_neighbor(point, idx, points, poly, base_offset)
    if candidate is None or not is_valid(candidate, poly):
        t = poly_offset.exterior.project(point)
        candidate = poly_offset.exterior.interpolate(t)
        if not is_valid(candidate, poly):
            candidate = Point(candidate.x + 0.1, candidate.y + 0.1)
    return candidate

# -------------------------
# Класс MissionManager
# -------------------------
class MissionManager:
    def __init__(self, drone: Dict[str, Any], route_pts: List[Dict[str, float]],
                 polygons_geojson: Dict[str, Any]):
        """
        Инициализирует MissionManager с данными миссии.

        Args:
            drone (Dict[str, Any]): Данные дрона, содержащие координаты.
            route_pts (List[Dict[str, float]]): Список точек исходного маршрута.
            polygons_geojson (Dict[str, Any]): GeoJSON-структура с запрещёнными полигонами.
        """
        self.drone = drone
        self.route_pts = route_pts
        self.polygons_geojson = polygons_geojson

        # Преобразуем полигоны: WGS84 и их UTM-версию
        self.polygons_wgs: List[Polygon] = [shape(f["geometry"]) for f in polygons_geojson["features"]]
        self.polygons_utm: List[Polygon] = [self._poly_to_utm(p) for p in self.polygons_wgs]

        # Список дискретизированных точек и их типов:
        # каждый элемент — {"index": int, "wgs": (lat, lng), "type": "safe"|"boundary"}
        self.disc_points: List[Dict[str, Any]] = []
        # Итоговый маршрут (final_route) — список offset‑точек (в WGS84)
        self.final_route: List[Tuple[float, float]] = []

    @classmethod
    def from_server(cls, url: str = "http://localhost:5005/get-mission") -> "MissionManager":
        """
        Фабричный метод для создания экземпляра MissionManager путём загрузки данных миссии с сервера.

        Args:
            url (str): URL для получения данных миссии.

        Returns:
            MissionManager: Новый экземпляр с загруженными данными.
        """
        print("[INFO] Fetching mission data …")
        data = requests.get(url, timeout=5).json()
        required = {"droneData", "routePoints", "savedPolygons"}
        if not required.issubset(data):
            raise ValueError(f"Некорректный ответ сервера: {data}")
        return cls(data["droneData"], data["routePoints"], data["savedPolygons"])

    def run(self, out_html: pathlib.Path | str = "mission_map.html") -> None:
        """
        Запускает процесс построения маршрута и сохраняет результаты.

        Этапы:
        1. Дискретизация исходного маршрута и классификация точек.
        2. Вычисление offset‑точек (для safe и boundary участков).
        3. Очистка маршрута от избыточных точек и циклов.
        4. Сохранение карты и JSON-результата.

        Args:
            out_html (pathlib.Path | str): Путь для сохранения HTML-карты.
        """
        t0 = time.time()
        self._classify_points()
        self._build_offsets()
        # Первый этап очистки: удаляем точки, слишком близкие друг к другу
        self.final_route = reduce_route(self.final_route, min_distance_m=0.95)
        # Второй этап: удаляем повторные проходы (циклы) с учетом направления движения
        self.final_route = remove_loops_composite(self.final_route, distance_threshold=2.0, angle_threshold=150.0)
        self._save_outputs(pathlib.Path(out_html))
        print(f"[INFO] Mission complete in {time.time()-t0:.1f}s • final route points: {len(self.final_route)}")

    # -------------------------
    # 1. Дискретизация маршрута и классификация точек
    # -------------------------
    def _classify_points(self) -> None:
        """
        Дискретизирует исходный маршрут и классифицирует каждую точку как "safe" или "boundary".

        - Строится линия маршрута из входных точек.
        - Корректируются сегменты, пересекающие полигоны.
        - Выполняется дискретизация с шагом STEP (1 м).
        - Каждая точка сравнивается с исходным маршрутом, и если расстояние меньше TOLERANCE_M, то метка "safe",
          иначе – "boundary".
        """
        route_line = LineString([(pt["lng"], pt["lat"]) for pt in self.route_pts])
        segments = [LineString([route_line.coords[i], route_line.coords[i+1]])
                    for i in range(len(route_line.coords)-1)]
        corrected_segments: List[LineString] = [self._correct_segment(seg) for seg in segments]
        corrected_coords: List[Tuple[float, float]] = []
        for seg in corrected_segments:
            coords = list(seg.coords)
            if corrected_coords and coords[0] == corrected_coords[-1]:
                corrected_coords.extend(coords[1:])
            else:
                corrected_coords.extend(coords)
        corrected_route = LineString(corrected_coords)
        original_route_m = LineString([wgs_to_utm(lon, lat) for lon, lat in route_line.coords])
        corrected_route_m = LineString([wgs_to_utm(lon, lat) for lon, lat in corrected_route.coords])

        def gen_points(line: LineString, step: float) -> List[Point]:
            pts, d = [], 0.0
            while d <= line.length:
                pts.append(line.interpolate(d))
                d += step
            return pts

        disc_pts_m = gen_points(corrected_route_m, STEP)
        self.disc_points = []
        for i, pt in enumerate(disc_pts_m):
            pt_wgs = utm_to_wgs(pt.x, pt.y)
            pt_type = "safe" if pt.distance(original_route_m) < TOLERANCE_M else "boundary"
            self.disc_points.append({"index": i, "wgs": pt_wgs, "type": pt_type})
        print(f"[INFO] Дискретизировано точек: {len(self.disc_points)}")

    # -------------------------
    # 2. Вычисление offset‑точек для safe и boundary участков
    # -------------------------
    def _build_offsets(self) -> None:
        """
        Вычисляет offset‑точки для маршрута.

        - Для каждой "safe" точки вычисляется offset‑координата через проекцию на ближайшую грань полигона.
        - Для последовательных "boundary" точек формируются сегменты, переводятся в UTM,
          для которых рассчитывается смещение с использованием функций shift_by_neighbor и shift_point.
        - Результаты преобразуются обратно в WGS84 и записываются в итоговый маршрут.
        """
        offset_points = [None] * len(self.disc_points)
        # Обработка safe‑точек
        for i, dp in enumerate(self.disc_points):
            if dp["type"] == "safe":
                offset_points[i] = self._compute_safe_offset(dp["wgs"])

        # Группировка подряд идущих boundary‑точек
        boundary_segments = []  # список: (список индексов, список точек)
        current_indices, current_points = [], []
        for dp in self.disc_points:
            if dp["type"] == "boundary":
                current_indices.append(dp["index"])
                current_points.append(dp["wgs"])
            else:
                if current_points:
                    boundary_segments.append((current_indices, current_points))
                    current_indices, current_points = [], []
        if current_points:
            boundary_segments.append((current_indices, current_points))

        # Обработка каждого сегмента boundary‑точек
        for indices, segment in boundary_segments:
            seg_utm = []
            for lat, lng in segment:
                x, y = wgs_to_utm(lng, lat)
                seg_utm.append(Point(x, y))
            poly_utm = self.polygons_utm[0]  # используем первый полигон
            base_offset = OFFSET
            poly_offset = poly_utm.buffer(base_offset, resolution=16, join_style=2, cap_style=2)
            shifted = []
            n = len(seg_utm)
            for i, pt in enumerate(seg_utm):
                if i == n - 1 and n > 1:
                    k = min(3, n - 1)
                    disp_vectors = []
                    if k > 0 and len(shifted) >= k:
                        for j in range(len(shifted)-k, len(shifted)):
                            dx = shifted[j].x - seg_utm[j].x
                            dy = shifted[j].y - seg_utm[j].y
                            disp_vectors.append((dx, dy))
                        avg_disp = np.mean(disp_vectors, axis=0)
                        candidate = Point(pt.x + avg_disp[0], pt.y + avg_disp[1])
                    else:
                        candidate = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                    if not is_valid(candidate, poly_utm):
                        tangent = np.array([seg_utm[i].x - seg_utm[i-1].x, seg_utm[i].y - seg_utm[i-1].y])
                        norm_t = np.linalg.norm(tangent)
                        if norm_t != 0:
                            t_unit = tangent / norm_t
                            normal1 = np.array([-t_unit[1], t_unit[0]])
                            normal2 = np.array([t_unit[1], -t_unit[0]])
                            candidate1 = Point(pt.x + base_offset * normal1[0], pt.y + base_offset * normal1[1])
                            candidate2 = Point(pt.x + base_offset * normal2[0], pt.y + base_offset * normal2[1])
                            if is_valid(candidate1, poly_utm):
                                candidate = candidate1
                            elif is_valid(candidate2, poly_utm):
                                candidate = candidate2
                            else:
                                t_proj = poly_offset.exterior.project(pt)
                                candidate = poly_offset.exterior.interpolate(t_proj)
                                if not is_valid(candidate, poly_utm):
                                    candidate = Point(candidate.x + 0.1, candidate.y + 0.1)
                        else:
                            candidate = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                else:
                    candidate = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                shifted.append(candidate)
            for idx, pt in zip(indices, shifted):
                offset_points[idx] = utm_to_wgs(pt.x, pt.y)

        # Заполняем оставшиеся None исходными значениями
        for i in range(len(offset_points)):
            if offset_points[i] is None:
                offset_points[i] = self.disc_points[i]["wgs"]

        self.final_route = offset_points
        print(f"[INFO] Итоговый маршрут сформирован: {len(self.final_route)} точек")

    # -------------------------
    # Вычисление safe‑offset точки (по проекции на ближайшую грань полигона)
    # -------------------------
    def _compute_safe_offset(self, pt_wgs: Tuple[float, float]) -> Tuple[float, float]:
        """
        Вычисляет safe‑offset точку для заданной точки.

        Функция:
        - Находит ближайшую грань полигона (с использованием _project_to_nearest_polygon).
        - Вычисляет вектор от проекции до исходной точки и смещает её на фиксированное расстояние (OFFSET).
        - Если полученная точка оказывается внутри полигона, смещение производится в обратную сторону.

        Args:
            pt_wgs (Tuple[float, float]): Исходная точка в формате WGS84 (lat, lng).

        Returns:
            Tuple[float, float]: Точка с рассчитанным safe‑offset в формате WGS84.
        """
        proj, poly = self._project_to_nearest_polygon(pt_wgs)
        if proj is None:
            return pt_wgs
        safe_x, safe_y = wgs_to_utm(pt_wgs[1], pt_wgs[0])
        v = np.array([safe_x - proj.x, safe_y - proj.y])
        norm = np.linalg.norm(v)
        if norm == 0:
            return pt_wgs
        unit = v / norm
        candidate = Point(proj.x + OFFSET * unit[0], proj.y + OFFSET * unit[1])
        if poly.contains(candidate):
            candidate = Point(proj.x - OFFSET * unit[0], proj.y - OFFSET * unit[1])
        return utm_to_wgs(candidate.x, candidate.y)

    # -------------------------
    # Геометрические вспомогательные функции
    # -------------------------
    def _project_to_nearest_polygon(self, pt_wgs: Tuple[float, float]) -> Tuple[Any, Any]:
        """
        Находит ближайшую точку проекции заданной точки pt_wgs на грань полигона,
        а также возвращает соответствующий полигон.

        Args:
            pt_wgs (Tuple[float, float]): Точка в формате WGS84 (lat, lng).

        Returns:
            Tuple[Any, Any]: Пара (проекция (Point в UTM), полигон (Polygon)).
                             Если проекция не найдена – (None, None).
        """
        best_proj, best_poly, best_dist = None, None, float("inf")
        x, y = wgs_to_utm(pt_wgs[1], pt_wgs[0])
        for poly in self.polygons_utm:
            for a, b in zip(poly.exterior.coords[:-1], poly.exterior.coords[1:]):
                proj, dist = self._point_to_segment_projection((x, y), a, b)
                if dist < best_dist:
                    best_dist, best_proj, best_poly = dist, proj, poly
        if best_proj is None:
            return None, None
        return Point(best_proj), best_poly

    def _point_to_segment_projection(self, p, a, b) -> Tuple[Any, float]:
        """
        Вычисляет проекцию точки p на отрезок (a, b) и возвращает проекцию и расстояние от p до проекции.

        Args:
            p: Координаты точки (массив или кортеж).
            a: Начало отрезка.
            b: Конец отрезка.

        Returns:
            Tuple[Any, float]: Пара (проекция на отрезок, расстояние от p до проекции).
        """
        p, a, b = np.array(p), np.array(a), np.array(b)
        ab = b - a
        if np.allclose(ab, 0):
            return a, np.linalg.norm(p - a)
        t = np.clip(np.dot(p - a, ab) / np.dot(ab, ab), 0, 1)
        proj = a + t * ab
        return proj, np.linalg.norm(p - proj)

    def _poly_to_utm(self, poly_wgs: Polygon) -> Polygon:
        """
        Преобразует полигон, заданный в WGS84, в систему UTM.

        Args:
            poly_wgs (Polygon): Полигон в системе WGS84.

        Returns:
            Polygon: Полигон, преобразованный в UTM.
        """
        coords = list(poly_wgs.exterior.coords)
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        utm_coords = [wgs_to_utm(lon, lat) for lon, lat in coords]
        return Polygon(utm_coords)

    def _correct_segment(self, segment: LineString) -> LineString:
        """
        Корректирует сегмент маршрута, если он пересекается с границами полигонов.

        Для каждого полигона, с которым пересекается сегмент, происходит:
        - Вычисление точек входа и выхода через пересечение.
        - Построение обхода вдоль границы полигона.
        - Замена части исходного сегмента обходным путем.

        Args:
            segment (LineString): Исходный сегмент маршрута.

        Returns:
            LineString: Скорректированный сегмент маршрута.
        """
        for poly in self.polygons_wgs:
            if not segment.intersects(poly):
                continue
            inter = segment.intersection(poly)
            if inter.is_empty:
                continue
            if inter.geom_type == "LineString":
                entry, exit = Point(inter.coords[0]), Point(inter.coords[-1])
            else:
                merged = linemerge(inter)
                coords = list(merged.coords) if merged.geom_type == "LineString" else [p.coords[0] for p in merged]
                entry, exit = Point(coords[0]), Point(coords[-1])
            boundary = poly.exterior
            entry_d, exit_d = boundary.project(entry), boundary.project(exit)
            if entry_d > exit_d:
                entry_d, exit_d = exit_d, entry_d
            total = boundary.length
            cand1 = LineString([boundary.interpolate(d).coords[0] for d in np.linspace(entry_d, exit_d, 50)])
            cand2 = LineString([boundary.interpolate((exit_d + d) % total).coords[0] for d in np.linspace(0, total - (exit_d - entry_d), 50)])
            bypass = cand1 if cand1.length < cand2.length else cand2
            seg_coords = list(segment.coords)
            entry_idx = self._nearest_index(seg_coords, entry)
            exit_idx = self._nearest_index(seg_coords, exit)
            if entry_idx > exit_idx:
                entry_idx, exit_idx = exit_idx, entry_idx
            new_coords = seg_coords[:entry_idx+1] + list(bypass.coords) + seg_coords[exit_idx:]
            return LineString(new_coords)
        return segment

    def _nearest_index(self, coords: List[Tuple[float, float]], pt: Point) -> int:
        """
        Находит индекс точки из списка coords, ближайшей к заданной точке pt.

        Args:
            coords (List[Tuple[float, float]]): Список координат (lat, lng).
            pt (Point): Целевая точка.

        Returns:
            int: Индекс ближайшей точки в списке.
        """
        arr = np.array(coords)
        dists = np.linalg.norm(arr - np.array(pt.coords[0]), axis=1)
        return int(np.argmin(dists))

    # -------------------------
    # Вывод результатов: сохранение карты и маршрута
    # -------------------------
    def _save_outputs(self, out_html: pathlib.Path) -> None:
        """
        Сохраняет итоговый маршрут и карту.

        - Формирует HTML-страницу с картой (mission_map.html) с использованием Folium.
        - Сохраняет итоговый маршрут в JSON (offset_route.json).

        Args:
            out_html (pathlib.Path): Путь для сохранения HTML-файла с картой.
        """
        out_html = out_html.expanduser().resolve()
        self._save_map(out_html)
        json_path = out_html.with_name("offset_route.json")
        with json_path.open("w", encoding="utf8") as f:
            json.dump([{"lat": lat, "lng": lng} for lat, lng in self.final_route],
                      f, ensure_ascii=False, indent=2)
        print(f"[INFO] Offset route saved to {json_path}")

        try:
            webbrowser.open(out_html.as_uri())
        except ValueError:
            webbrowser.open(f"file://{out_html}")

    def _save_map(self, out_html: pathlib.Path) -> None:
        """
        Формирует и сохраняет карту маршрута с использованием Folium.

        - Добавляет полигоны, исходный маршрут и маркер дрона на карту.
        - Визуализирует маршрут через TimestampedGeoJson слой.

        Args:
            out_html (pathlib.Path): Путь для сохранения HTML-файла с картой.
        """
        m = folium.Map(location=[self.drone["lat"], self.drone["lng"]], zoom_start=16)
        folium.GeoJson(
            self.polygons_geojson,
            style_function=lambda _: {"fillColor": "gray", "color": "black", "weight": 2, "fillOpacity": 0.3}
        ).add_to(m)
        if self.route_pts:
            folium.PolyLine([(pt["lat"], pt["lng"]) for pt in self.route_pts],
                            color="blue", weight=2, tooltip="Original").add_to(m)
        # if self.final_route:
        #     folium.PolyLine(self.final_route, color="green", weight=3, tooltip="Offset Route").add_to(m)
        #     for pt in self.final_route:
        #         folium.CircleMarker(pt, radius=3, color="green", fill=True, fill_color="green").add_to(m)

        folium.Marker([self.drone["lat"], self.drone["lng"]],
                      popup="Drone", icon=folium.Icon(color="black")).add_to(m)
        features = []
        start_time = datetime.utcnow()
        time_step = timedelta(seconds=2)
        current_time = start_time
        for i, (lat, lng) in enumerate(self.final_route):
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "time": current_time.isoformat(),
                    "style": {"color": "green", "fillColor": "green", "radius": 4},
                    "icon": "circle",
                    "popup": f"Point #{i+1}"
                }
            })
            current_time += time_step
        if features:
            TimestampedGeoJson(
                {"type": "FeatureCollection", "features": features},
                transition_time=200, period="PT1S", add_last_point=True, loop=False, auto_play=False
            ).add_to(m)
        m.save(out_html)
        print(f"[INFO] Map saved to {out_html}")

# -------------------------
# Запуск модуля
# -------------------------
if __name__ == "__main__":
    MissionManager.from_server().run()