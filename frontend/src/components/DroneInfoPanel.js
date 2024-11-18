// src/components/DroneInfoPanel.js
import React, { useState } from 'react';

const DroneInfoPanel = ({ latitude, longitude, altitude, heading, onHide }) => {
    const [isMinimized, setIsMinimized] = useState(false);

    const panelStyle = {
        position: 'fixed',
        bottom: '5px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '15px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '8px',
        width: '220px',
        fontSize: '14px',
        boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.5)',
    };

    const closeButtonStyle = {
        position: 'absolute',
        top: '5px',
        right: '5px',
        backgroundColor: 'transparent',
        color: 'white',
        border: 'none',
        fontSize: '18px',
        cursor: 'pointer',
        lineHeight: '1',
    };

    const toggleMinimize = () => setIsMinimized(!isMinimized);

    return (
        <div style={panelStyle}>
            <button style={closeButtonStyle} onClick={onHide}>×</button>
            <button style={{ ...closeButtonStyle, right: '25px' }} onClick={toggleMinimize}>
                {isMinimized ? '+' : '−'}
            </button>
            <h3 style={{ margin: '0 0 10px' }}>GNSS Информация</h3>
            {!isMinimized && (
                <>
                    <p>Широта: {latitude.toFixed(5)}</p>
                    <p>Долгота: {longitude.toFixed(5)}</p>
                    <p>Высота: {altitude} м</p>
                    <p>Направление: {heading}°</p>
                </>
            )}
        </div>
    );
};

export default DroneInfoPanel;