// src/components/Sidebar.js
import React from 'react';

const Sidebar = ({ onOpenSettings, onOpenHistory, onOpenMission, isOpen, onToggleSidebar }) => {
  return (
    <div style={{ ...styles.sidebar, width: isOpen ? '200px' : '50px' }}>
      <button style={styles.toggleButton} onClick={onToggleSidebar}>
        {isOpen ? '<<' : '>>'}
      </button>
      {isOpen && (
        <>
          <h2 style={styles.title}>Helixx</h2>
          <button style={styles.button} onClick={onOpenSettings}>Настройки карты</button>
          <button style={styles.button} onClick={onOpenHistory}>История полетов</button>
          <button style={styles.button} onClick={onOpenMission}>Старт миссии</button>
        </>
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
  title: {
    marginBottom: '20px',
  },
  button: {
    width: '100%',
    marginBottom: '10px',
    padding: '10px',
    fontSize: '16px',
    backgroundColor: '#444',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  }
};

export default Sidebar;