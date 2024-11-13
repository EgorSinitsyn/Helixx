import React from 'react';

const MissionPlannerSidebar = ({
                                   selectedPoint,
                                   onAltitudeChange,
                                   onSavePoint,
                                   onCancelRoute,
                                   onRemoveLastPoint, // Новая функция для отмены последней точки
                                   routePoints,
                                   onClose,
                               }) => {

    return (
        <div style={{ ...styles.sidebar, overflowX: 'hidden', overflowY: 'auto' }}>
            <button onClick={onClose} style={styles.closeButton}>✕</button>

            <h3 style={styles.header}>Планировщик миссий</h3>

            <div style={styles.pointInputContainer}>
                <p>Добавить точку маршрута</p>

                <div style={styles.inputRow}>
                    <label>Широта:</label>
                    <input
                        type="number"
                        value={selectedPoint.lat}
                        readOnly
                        style={styles.input}
                    />
                </div>

                <div style={styles.inputRow}>
                    <label>Долгота:</label>
                    <input
                        type="number"
                        value={selectedPoint.lng}
                        readOnly
                        style={styles.input}
                    />
                </div>

                <div style={styles.inputRow}>
                    <label>Высота:</label>
                    <input
                        type="number"
                        value={selectedPoint.altitude}
                        onChange={(e) => onAltitudeChange(e.target.value)}
                        placeholder="Введите высоту"
                        style={styles.input}
                    />
                </div>

                <div style={styles.buttonRow}>
                    <button onClick={onRemoveLastPoint} style={styles.cancelButton}>Отменить точку</button>
                    <button onClick={onSavePoint} style={styles.saveButton}>Сохранить точку</button>
                </div>
                <button onClick={onCancelRoute} style={styles.cancelRouteButton}>Отменить маршрут</button>
            </div>

            <div style={styles.routeListContainer}>
                <h4>Маршрутные точки</h4>
                {routePoints.map((point, index) => (
                    <div key={index} style={styles.routePoint}>
                        <p>Точка {index + 1}</p>
                        <p>Широта: {point.lat}</p>
                        <p>Долгота: {point.lng}</p>
                        <p>Высота: {point.altitude}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const styles = {
    sidebar: {
        position: 'fixed',
        top: 0,
        right: 0,
        width: '200px',
        fontSize: '14px',
        maxHeight: '100vh',
        height: '100%',
        backgroundColor: '#333',
        color: 'white',
        padding: '10px',
        zIndex: 1000,
        overflowX: 'hidden',
        overflowY: 'auto',
    },
    closeButton: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        backgroundColor: 'transparent',
        border: 'none',
        color: 'white',
        fontSize: '16px',
        cursor: 'pointer',
    },
    header: {
        margin: '20px 0 10px',
        textAlign: 'center',
    },
    pointInputContainer: {
        marginBottom: '20px',
    },
    inputRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
    },
    input: {
        width: '50%',
        padding: '6px',
        fontSize: '12px',
        textAlign: 'right',
    },
    buttonRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '10px',
    },
    saveButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#444',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    cancelButton: {
        width: '45%',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#555',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    cancelRouteButton: {
        width: '100%',
        marginTop: '10px',
        padding: '8px',
        fontSize: '16px',
        backgroundColor: '#c9302c',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    routeListContainer: {
        marginBottom: '20px',
    },
    routePoint: {
        marginBottom: '10px',
        padding: '10px',
        backgroundColor: '#555',
        borderRadius: '4px',
    },
};

export default MissionPlannerSidebar;