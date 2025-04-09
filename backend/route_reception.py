from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # чтобы разрешить CORS для всех маршрутов, если фронтентд на другом порту

# Глобальная переменная для хранения данных миссии
last_mission_data = {}

@app.route('/get-mission', methods=['GET', 'POST'])
def update_mission():
    """
    Обрабатывает получение данных (местоположение дрона, маршрутных точек, полигонов) с frontenda и
    перенаправляет их на сервер для последующей обработки

    Метод поддерживает два HTTP-метода:

    POST:
        Получает JSON-данные из тела запроса с ключами:
          - 'droneData': данные дрона (словарь, по умолчанию пустой словарь).
          - 'routePoints': список маршрутных точек (по умолчанию пустой список).
          - 'savedPolygons': сохранённые полигоны (словарь, по умолчанию пустой словарь).
        Обновляет глобальную переменную last_mission_data и возвращает обновлённые данные в формате JSON.

    GET:
        Возвращает текущее содержимое переменной last_mission_data в формате JSON.

    :return:
            JSON-ответ с данными миссии и статусом HTTP 200 для успешного выполнения,
            либо JSON-ответ с сообщением об ошибке и статусом HTTP 500 в случае исключения.
    """

    global last_mission_data

    if request.method == 'POST':
        try:
            # Получаем JSON из тела запроса
            data = request.get_json()

            # Извлекаем нужные поля
            drone_data = data.get('droneData', {})
            route_points = data.get('routePoints', [])
            saved_polygons = data.get('savedPolygons', {})

            # Обновляем глобальную переменную
            last_mission_data = {
                "droneData": drone_data,
                "routePoints": route_points,
                "savedPolygons": saved_polygons,
            }

            # Возвращаем обновлённые данные
            return jsonify(last_mission_data), 200

        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    elif request.method == 'GET':
        # При GET-запросе возвращаем сохранённые данные миссии
        return jsonify(last_mission_data), 200


if __name__ == '__main__':
    # Запускаем сервер на порту 5005
    app.run(host='0.0.0.0', port=5005, debug=True)