# Helixx

ПО для составления полётных миссий дрона, позволяющее автоматически построить полётное задание для облета поля с целью сканирования территории


## Функциональные возможности (дополню позже)

- **Интерактивная карта:** Отображение спутниковой карты с помощью Mapbox GL. Возможность масштабирования, перемещения и переключения между 2D и 3D режимами. При включении 3D-режима отображается рельеф местности.
- **Построение маршрута:** Производится при попадании в режим планировщика миссии при нажатии на кнопку. Маршрут автоматически строится по точкам, которые пользователь добавляет на карту кликами мыши. Более гибкое взаимодействие доступно через панель управления (справа)
- **Симуляция дрона:** Обновление положения дрона в реальном времени. При включении 3D-режима используется 3D-модель дрона, в противном случае – 2D-маркер.
- **Режим "линейка":** Измерение расстояния между точками на карте. При включении этого режима обработчики кликов переключаются так, чтобы не мешать построению маршрута.
- **Отображение вышек и зон покрытия:** На карте отображаются маркеры с вышками связи и, при необходимости, зоны покрытия с помощью полигонов.
- **Геопространственные расчёты:** Использование Turf.js для расчёта расстояний и создания геометрических фигур.
- **Геопространственные расчёты:** Сохранение маршрутных точек в формате GeoJSON для последующего использования.

## Технологии

- **React** – библиотека для построения пользовательского интерфейса.
- **Mapbox GL JS** – Взаимодействие по API для отображения интерактивных карт
- **Three.js** – для визуализации 3D-моделей.
- **three-stdlib** – для загрузки GLTF-моделей.
- **Turf.js** – для выполнения геопространственных расчётов.

## Требования 
- **Node.js** >= 18.x
- **npm** >= 8.x или **yarn** >= 1.22
- **Python** >= 3.8 (скрипты сборки и тестирования)  
- **Docker** >= 20.x (контейнеризация)  
- **Docker Compose** >= 1.29 (локальное окружение)  
- **Minikube** >= 1.25 (локальный Kubernetes)  
- **kubectl** >= 1.23 (CLI для Kubernetes)  
- **Helm** >= 3.7 (пакетный менеджер для Kubernetes)


## Установка и развертывание
1. Клонируйте репозиторий:
```bash
   git clone https://github.com/EgorSinitsyn/Helixx
```
2. Перейдите в директорию проекта:
```bash
   cd ~/Helixx/
```
___

### Локальный запуск
1. Установка зависимостей:
```bash
#!/usr/bin/env bash
# install.sh — установка зависимостей для Helixx

set -euo pipefail

# минимальные требуемые версии
REQUIRED_NODE_MAJOR=16
REQUIRED_NPM_MAJOR=8
VENV_DIR=".venv"

# helper
command_exists() { command -v "$1" >/dev/null 2>&1; }

echo "=== Установка зависимостей Helixx ==="

# 1) Проверяем Node.js
if ! command_exists node; then
  echo "⚠️  Ошибка: node не найден. Установите Node.js >=${REQUIRED_NODE_MAJOR}."
  exit 1
fi
NODE_VER=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if (( NODE_VER < REQUIRED_NODE_MAJOR )); then
  echo "⚠️  Ошибка: версия node должна быть >=${REQUIRED_NODE_MAJOR}. Текущая: $(node -v)."
  exit 1
fi

# 2) Проверяем npm
if ! command_exists npm; then
  echo "⚠️  Ошибка: npm не найден. Установите npm >=${REQUIRED_NPM_MAJOR}."
  exit 1
fi
NPM_VER=$(npm -v | cut -d. -f1)
if (( NPM_VER < REQUIRED_NPM_MAJOR )); then
  echo "⚠️  Ошибка: версия npm должна быть >=${REQUIRED_NPM_MAJOR}. Текущая: $(npm -v)."
  exit 1
fi

echo "→ Устанавливаем Node.js зависимости (frontend)..."
pushd frontend >/dev/null
npm ci
popd >/dev/null

# 3) Проверяем Python 3
if ! command_exists python3; then
  echo "⚠️  Ошибка: python3 не найден. Установите Python >=3.8."
  exit 1
fi

# 4) Создаём виртуальное окружение, если ещё нет
if [ ! -d "${VENV_DIR}" ]; then
  echo "→ Создаём виртуальное окружение в ./${VENV_DIR}..."
  python3 -m venv "${VENV_DIR}"
fi

# 5) Активируем venv и обновляем pip
# shellcheck disable=SC1090
source "${VENV_DIR}/bin/activate"
echo "→ Обновляем pip..."
pip install --upgrade pip

# 6) Устанавливаем Python-пакеты из requirements.txt
REQ1="backend/mission_mediator/requirements.txt"
REQ2="backend/mission_handler/requirements.txt"

for req in "$REQ1" "$REQ2"; do
  if [ -f "$req" ]; then
    echo "→ Устанавливаем Python-пакеты из $req..."
    pip install -r "$req"
  else
    echo "⚠️  Файл $req не найден, пропускаем."
  fi
done

echo "✅  Все зависимости успешно установлены!"
echo "Для активации виртуального окружения: source ${VENV_DIR}/bin/activate"
```
2. Запуск приложения:
```bash
chmod+x start.sh
./start.sh
```
3. Открыть браузер и перейти по адресу [http://localhost:3000](http://localhost:3000)
___

### Запуск через Docker-compose
1. Аунтификация в Docker Hub:
```bash
docker login
```
2. Запуск приложения:
```bash
docker-compose up --build -d
```
3. Открыть браузер и перейти по адресу контейнера react_frontend
4. Посмотреть адрес контейнера Jaeger и перейти по нему в браузере для просмотра трейсов

___

### Запуск в Docker Swarm

#### Делаем multi-arch образы

1. Cоздать и активировать отдельный билдер (однократно)
  ```bash
  docker buildx create --name multi --driver docker-container --use
  docker buildx inspect --bootstrap
  ```

2. Логин в реестр
```bash
docker login
```

3. Сборка и пуш образов в Docker registry
```bash
# mission-handler
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ouhom/helixx-mission_handler:0.9.3 \
  ./backend/mission_handler --push

# mission-mediator
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ouhom/helixx-mission_mediator:0.9.3 \
  ./backend/mission_mediator --push

# react-frontend
# Укажите публичные адреса вашего API-сервера и OTLP/HTTP
PUBLIC_IP=<ВАШ_ПУБЛИЧНЫЙ_IP>

docker buildx build --platform linux/amd64,linux/arm64 \
  -t ouhom/helixx-react_frontend:0.9.4 \
  --build-arg REACT_APP_MEDIATOR_API=http://$PUBLIC_IP:5005 \
  --build-arg REACT_APP_OTEL_EXPORTER_URL=http://$PUBLIC_IP:4318/v1/traces \
  ./frontend --push
```

4. Проверка манифеста
```bash
docker buildx imagetools inspect <DOCKER_USERNAME>/helixx-react_frontend:0.9.4
docker buildx imagetools inspect <DOCKER_USERNAME>/helixx-mission_handler:0.9.3
docker buildx imagetools inspect <DOCKER_USERNAME>/helixx-mission_mediator:0.9.3
```

#### Подготовка кластера swarm

1. Узнаем свой внешний IP
```bash
MANAGER_IP=$(curl ifconfig.me)

echo $MANAGER_IP  
```

2. Инициализация менеджера (мастер-узла)
```bash
docker swarm init --advertise-addr $MANAGER_IP

# При необходимости повторно получить токен для воркера:
docker swarm join-token worker
```

3. На воркер-ноде выполните команду из join-token, например:
```bash
docker swarm join --token <TOKEN> <MANAGER_PRIVATE_IP>:2377
```

4. Проверяем статус
```bash
docker node ls
```

5. Создаем overlay-сети для приложения и стэка мониторинга
```bash
docker network create --driver overlay --attachable mission-net
docker network create -d overlay --attachable observability-net
```

6. Подготовка системы под OpenSeach (выполнить на всех нодах)
```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-opensearch.conf
sudo sysctl --system
```

7. На мастере создаем конфиг `./fluent-bit.conf`

<!-- 8. Создаем swarm конфиг
```bash
# создаем и скармливаем конфиг
docker config create fb_conf fluent-bit.conf 

# првоеряем наличие
docker config ls | grep fb_conf 

# детализация скормленной конфигурации
docker service inspect monitoring_fluentbit \
  -f '{{json .Spec.TaskTemplate.ContainerSpec.Configs}}' | jq 
``` -->

8. Валидаия стэка monitoring и деплой
```bash
docker stack config -c docker-stack-monitoring.yml helixx-app
docker stack deploy -c docker-stack-monitoring.yml monitoring
watch -n1 'docker stack services monitoring'
```

9. Патчим контейнер monitoring_opensearch для доступа в админку
```bash
docker service update \
  --env-add OPENSEARCH_INITIAL_ADMIN_PASSWORD='ChangeMe_2025!' \
  monitoring_opensearch
```

10. Валидация и деплой стэка с приложением
```bash
docker stack config -c docker-stack.yml helixx-app
docker stack deploy -c docker-stack.yml helixx-app
watch -n1 'docker stack services helixx-app'
```

11. Доступность сервисов:
* Application – `<IP>:3000`
* Jaeger – `<IP>:16686`
* OpenSearch – `<IP>:5601`

12. Устанавливаем Portainer:
https://docs.portainer.io/start/install-ce/server/swarm/linux

13. Полезные команды:
```bash
# просмотр логов сервиса
docker service logs -f <service_name>

# проверка состояния нод
docker node ls
# проверка количества сервисов в стэке
docker stack ls
# проверка состояния сервисов
docker service ls
# Подробная информация по конкретной ноде
docker node inspect <NODE_NAME> --pretty

# проверка состояния сервисов из стэка
docker stack ps <STACK_NAME>

# Фильтр по конкретному сервису
docker service ps <SERVICE_NAME>

# Список всех сервисов в стеке
docker stack services <STACK_NAME>
# Информация по конкретному сервису
docker service inspect <SERVICE_NAME> --pretty
# Логи сервиса (все реплики)
docker service logs -f <SERVICE_NAME>
# Логи сервиса с указанием реплики
docker service logs -f <SERVICE_NAME> --tail 100

# Rolling-update на новый тег:
docker service update --image ouhom/helixx-react_frontend:0.9.5 mission_react_frontend
docker service update --image ouhom/helixx-mission_handler:0.9.4 mission_mission_handler
docker service update --image ouhom/helixx-mission_mediator:0.9.4 mission_mission_mediator

# Откат
docker service update --rollback mission_react_frontend

# Масштабирование:
docker service scale mission_mission_mediator=2 mission_mission_handler=2
```
___

### Запуск через Minikube и настройка мониторинга
#### Запуск кластера и сборка контейнеров
1. Запуск Minikube:
```bash
minikube start --driver=docker
```
2. Сборка образов для сервисов-приложения
```bash
eval $(minikube docker-env)
docker build -t mission-handler:latest ./backend/mission_handler
docker build -t mission-mediator:latest ./backend/mission_mediator
docker build -t react-frontend:latest ./frontend
```
3. Проверяем
```bash
docker images
```
#### Деплой сервисов-приложения
1. Деплой сервисов-приложения:
```bash 
kubectl apply -f k8s-deployment.yaml
```
2. Проверяем статус подов (должны быть со статусом running):
```bash
kubectl get pods,svc -n mission-planner
```
3. Запускаем туннель LoadBalancer’ов
```bash
minikube tunnel --bind-address 0.0.0.0 &
```
4. Патчим переменную MEDIATOR_LB_IP для доступа к микросервисам backend'a

    4.1 Ждём, пока сервис mission-mediator получит EXTERNAL-IP
    ```bash
    echo "Ожидаем IP..."
    kubectl -n mission-planner wait svc/mission-mediator \
      --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' --timeout=120s
    
    MEDIATOR_LB_IP=$(kubectl -n mission-planner \
      get svc mission-mediator -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    echo "LoadBalancer IP: $MEDIATOR_LB_IP"
    ```
    4.2 Прописываем этот IP во фронт и перезапускаем деплой
    ```bash
    kubectl -n mission-planner set env deploy/react-frontend \
      REACT_APP_MEDIATOR_API=http://$MEDIATOR_LB_IP:5005
    kubectl -n mission-planner rollout restart deploy/react-frontend
    ```
5. Запуск приложения (запуск скрипта в отдельной вкладке и переход в браузере):
```bash
minikube service react-frontend -n mission-planner
```
#### Деплой сервисов-мониторинга
1. Создаем новое пространство имен:
```bash
kubectl create namespace observability
```
2. Устанавливаем и обновляем чарты мониторинга (помним, что должен быть установлен Helm):
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana              https://grafana.github.io/helm-charts
helm repo add jaegertracing        https://jaegertracing.github.io/helm-charts
helm repo update
```
3. Устанавливаем Dashboard, запускаем в отдельном окне и открываем панель в окне браузера:
```bash
minikube addons enable dashboard
minikube dashboard --url
```
4. Устанавливаем стэк Prometheus+ Grafana:
```bash
helm install prom-stack prometheus-community/kube-prometheus-stack \
  -n observability -f observability_stack.yaml
```
5. Устанавливаем Jaeger:
```bash
helm install jaeger jaegertracing/jaeger \
  -n observability -f observability_jaeger.yaml
```
6. Деплой otel_collector'а , который будет перехватывать трейсы с фронтенда и отправлять в Jaeger
```bash
kubectl apply -f otel_collector_config.yaml
```
7. Проверяем статус подов (должны быть со статусом running):
```bash
kubectl get pods,svc -n observability
```
8. Запуск Prometheus (в отдельном окне терминала выполняем скрипт, затем открываем в браузере http://localhost:9090):
```bash
kubectl -n observability port-forward svc/prom-stack-kube-prometheus-prometheus 9090:9090
```
9. Деплой Grafana:

    9.1 Запускаем сервис в отдельном окне терминала, получаем ссылку:
    ```bash
    minikube service prom-stack-grafana -n observability --url
    ```

    9.2 Вход в Grafana по ссылке из ответа в консоли (логин: admin, пароль: admin)

    9.3 Если логин/пароль утерян, можно получить его из секрета:
    
    ```bash
    kubectl -n observability get secret prom-stack-grafana -o jsonpath="{.data.admin-user}"   | base64 -d && echo
    kubectl -n observability get secret prom-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d && echo
    ```

    9.4 Проверяем подключение datasources: Connections → Data Sources…


10. Запуск Jaeger (оба скрипта выполняются в отдельных окнах терминала, после чего переходим по ссылке http://localhost:16686 и чекаем подключенные источники, их должно быть 2 шт.)
```bash
kubectl -n observability port-forward svc/otel-collector 4318:4318
kubectl -n observability port-forward svc/jaeger-query 16686:16686
```



