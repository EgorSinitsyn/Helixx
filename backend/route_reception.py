# server.py
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # чтобы разрешить CORS для всех маршрутов, если фронтенд на другом порту

@app.route('/update-mission', methods=['POST'])
def update_mission():
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

        # Здесь вы можете реализовать ЛЮБУЮ логику корректировки.
        # Например, допустим, мы меняем высоту первой точки:
        if route_points:
            route_points[0]['altitude'] = 9999

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

if __name__ == '__main__':
    # Запускаем сервер на порту 5000 (или другом, если нужно)
    app.run(host='0.0.0.0', port=5005, debug=True)