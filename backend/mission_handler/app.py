from flask import Flask, request, jsonify, send_file, abort
import pathlib
import time
import traceback

from mission_handler import MissionManager  # ваш класс из mission_handler.py

app = Flask(__name__)
app.config['STATIC_FOLDER'] = pathlib.Path(__file__).parent

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
        out = app.config['STATIC_FOLDER'] / 'mission_map.html'
        MissionManager.adjust_route(offset,
                                    mission_url='http://localhost:5005/get-mission',
                                    out_html=out)
        return jsonify(success=True)
    except Exception as e:
        app.logger.error(traceback.format_exc())
        return jsonify(success=False, error=str(e)), 500

@app.route('/mission_map.html', methods=['GET'])
def get_map():
    f = app.config['STATIC_FOLDER'] / 'mission_map.html'
    if not f.exists(): abort(404)
    return send_file(f, mimetype='text/html')

@app.route('/offset_route.json', methods=['GET'])
def get_json():
    f = app.config['STATIC_FOLDER'] / 'offset_route.json'
    if not f.exists(): abort(404)
    return send_file(f, mimetype='application/json')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5006)