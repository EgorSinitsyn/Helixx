from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)