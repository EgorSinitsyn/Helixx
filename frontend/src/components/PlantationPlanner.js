// PlantationPlanner.js

import React, { useState } from 'react';

const PlantationPlanner = ({
  selectedPoint,
  onTreeHeightChange,
  onCrownSizeChange,
  onSavePoint,
  onCancelPoint,
  onConfirmPlantation,
  treePoints,
                             onRemoveTreePoint,
                             onTreeHover,
                             onTreeLeave,
  onClose,
}) => { const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  return (
    <div style={{ ...styles.sidebar, overflowX: 'hidden', overflowY: 'auto' }}>
      <button onClick={onClose} style={styles.closeButton}>
        ✕
      </button>
      <h3 style={styles.header}>Планировщик насаждений</h3>

      <div style={styles.pointInputContainer}>
        <p>Добавить точку насаждения</p>

        <div style={styles.inputRow}>
          <label style={styles.label}>Широта:</label>
          <input
            type="number"
            value={selectedPoint.lat}
            readOnly
            style={styles.input}
          />
        </div>

        <div style={styles.inputRow}>
          <label style={styles.label}>Долгота:</label>
          <input
            type="number"
            value={selectedPoint.lng}
            readOnly
            style={styles.input}
          />
        </div>

        <div style={styles.inputRow}>
          <label style={styles.label}>Высота дерева:</label>
          <input
            type="number"
            value={selectedPoint.height || ''}
            onChange={(e) => onTreeHeightChange(e.target.value)}
            placeholder="Введите высоту"
            style={styles.input}
          />
        </div>

        <div style={styles.inputRow}>
          <label style={styles.label}>Размер кроны:</label>
          <input
            type="number"
            value={selectedPoint.crownSize || ''}
            onChange={(e) => onCrownSizeChange(e.target.value)}
            placeholder="Введите размер кроны"
            style={styles.input}
          />
        </div>

        <div style={styles.buttonRow}>
          <button onClick={onCancelPoint} style={styles.cancelButton}>
            Отменить точку
          </button>
          <button onClick={onSavePoint} style={styles.saveButton}>
            Сохранить точку
          </button>
        </div>

        <button onClick={onConfirmPlantation} style={styles.confirmButton}>
          Подтвердить насаждения
        </button>
      </div>

      <div style={styles.pointListContainer}>
        <h4>Сохранённые точки насаждений</h4>
        {treePoints.map((point, index) => (
            <div
                key={index}
                style={{
                  ...styles.pointItem,
                  border: hoveredPointIndex === index ? '2px solid blue' : styles.pointItem.border,
                }}
                onMouseEnter={() => {
                  onTreeHover(point, index);
                  setHoveredPointIndex(index);
                }}
                onMouseLeave={() => {
                  onTreeLeave();
                  setHoveredPointIndex(null);
                }}
            >
          <span
              style={styles.removeIcon}
              onClick={() => onRemoveTreePoint(index)}
          >
            ❌
          </span>
              <p>Точка {index + 1}</p>
              <p>Широта: {point.lat}</p>
              <p>Долгота: {point.lng}</p>
              <p>Высота: {point.height} м</p>
              <p>Размер кроны: {point.crownSize} м</p>
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
  },
  closeButton: {
    position: 'absolute',
    top: '5px',
    right: '2px',
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
  // Используем flex-ряд с фиксированной шириной для метки
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  // Фиксированная ширина для меток позволит инпутам сохранять одинаковый размер
  label: {
    width: '80px',
    fontSize: '12px',
  },
  // Фиксированная ширина поля ввода (аналог 50% от 200px в MissionPlannerSidebar)
  input: {
    width: '100px',
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
  confirmButton: {
    width: '100%',
    marginTop: '10px',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#008CBA',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  pointListContainer: {
    marginBottom: '20px',
  },
  pointItem: {
    marginBottom: '10px',
    padding: '10px',
    backgroundColor: '#555',
    borderRadius: '4px',
    border: '1px solid #555',
    position: 'relative', // чтобы можно было позиционировать крестик
  },
  removeIcon: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    color: 'red',
  },
};

export default PlantationPlanner;