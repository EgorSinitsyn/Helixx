from flask import Flask, request, jsonify, send_file, abort
from flask_cors import CORS
import pathlib
import os
import traceback

from mission_handler import MissionManager  # ваш класс из mission_handler.py

app = Flask(__name__)
CORS(app)
app.config['STATIC_FOLDER'] = pathlib.Path(__file__).parent

# Берём из .env:
#   HOST – на каком интерфейсе слушать (0.0.0.0 для Docker; localhost локально)
#   PORT – порт
#   MEDIATOR_URL – адрес сервиса mission_mediator
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 5006))
MEDIATOR_URL = os.getenv("MEDIATOR_URL", "http://localhost:5005")

@app.route('/compute-route', methods=['POST'])
def compute_route():
    """
    POST { offset: число }
    Пересчитывает маршрут с заданным offset,
    сохраняет в mission_map.html и offset_route.json
    и возвращает success.
    """
    data = request.get_json(force=True) or {}
    try:
        offset = float(data.get('offset', 3.0))
    except:
        return jsonify(success=False, error="Bad offset"), 400

    try:
        out_html = app.config['STATIC_FOLDER'] / 'mission_map.html'
        # Используем MEDIATOR_URL для получения исходной миссии
        mission_url = f"{MEDIATOR_URL}/get-mission"
        MissionManager.adjust_route(
            offset=offset,
            mission_url=mission_url,
            out_html=out_html
        )
        return jsonify(success=True)
    except Exception as e:
        app.logger.error(traceback.format_exc())
        return jsonify(success=False, error=str(e)), 500

@app.route('/mission_map.html', methods=['GET'])
def get_map():
    """Отдаёт сгенерированную HTML-карту."""
    f = app.config['STATIC_FOLDER'] / 'mission_map.html'
    if not f.exists():
        abort(404)
    return send_file(f, mimetype='text/html')

@app.route('/offset_route.json', methods=['GET'])
def get_json():
    """Отдаёт JSON скорректированного маршрута."""
    f = app.config['STATIC_FOLDER'] / 'offset_route.json'
    if not f.exists(): abort(404)
    return send_file(f, mimetype='application/json')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5006)