const express = require('express');
const cors = require('cors'); // Импортируем cors
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors()); // Разрешаем CORS для всех запросов
app.use(express.json());

app.post('/save-route', (req, res) => {
    try {
        const routeData = req.body;
        const savePath = path.join(__dirname, '../src/route/route.geojson');

        const directory = path.dirname(savePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        fs.writeFileSync(savePath, JSON.stringify(routeData, null, 2), 'utf8');
        res.status(200).send('Маршрут успешно сохранён');
    } catch (error) {
        console.error('Ошибка при сохранении маршрута:', error);
        res.status(500).send('Ошибка при сохранении маршрута');
    }
});

const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});