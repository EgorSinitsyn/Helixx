// src/components/DraggableModal.js

import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * DraggableModal — перетаскиваемое модальное окно
 * @param {Object} props
 * @param {boolean} props.isOpen — флаг открытия модального окна
 * @param {Function} props.onClose — колбэк закрытия окна
 * @param {React.ReactNode} props.children — содержимое модалки
 * @param {React.CSSProperties} [props.style] — дополнительные стили контейнера
 */

const DraggableModal = React.memo(({ isOpen, onClose, children, style }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  /**
   * Центрирует окно в viewport при открытии
   */
  useEffect(() => {
    if (isOpen && dragRef.current) {
      const { innerWidth, innerHeight } = window;
      const { offsetWidth, offsetHeight } = dragRef.current;
      setPosition({
        x: (innerWidth - offsetWidth) / 2,
        y: (innerHeight - offsetHeight) / 2,
      });
    }
  }, [isOpen]);

  /**
   * Инициация перетаскивания
   * @param {React.MouseEvent} e
   */
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    /**
     * Обработка перемещения мыши
     * @param {MouseEvent} moveEvent
     */
    const handleMouseMove = (moveEvent) => {
      setPosition({
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY,
      });
    };

    /**
     * Завершение перетаскивания
     */
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position]);

  if (!isOpen) return null;

  return (
    <div
      ref={dragRef}
      style={{
        ...defaultStyle,
        ...style,
        position: 'absolute',
        left: position.x,
        top: position.y,
      }}
    >
      <div onMouseDown={handleMouseDown} style={headerStyle}>        
        <button onClick={onClose} style={closeButtonStyle}>Закрыть</button>
      </div>
      <div style={contentStyle}>{children}</div>
    </div>
  );
});

export default DraggableModal;

// -------------------------------------------------------------------
// Стили компонента
const defaultStyle = {
  width: '300px',
  backgroundColor: 'white',
  border: '1px solid #ccc',
  borderRadius: '8px',
  zIndex: 1001,
};

const headerStyle = {
  cursor: 'move',
  padding: '10px',
  backgroundColor: '#f1f1f1',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
};

const contentStyle = {
  padding: '10px',
};

const closeButtonStyle = {
  float: 'right',
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
};
