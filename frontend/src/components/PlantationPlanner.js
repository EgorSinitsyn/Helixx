import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { generateTreePointsFromRow } from './trees3D.js';

// Компонент портала для модального окна (рендерит содержимое в document.body)
const DraggableModalPortal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

// Перетаскиваемое окно
const DraggableWindow = ({ children, onClose, style }) => {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const windowRef = useRef(null);

  const handleHeaderMouseDown = (e) => {
    e.stopPropagation();
    setDragging(true);
    const rect = windowRef.current.getBoundingClientRect();
    setOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      setPosition({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, offset]);

  return (
      <div
          ref={windowRef}
          style={{
            position: 'fixed',
            top: position.y,
            left: position.x,
            backgroundColor: 'gray',
            color: 'white',
            border: '1px solid #ccc',
            padding: '10px',
            zIndex: 2000,
            ...style,
          }}
      >
        {/* Заголовок окна для перетаскивания */}
        <div
            onMouseDown={handleHeaderMouseDown}
            style={{
              cursor: dragging ? 'grabbing' : 'grab',
              padding: '5px',
              borderBottom: '1px solid #aaa',
              marginBottom: '10px',
            }}
        >
        </div>
        {children}
        <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: 'white',
            }}
        >
          X
        </button>
      </div>
  );
};

const PlantationPlanner = ({
                             selectedPoint,
                             onTreeHeightChange,
                             onCrownSizeChange,
                             onSavePoint,
                             onCancelPoint,
                             onCancelPlantation,
                             onConfirmPlantation,
                             treePoints,
                             onRemoveTreePoint,
                             onTreeHover,
                             onTreeLeave,
                             onClose,
                             isRowModalOpen,
                             setIsRowModalOpen,
                             setIsRulerOn,
                             onOpenRowModal,
                             onCloseRowModal,
                             rowPoints,
                             setRowPoints,
                             setPlantationPoints
                           }) => {
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const [rowSettings, setRowSettings] = useState({ treeHeight: '', crownSize: '', step: '' });
  const listRef = useRef(null);

  // Функции открытия/закрытия модального окна
  const handleOpenRowModal = () => {
    if (onOpenRowModal) onOpenRowModal();
    setIsRowModalOpen(true);
    setIsRulerOn(true);
  };

  const handleCloseRowModal = () => {
    if (onCloseRowModal) onCloseRowModal();
    setIsRowModalOpen(false);
    setIsRulerOn(false);
    setRowPoints([]);
  };

  // Функция удаления точки ряда
  const deleteRowPoint = (index) => {
    setRowPoints(prev => prev.filter((_, i) => i !== index));
  };

  // Функция отмены
  const handleCancelRows = () => {
    // setRowPoints([]);
    setRowSettings({ treeHeight: '', crownSize: '', step: '' });
    // Перезапуск режима линейки: временно выключаем isRulerOn и сразу же включаем.
    // setIsRulerOn(false);
    // setTimeout(() => {
    //   setIsRulerOn(true);
    // }, 2000);
    // Закрываем окно разметки рядов
    handleCloseRowModal();
    // Через небольшой таймаут (например, 500 мс) повторно открываем окно
    setTimeout(() => {
      handleOpenRowModal();
    }, 10);

  };

  // Функция подтверждения ряда: здесь окно закрывается (если требуется) или можно оставить его открытым
  const handleConfirmRows = () => {
    const newTreePoints = generateTreePointsFromRow(rowPoints, {
      treeHeight: rowSettings.treeHeight,
      crownSize: rowSettings.crownSize,
      step: rowSettings.step,
    });
    setPlantationPoints(prev => [...prev, ...newTreePoints]);
    // Можно оставить окно открытым, если требуется, но здесь вызываем закрытие:
    // handleCloseRowModal();
    setRowPoints([]);
    onConfirmPlantation();
  };


  // Прокрутка списка точек ряда вниз при добавлении новой точки
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [rowPoints]);

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
            <input type="number" value={selectedPoint.lat} readOnly style={styles.input} />
          </div>
          <div style={styles.inputRow}>
            <label style={styles.label}>Долгота:</label>
            <input type="number" value={selectedPoint.lng} readOnly style={styles.input} />
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
          {/* Кнопка открытия окна разметки рядов */}
          <button
              onClick={(e) => { e.stopPropagation(); handleOpenRowModal(); }}
              style={styles.rowButton}
          >
            Разметить ряды
          </button>
          <button onClick={onCancelPlantation} style={styles.cancelPlantationButton}>
            Отменить
          </button>
          <button onClick={onConfirmPlantation} style={styles.confirmButton}>
            Подтвердить | Обновить
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
            <span style={styles.removeIcon} onClick={() => onRemoveTreePoint(index)}>
              ❌
            </span>
                <p style={{ color: '#ADFF2F', textAlign: 'center' }}>Насаждение {index + 1}</p>
                <p>Широта: {point.lat}</p>
                <p>Долгота: {point.lng}</p>
                <p>Высота: {point.height} м</p>
                <p>Размер кроны: {point.crownSize} м</p>
              </div>
          ))}
        </div>
        {isRowModalOpen && (
            <DraggableModalPortal>
              <DraggableWindow key="rowModal" onClose={handleCloseRowModal} style={{ width: '300px' }}>
                <h3 style={{ marginTop: 0, textAlign: 'center' }}>Разметить ряды</h3>
                <div style={styles.modalContent}>
                  <div style={styles.modalInputRow}>
                    <label style={styles.modalLabel}>Высота дерева:</label>
                    <input
                        type="number"
                        value={rowSettings.treeHeight}
                        onChange={(e) =>
                            setRowSettings({ ...rowSettings, treeHeight: e.target.value })
                        }
                        placeholder="Введите высоту"
                        style={styles.modalInput}
                    />
                  </div>
                  <div style={styles.modalInputRow}>
                    <label style={styles.modalLabel}>Размер кроны:</label>
                    <input
                        type="number"
                        value={rowSettings.crownSize}
                        onChange={(e) =>
                            setRowSettings({ ...rowSettings, crownSize: e.target.value })
                        }
                        placeholder="Введите размер кроны"
                        style={styles.modalInput}
                    />
                  </div>
                  <div style={styles.modalInputRow}>
                    <label style={styles.modalLabel}>Шаг (м):</label>
                    <input
                        type="number"
                        value={rowSettings.step}
                        onChange={(e) =>
                            setRowSettings({ ...rowSettings, step: e.target.value })
                        }
                        placeholder="Введите шаг"
                        style={styles.modalInput}
                    />
                  </div>
                  <div style={styles.modalButtonRow}>
                    <button onClick={handleCancelRows} style={styles.cancelButton}>Отмена</button>
                    <button style={styles.saveButton} onClick={handleConfirmRows}>
                      Подтвердить
                    </button>
                  </div>
                  <hr style={{ margin: '10px 0' }} />
                  <div>
                    <h4 style={{ fontSize: '14px', textAlign: 'center' }}>Добавленные точки ряда</h4>
                    <div
                        ref={listRef}
                        style={{
                          maxHeight: '150px',
                          overflow: 'auto',
                          border: '1px solid #ccc',
                          padding: '5px',
                        }}
                    >
                      {rowPoints.map((pt, idx) => (
                          <div key={idx} style={styles.rowPointItem}>
                            <p style={{ fontSize: '12px' }}>
                              {idx + 1}. Широта: {pt.lat.toFixed(5)}, Долгота: {pt.lng.toFixed(5)}
                            </p>
                            <button onClick={() => deleteRowPoint(idx)} style={styles.deleteButtonRow}>
                              ✖
                            </button>
                          </div>
                      ))}
                    </div>
                  </div>
                </div>
              </DraggableWindow>
            </DraggableModalPortal>
        )}
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
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  label: {
    width: '80px',
    fontSize: '12px',
  },
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
  cancelPlantationButton: {
    width: '100%',
    marginTop: '10px',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: '#c9302c',
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
  rowButton: {
    width: '100%',
    marginTop: '10px',
    padding: '8px',
    fontSize: '16px',
    backgroundColor: 'gray',
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
    position: 'relative',
  },
  removeIcon: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    color: 'red',
  },
  modalContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  modalInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalLabel: {
    width: '100px',
    fontSize: '14px',
  },
  modalInput: {
    flex: 1,
    padding: '6px',
    fontSize: '14px',
  },
  modalButtonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '10px',
  },
  rowPointItem: {
    backgroundColor: '#444',
    padding: '4px',
    marginBottom: '4px',
    borderRadius: '2px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  addRowPointButton: {
    width: '100%',
    padding: '6px',
    fontSize: '14px',
    backgroundColor: '#666',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  confirmButtonRow: {
    backgroundColor: 'green',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    marginRight: '4px',
    padding: '4px',
  },
  deleteButtonRow: {
    backgroundColor: 'red',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '4px',
  },
};

export default PlantationPlanner;