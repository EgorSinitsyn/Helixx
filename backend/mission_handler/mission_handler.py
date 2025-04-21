"""
mission_handler.py – формирует offset‑маршрут дрона вокруг запрещённых полигонов,
с последовательностью точек, соответствующей порядку исходного маршрута,
с обработкой boundary‑участков по предложенной логике, очисткой от лишних точек,
удалением повторных проходов одного участка с учётом направления движения,
а также сглаживанием переходных участков через взвешенную интерполяцию.

Алгоритм:
1. Получение данных миссии:
   - Запрашивает с сервера данные миссии, включающие:
     - **droneData:** базовые данные о дроне (например, его текущие координаты);
     - **routePoints:** исходный маршрут, представленный как список точек;
     - **savedPolygons:** запрещённые полигоны в формате GeoJSON.

2. Построение исходного маршрута и дискретизация:
   - Создается исходная линия маршрута на основе входных точек.
   - Если маршрут пересекается с запрещёнными полигонами, применяется корректировка (обход).
   - Маршрут дискретизируется с шагом 1 метр для получения плотного набора точек.
   - Каждая дискретизированная точка оценивается по расстоянию до исходного маршрута:
     - Если расстояние меньше **TOLERANCE_DOWN** (например, 0.9 м) — точка классифицируется как «safe».
     - Если расстояние больше **TOLERANCE_UP** (например, 1.1 м) — точка считается «boundary».
     - Для точек, находящихся между пороговыми значениями, используется предыдущая классификация (механизм гистерезиса).
   - Дополнительно для каждой точки сохраняется её расстояние (dist) до исходного маршрута.

3. Вычисление offset‑точек для safe‑участков:
   - Для точек, обозначенных как safe, вычисляется offset‑координата:
     - Точка переводится в систему UTM.
     - Находится ближайшая грань полигона через проекцию.
     - Точка смещается наружу на фиксированное расстояние (OFFSET, например, 3 м); если смещенная точка оказывается внутри полигона, смещение выполняется в обратном направлении.
     - Результат сохраняется как объект `Point` (в UTM).

4. Обработка boundary‑участков с плавным переходом:
   - Последовательные boundary‑точки группируются в сегменты.
   - Для каждой группы точек:
     - Точки переводятся в систему UTM.
     - Для каждой точки вычисляется два кандидата:
       - Boundary‑offset: рассчитывается с использованием методов `shift_point`/`shift_by_neighbor` (с fallback‑механизмом через буфер полигона).
       - Safe‑offset: рассчитывается так же, как для safe‑точек.
     - Если расстояние точки (dist) находится в переходном интервале \[TOLERANCE_DOWN, TOLERANCE_UP\], итоговый offset вычисляется как линейная интерполяция между safe‑и boundary‑offset значениями (функция `interpolate_offset`).
     - Результат сохраняется как объект `Point` (в UTM).

5. Формирование итогового маршрута:
   - Все вычисленные offset‑точки (объекты `Point` в UTM) объединяются в единый маршрут в порядке дискретизации.

6. Очистка и сглаживание маршрута:
   - Применяется функция `reduce_route` для удаления точек, расположенных слишком близко друг к другу.
   - Затем функция `remove_loops_composite` удаляет циклы маршрута, когда дрон проходит один и тот же участок в разных направлениях, используя критерии расстояния и изменения направления.
   - Наконец, функция `smooth_route` сглаживает маршрут методом скользящего среднего для устранения резких переходов.

7.*Финальное преобразование и сохранение:
   - Итоговый маршрут, представленный как список объектов `Point` в системе UTM, преобразуется в WGS84 (список кортежей (lat, lng)).
   - Функция находит значение altitude из исходного маршрута для точки (lat, lng), выбирая точку, ближайшую к заданным координатам и выставляет ее значение для новой точки
   - Результат сохраняется в виде HTML‑карты (mission_map.html) с визуализацией маршрута (с использованием библиотеки Folium и плагина TimestampedGeoJson) и JSON-файла (offset_route.json) для дальнейшего использования.
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
# OFFSET = 3.0       # смещение (метров) наружу от полигона
STEP = 1.0         # шаг дискретизации (в метрах)
# TOLERANCE_M = 1.0  # порог для классификации safe/boundary (в метрах)
TOLERANCE_DOWN = 0.9  # Нижний порог (в метрах) для safe точек
TOLERANCE_UP = 1.1  # Верхний порог (в метрах) для boundary точек

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
# Функция линейной интерполяции для плавного перехода
# -------------------------
def interpolate_offset(safe_offset: Point, boundary_offset: Point,
                       dist: float,
                       tol_down: float = TOLERANCE_DOWN,
                       tol_up: float = TOLERANCE_UP) -> Point:
    """
    Вычисляет итоговый offset как линейную интерполяцию между safe_offset и boundary_offset,
    если расстояние dist находится в промежутке [tol_down, tol_up].

    Args:
        safe_offset (Point): Offset, рассчитанный по safe‑логике (в UTM).
        boundary_offset (Point): Offset, рассчитанный по boundary‑логике (в UTM).
        dist (float): Расстояние до исходного маршрута.
        tol_down (float): Нижний порог.
        tol_up (float): Верхний порог.

    Returns:
        Point: Итоговый offset в системе UTM.
    """
    if dist <= tol_down:
        return safe_offset
    elif dist >= tol_up:
        return boundary_offset
    ratio = (dist - tol_down) / (tol_up - tol_down)
    new_x = safe_offset.x * (1 - ratio) + boundary_offset.x * ratio
    new_y = safe_offset.y * (1 - ratio) + boundary_offset.y * ratio
    return Point(new_x, new_y)

# -------------------------
# Функция "разрежения" маршрута – удаляет точки, которые слишком близки друг к другу
# -------------------------
def reduce_route(route: List[Point], min_distance_m: float = 0.9) -> List[Point]:
    """
    Удаляет из маршрута точки, которые расположены ближе друг к другу, чем min_distance_m.

    Args:
        route: Список offset‑точек (в UTM).
        min_distance_m : Минимальное допустимое расстояние между соседними точками (в метрах).

    Returns:
        List[Tuple[float, float]]: Разрежённый маршрут без избыточных точек.
    """
    if not route:
        return []

    reduced = [route[0]]
    for pt in route[1:]:
        if pt.distance(reduced[-1]) >= min_distance_m:
            reduced.append(pt)
    return reduced

# -------------------------
# Функция комбинированного удаления циклов (учитывает повторное приближение и изменение направления)
# -------------------------
def remove_loops_composite(route: List[Point],
                           distance_threshold: float = 2.0,
                           angle_threshold: float = 150.0) -> List[Point]:
    """
    Удаляет циклы из маршрута, используя проверку расстояния и изменения направления.
    Работает с точками в UTM, используя метод .distance() для вычисления евклидова расстояния.

    Если точка route[j] находится ближе, чем distance_threshold к точке route[i]
    (при наличии минимум 2 промежуточных точек) и угол между векторами (от route[i]→route[i+1]
    и от route[j-1]→route[j]) ≥ angle_threshold, удаляются точки между route[i] и route[j].

    Args:
        route (List[Point]): Маршрут в виде списка объектов Point (UTM).
        distance_threshold (float): Порог расстояния в метрах.
        angle_threshold (float): Порог угла в градусах.

    Returns:
        List[Point]: Очищенный маршрут.
    """
    if not route:
        return []

    cleaned = route.copy()
    i = 0
    while i < len(cleaned) - 2:
        j = i + 2
        while j < len(cleaned):
            # Используем метод .distance() вместо geopy.geodesic
            if cleaned[i].distance(cleaned[j]) < distance_threshold:
                v1 = np.array([cleaned[i+1].x - cleaned[i].x, cleaned[i+1].y - cleaned[i].y])
                v2 = np.array([cleaned[j].x - cleaned[j-1].x, cleaned[j].y - cleaned[j-1].y])
                norm1 = np.linalg.norm(v1)
                norm2 = np.linalg.norm(v2)
                angle = 0.0
                if norm1 and norm2:
                    cos_angle = np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0)
                    angle = math.degrees(math.acos(cos_angle))
                if angle >= angle_threshold:
                    cleaned = cleaned[:i+1] + cleaned[j:]
                    j = i + 2
                    continue
            j += 1
        i += 1
    return cleaned

# -------------------------
# Функция сглаживания маршрута (скользящее среднее)
# -------------------------
def smooth_route(route: List[Point], window_size: int = 5) -> List[Point]:
    """
    Применяет сглаживание маршрута методом скользящего среднего для устранения резких переходов.

    Args:
        route: Список точек (Point в UTM).
        window_size: Размер окна.

    Returns:
        Сглажённый маршрут (список Point).
    """
    if not route or window_size < 2:
        return route
    smoothed = []
    half = window_size // 2
    for i in range(len(route)):
        x_sum, y_sum, count = 0.0, 0.0, 0
        for j in range(max(0, i - half), min(len(route), i + half + 1)):
            x_sum += route[j].x
            y_sum += route[j].y
            count += 1
        smoothed.append(Point(x_sum / count, y_sum / count))
    return smoothed

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
# Класс MissionManager: основной функционал построения и сохранения маршрута
# -------------------------
class MissionManager:
    def __init__(self, drone: Dict[str, Any], route_pts: List[Dict[str, float]],
                 polygons_geojson: Dict[str, Any], offset: float = 3.0) -> None:
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

        self.offset = offset

        # Преобразуем полигоны: WGS84 и их UTM-версию
        self.polygons_wgs: List[Polygon] = [shape(f["geometry"]) for f in polygons_geojson["features"]]
        self.polygons_utm: List[Polygon] = [self._poly_to_utm(p) for p in self.polygons_wgs]

        # Список дискретизированных точек и их типов:
        # каждый элемент — {"index": int, "wgs": (lat, lng), "type": "safe"|"boundary"}
        self.disc_points: List[Dict[str, Any]] = []
        # Итоговый маршрут (final_route) — список offset‑точек (в WGS84)
        self.final_route: List[Point] = []

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

    @classmethod
    def adjust_route(
            cls,
            offset: float,
            mission_url: str = "http://localhost:5005/get-mission",
            out_html: pathlib.Path | str = None,  # <-- по‑умолчанию None
    ) -> pathlib.Path:
        """
        Забирает миссию, считает маршрут с заданным offset,
        сохраняет карту и возвращает путь к HTML‑файлу.
        """
        # если не передали out_html, кладём карту в ту же папку, где mission_handler.py
        base = pathlib.Path(__file__).parent
        target = pathlib.Path(out_html) if out_html else (base / "mission_map.html")

        # 1) Загружаем миссию
        manager = cls.from_server(mission_url)
        manager.offset = offset

        # 2) Считаем и сохраняем карту именно в target
        manager.run(target)

        # 3) Отдаём абсолютный путь
        return target.resolve()

    def run(self, out_html: pathlib.Path | str = "mission_map.html") -> None:
        """
        Запускает процесс построения маршрута и сохраняет результаты (HTML-карту и JSON с маршрутом).

        Этапы:
            1. Дискретизация маршрута и классификация точек с использованием гистерезиса.
            2. Вычисление offset‑точек для safe и boundary участков.
            3. Очистка маршрута: удаление избыточных точек и циклов.
            4. Сглаживание итогового маршрута.
            5. Конвертация итоговых точек из UTM в WGS84 и сохранение результата.

        Args:
            out_html: Путь для сохранения HTML-файла с картой.
        """
        t0 = time.time()
        self._classify_points()
        self._build_offsets()
        # Очистка: удаляем точки, расположенные слишком близко
        self.final_route = reduce_route(self.final_route, min_distance_m=0.95)
        # Удаляем циклические повторения (при повторном прохождении одного участка)
        self.final_route = remove_loops_composite(self.final_route, distance_threshold=2.0, angle_threshold=150.0)
        # Сглаживаем маршрут методом скользящего среднего
        self.final_route = smooth_route(self.final_route, window_size=5)
        # Преобразуем итоговые точки из UTM (Point) в формат WGS84 (tuple)
        final_route_tuples = [utm_to_wgs(pt.x, pt.y) for pt in self.final_route]
        self._save_outputs(pathlib.Path(out_html), final_route_tuples)
        print(f"[INFO] Mission complete in {time.time() - t0:.1f}s • final route points: {len(final_route_tuples)}")

    # -------------------------
    # 1. Дискретизация маршрута и классификация точек
    # -------------------------
    def _classify_points(self) -> None:
        """
        Дискретизирует исходный маршрут и классифицирует точки как "safe" или "boundary" с гистерезисом.

        - Строится исходная линия маршрута (WGS84).
        - Сегменты корректируются для обхода полигонов.
        - Выполняется дискретизация маршрута (шаг STEP) в UTM.
        - Для каждой точки вычисляется расстояние до исходного маршрута.
          Если расстояние < TOLERANCE_DOWN, точка маркируется как "safe";
          если > TOLERANCE_UP, – как "boundary";
          если между порогами, используется предыдущая метка (по умолчанию "safe").
        """
        route_line = LineString([(pt["lng"], pt["lat"]) for pt in self.route_pts])
        segments = [LineString([route_line.coords[i], route_line.coords[i + 1]])
                    for i in range(len(route_line.coords) - 1)]
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
        labels = []
        self.disc_points = []
        for i, pt in enumerate(disc_pts_m):
            # пропускаем пустые точки
            if pt is None or pt.is_empty:
                continue

            pt_wgs = utm_to_wgs(pt.x, pt.y)
            d = pt.distance(original_route_m)  # Расстояние в UTM (в метрах)
            if d < TOLERANCE_DOWN:
                label = "safe"
            elif d > TOLERANCE_UP:
                label = "boundary"
            else:
                label = labels[i - 1] if i > 0 else "safe"
            labels.append(label)
            self.disc_points.append({"index": i, "wgs": pt_wgs, "type": label, "dist": d})
        print(f"[INFO] Дискретизировано точек: {len(self.disc_points)}")

    # -------------------------
    # 2. Вычисление offset‑точек для safe и boundary участков
    # -------------------------
    def _build_offsets(self) -> None:
        """
        Вычисляет offset‑точки для маршрута.

        - Для "safe" точек вычисляется offset через _compute_safe_offset.
        - Для групп подряд идущих "boundary" точек:
            - Группа переводится в UTM.
            - Для каждой точки вычисляется boundary‑offset через shift_point.
            - Одновременно вычисляется safe‑offset через _compute_safe_offset.
            - Если расстояние (dist) находится в переходном интервале, итоговый offset =
              interpolate_offset(safe_offset, boundary_offset, d).
        Результат сохраняется как объекты Point (в UTM) в списке offset_points.
        """
        offset_points = [None] * len(self.disc_points)
        # Обработка "safe" точек
        for i, dp in enumerate(self.disc_points):
            if dp["type"] == "safe":
                offset_points[i] = self._compute_safe_offset(dp["wgs"])
        # Группировка подряд идущих "boundary" точек
        boundary_segments = []
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
        # Обработка каждого сегмента boundary точек
        for indices, segment in boundary_segments:
            seg_utm = []
            for lat, lng in segment:
                x, y = wgs_to_utm(lng, lat)
                seg_utm.append(Point(x, y))
            poly_utm = self.polygons_utm[0]
            base_offset = self.offset
            poly_offset = poly_utm.buffer(base_offset, resolution=16, join_style=2, cap_style=2)
            shifted = []
            n = len(seg_utm)
            for i, pt in enumerate(seg_utm):
                # Вычисление boundary offset candidate
                if i == n - 1 and n > 1:
                    k = min(3, n - 1)
                    disp_vectors = []
                    if k > 0 and len(shifted) >= k:
                        for j in range(len(shifted) - k, len(shifted)):
                            dx = shifted[j].x - seg_utm[j].x
                            dy = shifted[j].y - seg_utm[j].y
                            disp_vectors.append((dx, dy))
                        avg_disp = np.mean(disp_vectors, axis=0)
                        candidate_boundary = Point(pt.x + avg_disp[0], pt.y + avg_disp[1])
                    else:
                        candidate_boundary = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                    if not is_valid(candidate_boundary, poly_utm):
                        tangent = np.array([seg_utm[i].x - seg_utm[i - 1].x, seg_utm[i].y - seg_utm[i - 1].y])
                        norm_t = np.linalg.norm(tangent)
                        if norm_t != 0:
                            t_unit = tangent / norm_t
                            normal1 = np.array([-t_unit[1], t_unit[0]])
                            normal2 = np.array([t_unit[1], -t_unit[0]])
                            candidate1 = Point(pt.x + base_offset * normal1[0], pt.y + base_offset * normal1[1])
                            candidate2 = Point(pt.x + base_offset * normal2[0], pt.y + base_offset * normal2[1])
                            if is_valid(candidate1, poly_utm):
                                candidate_boundary = candidate1
                            elif is_valid(candidate2, poly_utm):
                                candidate_boundary = candidate2
                            else:
                                t_proj = poly_offset.exterior.project(pt)
                                candidate_boundary = poly_offset.exterior.interpolate(t_proj)
                                if not is_valid(candidate_boundary, poly_utm):
                                    candidate_boundary = Point(candidate_boundary.x + 0.1, candidate_boundary.y + 0.1)
                        else:
                            candidate_boundary = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                else:
                    candidate_boundary = shift_point(pt, i, seg_utm, poly_utm, base_offset, poly_offset)
                # Вычисляем safe offset candidate для той же точки
                candidate_safe = self._compute_safe_offset(utm_to_wgs(pt.x, pt.y))
                d = self.disc_points[indices[i]]["dist"]
                if TOLERANCE_DOWN < d < TOLERANCE_UP:
                    final_candidate = interpolate_offset(candidate_safe, candidate_boundary, d)
                elif d <= TOLERANCE_DOWN:
                    final_candidate = candidate_safe
                else:
                    final_candidate = candidate_boundary
                shifted.append(final_candidate)
            for idx, pt in zip(indices, shifted):
                offset_points[idx] = pt
        for i in range(len(offset_points)):
            if offset_points[i] is None:
                offset_points[i] = Point(*wgs_to_utm(self.disc_points[i]["wgs"][1], self.disc_points[i]["wgs"][0]))
        self.final_route = offset_points
        print(f"[INFO] Итоговый маршрут сформирован: {len(self.final_route)} точек")

    # -------------------------
    # Вычисление safe‑offset точки (по проекции на ближайшую грань полигона)
    # -------------------------
    def _compute_safe_offset(self, pt_wgs: Tuple[float, float]) -> Point:
        """
        Вычисляет safe‑offset точку для заданной точки.

        Функция:
        - Находит ближайшую грань полигона (с использованием _project_to_nearest_polygon).
        - Вычисляет вектор от проекции до исходной точки и смещает её на фиксированное расстояние (OFFSET).
        - Если полученная точка оказывается внутри полигона, смещение производится в обратную сторону.

        Args:
            pt_wgs: Точка в формате WGS84 (lat, lng).

        Returns:
             Смещённая точка (Point в UTM).
        """
        proj, poly = self._project_to_nearest_polygon(pt_wgs)
        if proj is None:
            x, y = wgs_to_utm(pt_wgs[1], pt_wgs[0])
            return Point(x, y)
        safe_x, safe_y = wgs_to_utm(pt_wgs[1], pt_wgs[0])
        v = np.array([safe_x - proj.x, safe_y - proj.y])
        norm = np.linalg.norm(v)
        if norm == 0:
            return Point(safe_x, safe_y)
        unit = v / norm
        candidate = Point(proj.x + self.offset * unit[0], proj.y + self.offset * unit[1])
        if poly.contains(candidate):
            candidate = Point(proj.x - self.offset * unit[0], proj.y - self.offset * unit[1])
        return candidate

    # -------------------------
    # Геометрические вспомогательные функции
    # -------------------------
    def _project_to_nearest_polygon(self, pt_wgs: Tuple[float, float]) -> Tuple[Any, Any]:
        """
        Находит ближайшую проекцию заданной точки pt_wgs на грань полигона и возвращает пару:
        (проекция (Point в UTM), соответствующий полигон (Polygon)).

        Args:
            pt_wgs: Точка в формате WGS84 (lat, lng).

        Returns:
            (Point, Polygon) или (None, None), если проекция не найдена.
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
        Корректирует сегмент маршрута, если он пересекается с границами полигонов, заменяя часть пути обходным маршрутом

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
            cand2 = LineString([boundary.interpolate((exit_d + d) % total).coords[0] for d in
                                np.linspace(0, total - (exit_d - entry_d), 50)])
            bypass = cand1 if cand1.length < cand2.length else cand2
            seg_coords = list(segment.coords)
            entry_idx = self._nearest_index(seg_coords, entry)
            exit_idx = self._nearest_index(seg_coords, exit)
            if entry_idx > exit_idx:
                entry_idx, exit_idx = exit_idx, entry_idx
            new_coords = seg_coords[:entry_idx + 1] + list(bypass.coords) + seg_coords[exit_idx:]
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

    def _find_nearest_altitude(self, lat: float, lng: float) -> any:
        """
        Находит значение altitude из исходного маршрута для точки (lat, lng),
        выбирая точку, ближайшую к заданным координатам.

        Args:
            lat (float): Широта обработанной точки.
            lng (float): Долгота обработанной точки.

        Returns:
            Значение altitude ближайшей точки из self.route_pts.
        """
        best_distance = float("inf")
        best_altitude = ""
        for pt in self.route_pts:
            # Вычисляем расстояние между точками (lat, lng) и точкой из исходного маршрута.
            d = geodesic((lat, lng), (pt["lat"], pt["lng"])).meters
            if d < best_distance:
                best_distance = d
                best_altitude = pt["altitude"]
        return best_altitude

    # -------------------------
    # Вывод результатов: сохранение карты и маршрута
    # -------------------------
    def _save_outputs(self, out_html: pathlib.Path, route: List[Tuple[float, float]]) -> None:
        """
        Сохраняет итоговый маршрут с заданной струтурой. Применяет функцию _find_nearest_altitude для ключа altitude:

        - Формирует HTML-карту (mission_map.html) с использованием Folium.
        - Сохраняет маршрут в JSON (offset_route.json).

        Args:
            out_html: Путь для сохранения HTML-файла.
            route: Итоговый маршрут в формате списка (lat, lng).
        """
        out_html = out_html.expanduser().resolve()
        self._save_map(out_html, route)
        json_path = out_html.with_name("offset_route.json")
        with json_path.open("w", encoding="utf8") as f:
            json.dump(
                [
                    {
                     "lat": lat,
                     "lng": lng,
                     "altitude": self._find_nearest_altitude(lat, lng),
                     "flightAltitude": "",
                     "groundAltitude": ""
                     }
                    for lat, lng in route
                ],
                f,
                ensure_ascii=False,
                indent=2
            )
        print(f"[INFO] Offset route saved to {json_path}")
        # Для открытия HTML-карты в браузере можно использовать:
        # try:
        #     webbrowser.open(out_html.as_uri())
        # except ValueError:
        #     webbrowser.open(f"file://{out_html}")

    def _save_map(self, out_html: pathlib.Path, route: List[Tuple[float, float]]) -> None:
         """
        Формирует и сохраняет HTML‑карту маршрута с использованием Folium:
        - Запрещённые полигоны с заливкой.
        - Исходный маршрут (точки + полилиния).
        - Пунктирную линию от дрона до первой точки.
        - Маркер дрона.
        - Анимацию скорректированного маршрута.
        """
         # 1) Базовая карта, центрированная на дроне
         m = folium.Map(location=[self.drone["lat"], self.drone["lng"]], zoom_start=15)

         # 2) Запрещённые полигоны с заливкой
         for feature in self.polygons_geojson.get("features", []):
             geom = feature.get("geometry")
             if geom and geom.get("type") == "Polygon":
                 ring = geom["coordinates"][0]
                 coords = [[pt[1], pt[0]] for pt in ring]  # [lat, lng]
                 folium.Polygon(
                     locations=coords,
                     color="blue",
                     fill=True,
                     fill_opacity=0.3
                 ).add_to(m)

         # 3) Исходный маршрут: точки + полилиния
         if self.route_pts:
             pts = [(pt["lat"], pt["lng"]) for pt in self.route_pts]
             # точки
             for lat_pt, lng_pt in pts:
                 folium.CircleMarker(
                     [lat_pt, lng_pt],
                     radius=3,
                     color="orange",
                     fill=True
                 ).add_to(m)
             # полилиния
             folium.PolyLine(pts, color="orange", weight=2).add_to(m)
             # пунктирная линия от дрона до первой точки
             folium.PolyLine(
                 [[self.drone["lat"], self.drone["lng"]], pts[0]],
                 color="orange", weight=2, dash_array="5,10"
             ).add_to(m)

         # 4) Маркер дрона
         folium.Marker(
             [self.drone["lat"], self.drone["lng"]],
             popup="Drone",
             icon=folium.Icon(color="red")
         ).add_to(m)

         # 5) Анимация скорректированного маршрута
         features = []
         start = datetime.utcnow()
         step = timedelta(seconds=2)
         current = start
         for i, (lat, lng) in enumerate(route):
             features.append({
                 "type": "Feature",
                 "geometry": {"type": "Point", "coordinates": [lng, lat]},
                 "properties": {
                     "time": current.isoformat(),
                     "style": {"color": "green", "fillColor": "green", "radius": 4},
                     "icon": "circle",
                     "popup": f"Point #{i + 1}"
                 }
             })
             current += step

         if features:
             TimestampedGeoJson(
                 {"type": "FeatureCollection", "features": features},
                 transition_time=200, period="PT1S",
                 add_last_point=True, loop=False, auto_play=False
             ).add_to(m)

         # 6) Сохраняем карту
         m.save(out_html)
         print(f"[INFO] Map saved to {out_html}")


# -------------------------
# Запуск модуля
# -------------------------
if __name__ == "__main__":
    MissionManager.from_server().run()