from flask import Flask, request, jsonify, send_file, abort, url_for
from flask_cors import CORS
import folium
import time
import pathlib
import traceback

from backend.mission_handler.mission_handler import MissionManager

app = Flask(__name__, static_folder="mission_handler")
CORS(app)

# Изначально храним миссию в нормализованной форме
last_mission_data = {
    "droneData": {},
    "routePoints": [],
    "savedPolygons": {"type": "FeatureCollection", "features": []},
}

def _normalize(data: dict) -> dict:
    """
    Приводит входные данные к корректной структуре миссии.

    Args:
        data (dict): Входной словарь, потенциально частично заполненный.

    Returns:
        dict: Гарантированно корректная структура с ключами:
                'droneData', 'routePoints', 'savedPolygons'
    """

    return {
        "droneData":     data.get("droneData", {}),
        "routePoints":   data.get("routePoints", []),
        "savedPolygons": data.get("savedPolygons", {"type": "FeatureCollection", "features": []}),
    }

@app.route("/get-mission", methods=["GET", "POST"])
def mission_endpoint():
    """
    Обработчик маршрута '/get-mission' для получения и обновления данных миссии.

    При POST-запросе:
        - Извлекает JSON-данные из тела запроса (с принудительным разбором JSON).
        - Приводит полученные данные к корректной структуре с помощью _normalize.
        - Обновляет глобальную переменную last_mission_data.
        - Возвращает нормализованные данные с HTTP-статусом 200 (ОК).

    При GET-запросе:
        - Возвращает текущие данные миссии из глобальной переменной last_mission_data,
          предварительно нормализовав их, чтобы гарантировать корректность структуры.

    Returns:
        Response: JSON-ответ, содержащий данные миссии, с кодом состояния 200.
    """

    global last_mission_data

    if request.method == "POST":
        try:
            raw_data = request.get_json(force=True) or {}
            last_mission_data = _normalize(raw_data)
            return jsonify(last_mission_data), 200

        except Exception as e:
            # Если не удалось разобрать JSON, возвращаем ошибку 500
            return jsonify({
                "status": "error",
                "message": f"Ошибка при обработке POST-запроса: {str(e)}"
            }), 500

    # GET – гарантируем, что структура всегда корректная
    return jsonify(_normalize(last_mission_data)), 200


@app.route("/mission_map", methods=["GET"])
def mission_map():
    """
    Генерирует карту Folium на основе данных миссии:
      - Маркер дрона (droneData)
      - Маршрут (routePoints), линия оранжевого цвета
      - Пунктирная линия, соединяющая начальное положение дрона с первой точкой маршрута
      - Полигоны (savedPolygons)
    И возвращает HTML-код карты.
    """
    # Используем координаты дрона из last_mission_data (если они заданы)
    drone_data = last_mission_data.get("droneData", {})
    default_lat = 55.139592
    default_lng = 37.962471
    lat = drone_data.get("lat", default_lat)
    lng = drone_data.get("lng", default_lng)

    # Создаем карту Folium
    m = folium.Map(location=[lat, lng], zoom_start=15)

    # Добавляем маркер дрона
    if drone_data:
        folium.Marker(
            [lat, lng],
            popup="Дрон",
            icon=folium.Icon(color="blue")
        ).add_to(m)

    # Отрисовываем маршрут: собираем точки, добавляем маркеры и рисуем оранжевую линию
    route_points = last_mission_data.get("routePoints", [])
    polyline_points = []
    if route_points:
        for pt in route_points:
            try:
                # Преобразуем координаты; учитываем, что они могут передаваться как строки или числа
                lat_pt = float(pt.get("lat", default_lat))
                lng_pt = float(pt.get("lng", default_lng))
                polyline_points.append([lat_pt, lng_pt])
                # Рисуем маленький круг (маркер) для каждой точки
                folium.CircleMarker(
                    [lat_pt, lng_pt],
                    radius=3,
                    color="orange",
                    fill=True
                ).add_to(m)
            except Exception as e:
                print("Ошибка обработки точки маршрута:", pt, e)
        if polyline_points:
            # Рисуем основную линию маршрута оранжевого цвета
            folium.PolyLine(polyline_points, color="orange", weight=2).add_to(m)
            # Рисуем пунктирную линию, соединяющую начальное положение дрона с первой точкой маршрута
            first_point = polyline_points[0]
            folium.PolyLine([[lat, lng], first_point],
                            color="orange", weight=2,
                            dash_array="5,10").add_to(m)

    # Отрисовываем полигоны из savedPolygons
    saved_polygons = last_mission_data.get("savedPolygons", {}).get("features", [])
    for feature in saved_polygons:
        geometry = feature.get("geometry")
        if geometry and geometry.get("type") == "Polygon":
            coords = geometry.get("coordinates", [])
            if coords and len(coords) > 0:
                # GeoJSON задает координаты как [[lng, lat], [lng, lat], ...]
                # Folium ожидает список точек в формате [lat, lng]
                # Берем первый кольцо (exterior) полигона
                ring = coords[0]
                if ring:
                    converted_ring = [[point[1], point[0]] for point in ring]
                    folium.Polygon(
                        locations=converted_ring,
                        color="blue",
                        fill=True,
                        fill_opacity=0.3
                    ).add_to(m)

    # Возвращаем HTML-код сгенерированной карты
    return m.get_root().render()


@app.route("/process-route", methods=["POST"])
def process_route():
    """
    POST { offset: число }
    -> запускает adjust_route, перезаписывает mission_map.html
       и возвращает JSON { success: True, mapUrl: "<URL карты>" }
    """
    data = request.get_json(force=True) or {}
    raw_offset = data.get("offset", 3.0)
    # 1) Приводим к числу
    try:
        offset = float(raw_offset)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": f"Неверное значение offset: {raw_offset}"
        }), 400

    try:
        # 2) Запускаем пересчёт
        map_path = MissionManager.adjust_route(offset)
        # 3) Генерируем корректный URL
        map_url = url_for("mission_map_file", ts=int(time.time()), _external=True)
        return jsonify({"success": True, "mapUrl": map_url})
    except Exception as e:
        # логируем полный трейсбек
        app.logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route("/mission_map_final", methods=["GET"])
def mission_map_file():
    """
    Отдаёт HTML, записанный adjust_route() в mission_handler/mission_map.html
    """
    # каталог backend/
    project_root = pathlib.Path(__file__).parent.parent
    file = project_root / "mission_handler" / "mission_map.html"

    if not file.exists():
        abort(404, description="Файл карты ещё не создан")

    return send_file(file, mimetype="text/html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)