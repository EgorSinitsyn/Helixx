import React, { useState } from 'react';
import './compass_style.css';

const DroneInfoPanel = ({ latitude, longitude, altitude, flightAltitude, heading, onHide }) => {
    const [isMinimized, setIsMinimized] = useState(false);

    const panelStyle = {
        position: 'fixed',
        zIndex: 9999,
        bottom: '5px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '15px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '8px',
        width: '210px',
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
        // Внешний контейнер, объединяющий всю разметку
        <div style={{ position: 'relative' }}>
            <div style={panelStyle}>
                <button style={closeButtonStyle} onClick={onHide}>×</button>
                <button
                    style={{ ...closeButtonStyle, right: '25px' }}
                    onClick={toggleMinimize}
                >
                    {isMinimized ? '+' : '−'}
                </button>
                <h3 style={{ margin: '0 0 10px' }}>GNSS Информация</h3>
                {!isMinimized && (
                    <>
                        <p>Широта: {latitude.toFixed(5)}</p>
                        <p>Долгота: {longitude.toFixed(5)}</p>
                        <p>Высота: {Number(altitude).toFixed(2)} м</p>
                        <p>Высота полёта: {flightAltitude.toFixed(2)} м</p>
                        <p>Направление: {heading}°</p>
                    </>
                )}
            </div>

            {/* Блок с компасом */}
            {!isMinimized && (
                <div
                    className="compass-container"
                    style={{
                        position: 'absolute',
                        bottom: '3px',
                        right: '455px', /* можно подвинуть, как нужно */
                        zIndex: 9999
                    }}
                >
                    <div className="compass">
                        <div className="compass-center"></div>
                        <div className="arrow-south"></div>
                        <div className="arrow"></div>
                        <div
                            className="compass-rotatable"
                            style={{ transform: `rotate(${-heading}deg)` }}
                        >
                            <div className="tick tick-0"></div>
                            <div className="tick tick-45"></div>
                            <div className="tick tick-90"></div>
                            <div className="tick tick-135"></div>
                            <div className="tick tick-180"></div>
                            <div className="tick tick-225"></div>
                            <div className="tick tick-270"></div>
                            <div className="tick tick-315"></div>
                            <div className="compass-directions">
                                <div className="north">С</div>
                                <div className="east">В</div>
                                <div className="south">Ю</div>
                                <div className="west">З</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DroneInfoPanel;