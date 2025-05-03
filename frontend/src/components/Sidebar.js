// src/components/Sidebar.js

import React from 'react';
import treesImg from '../assets/trees.png';

const Sidebar = ({
                     onOpenSettings,
                     onOpenCalibration,
                     onOpenHistory,
                     onOpenMission,
                     onToggleTreePlacing,
                     isOpen,
                     onToggleSidebar,
                     onStartMission
                 }) => {
    return (
        <div style={{ ...styles.sidebar, width: isOpen ? '200px' : '50px', overflowX: 'hidden' }}>
            <button style={styles.toggleButton} onClick={onToggleSidebar}>
                {isOpen ? '<<' : '>>'}
            </button>
            {isOpen ? (
                <>
                    <h2 style={styles.centeredTitle}>Helixx</h2>
                    <button style={styles.button} onClick={onOpenSettings}>Настройки карты</button>
                    <button style={styles.button} onClick={onOpenCalibration}>Калибровка дрона</button>
                    <button
                        style={{
                            ...styles.button,
                            height: '40px',
                            backgroundImage: `url(${treesImg})`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                            backgroundSize: 'contain',
                        }}
                        onClick={onToggleTreePlacing}
                    >
                    </button>
                    <button style={styles.button} onClick={onOpenMission}>Планировщик миссий</button>
                    <button style={{...styles.button, ...styles.startMissionButton}} onClick={onStartMission}>
                        Старт миссии
                    </button>
                    <button style={{...styles.button, ...styles.historyButton}} onClick={onOpenHistory}>История
                        полетов
                    </button>
                </>
            ) : (
                <div style={styles.rotatedTextContainer}>
                <div style={styles.rotatedText}>Планировщик миссий</div>
                </div>
            )}
        </div>
    );
};

const styles = {
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '200px',
        maxWidth: '100vw',
        height: '100%',
        backgroundColor: '#333',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        zIndex: 1000,
        overflowX: 'hidden',
    },
    toggleButton: {
        alignSelf: 'flex-end',
        marginBottom: '20px',
    },
    rotatedTextContainer: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
    },
    rotatedText: {
        transform: 'rotate(-90deg)',
        transformOrigin: 'center',
        fontSize: '20px',
        color: 'white',
        whiteSpace: 'nowrap',
        zIndex: 1001,
    },
    centeredTitle: {
        marginBottom: '20px',
        textAlign: 'center',
        alignSelf: 'center',
        width: '100%',
    },
    button: {
        width: '100%',
        marginBottom: '10px',
        padding: '10px',
        fontSize: '20px',
        backgroundColor: '#444',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
    },
    historyButton: {
        marginTop: 'auto',
        marginBottom: '40px',
    },
};

export default Sidebar;
