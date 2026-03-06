import React from 'react';
import { X, Search, Filter } from 'lucide-react';
import './RightFiltersSidebar.css';

const RightFiltersSidebar = ({ isOpen, onClose, children }) => {
  return (
    <>
      {/* Overlay for mobile/drawer effect */}
      {isOpen && <div className="right-sidebar-overlay" onClick={onClose}></div>}
      
      <aside className={`right-filters-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="right-sidebar-header">
          <div className="right-sidebar-title">
            <Filter size={18} className="title-icon" />
            <span>Filtros de Búsqueda</span>
          </div>
          <button className="right-sidebar-close" onClick={onClose} aria-label="Cerrar filtros">
            <X size={20} />
          </button>
        </div>
        
        <div className="right-sidebar-content">
          {children}
        </div>
      </aside>
    </>
  );
};

export default RightFiltersSidebar;
