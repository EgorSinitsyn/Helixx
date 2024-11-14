from pymavlink import mavutil
import time

# Подключение к симуляции
connection = mavutil.mavlink_connection('')

# получение пакета HEARTBEAT от самолета
connection.wait_heartbeat()
print("Подключение установлено")

# Установка режима полета в AUTO
def set_mode(mode):
    mode_id = connection.mode_mapping()[mode]
    connection.mav.command_long_send(
        connection.target_system,
        connection.target_component,
        mavutil.mavlink.MAV_CMD_DO_SET_MODE,
        0,
        mode_id, 0, 0, 0, 0, 0, 0
    )
    print(f"Режим {mode} установлен")

# Армирование двигателя
def arm():
    connection.mav.command_long_send(
        connection.target_system,
        connection.target_component,
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        0,
        1, 0
    )
    print("Двигатель армирован")

# Дизармирование двигателя
def disarm():
    connection.mav.command_long_send(
        connection.target_system,
        connection.target_component,
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        0,
        0, 0
    )
    print("Двигатель дизармирован")

# Отправка команды на полет в точку
def goto_location(latitude, longitude, altitude):
    connection.mav.set_position_target_global_int_send(
        0,  # время в мс
        connection.target_system,
        connection.target_component,
        mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
        int(0b110111111000),  # тип маски для полета к координатам
        int(latitude * 1e7),  # широта
        int(longitude * 1e7), # долгота
        altitude,  # высота
        0, 0, 0,  # скорость по XYZ
        0, 0, 0,  # ускорение по XYZ
        0, 0  # yaw, yaw_rate
    )
    print(f"Полет к точке ({latitude}, {longitude}) на высоту {altitude} м")

# Пример использования
set_mode("AUTO")
arm()
time.sleep(1)
goto_location(34.0, -118.0, 100)  # целевые координаты
time.sleep(10)
disarm()
