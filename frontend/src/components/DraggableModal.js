// src/components/DraggableModal.js
import React, { useState, useRef, useEffect } from 'react';

const DraggableModal = ({ isOpen, onClose, children, style }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const dragRef = useRef(null);

    useEffect(() => {
        // Центрирование окна при открытии
        if (isOpen && dragRef.current) {
            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = dragRef.current;

            setPosition({
                x: (innerWidth - offsetWidth) / 2,
                y: (innerHeight - offsetHeight) / 2,
            });
        }
    }, [isOpen]);

    const handleMouseDown = (e) => {
        const initialX = e.clientX - position.x;
        const initialY = e.clientY - position.y;

        const handleMouseMove = (e) => {
            const newX = e.clientX - initialX;
            const newY = e.clientY - initialY;
            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    if (!isOpen) return null;

    return (
        <div
            ref={dragRef}
            style={{
                ...defaultStyle,
                ...style,
                position: 'absolute',
                left: `${position.x}px`,
                top: `${position.y}px`,
            }}
        >
            {/* Заголовок для захвата и перетаскивания */}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    cursor: 'move',
                    padding: '10px',
                    backgroundColor: '#f1f1f1',
                    borderTopLeftRadius: '8px',
                    borderTopRightRadius: '8px',
                }}
            >
                <button onClick={onClose} style={closeButtonStyle}>Закрыть</button>
            </div>
            <div style={{ padding: '10px' }}>{children}</div>
        </div>
    );
};

const defaultStyle = {
    width: '300px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    zIndex: 1001,
};

const closeButtonStyle = {
    float: 'right',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
};

export default DraggableModal;