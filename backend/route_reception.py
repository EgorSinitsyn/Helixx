# server.py
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # чтобы разрешить CORS для всех маршрутов, если фронтенд на другом порту

# Объявляем глобальную переменную для хранения последней миссии
last_mission_data = {}

@app.route('/update-mission', methods=['POST'])
def update_mission():
    global last_mission_data  # объявляем, что будем изменять глобальную переменную
    try:
        # Получаем JSON из тела запроса
        data = request.get_json()

        # Извлекаем нужные поля
        drone_data = data.get('droneData', {})
        route_points = data.get('routePoints', [])
        saved_polygons = data.get('savedPolygons', {})

        # Логируем для отладки
        print("Данные дрона:", drone_data)
        print("Маршрутные точки:", route_points)
        print("Сохранённые полигоны:", saved_polygons)

        # Сохраняем последнюю миссию для последующего анализа и обработки
        last_mission_data = {
            "droneData": drone_data,
            "routePoints": route_points,
            "savedPolygons": saved_polygons,
        }

        # Подготовим ответ
        response_data = {
            "status": "ok",
            "message": "Миссия успешно обновлена на сервере!",
            "updatedRoutePoints": route_points,
        }

        return jsonify(response_data), 200

    except Exception as e:
        print("Ошибка на сервере:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


# Новый эндпоинт для получения последней миссии
@app.route('/get-mission', methods=['GET'])
def get_mission():
    return jsonify(last_mission_data), 200


if __name__ == '__main__':
    # Запускаем сервер на порту 5005
    app.run(host='0.0.0.0', port=5005, debug=True)