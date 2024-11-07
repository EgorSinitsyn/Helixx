// src/components/Sidebar.js
import React from 'react';

const Sidebar = ({
                     onOpenSettings,
                     onOpenHistory,
                     onOpenMission,
                     isOpen,
                     onToggleSidebar
                 }) => {
    return (
        <div style={{ ...styles.sidebar, width: isOpen ? '200px' : '50px' }}>
            <button style={styles.toggleButton} onClick={onToggleSidebar}>
                {isOpen ? '<<' : '>>'}
            </button>
            {isOpen ? (
                <>
                    <h2 style={styles.centeredTitle}>Helixx</h2>
                    <button style={styles.button} onClick={onOpenSettings}>Настройки карты</button>
                    <button style={styles.button} onClick={onOpenHistory}>История полетов</button>
                    <button style={styles.button} onClick={onOpenMission}>Старт миссии</button>
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
        height: '100%',
        backgroundColor: '#333',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        zIndex: 1000,
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
};

export default Sidebar;
