import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  HelpCircle, 
  Search, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  Database,
  BarChart3,
  Box,
  Truck
} from 'lucide-react';
import './AppSidebar.css';

const navData = {
  main: [
    { title: "Dashboard", icon: <LayoutDashboard size={20} />, active: true },
    { title: "Logística", icon: <Truck size={20} /> },
    { title: "Analítica", icon: <BarChart3 size={20} /> },
    { title: "Inventario", icon: <Box size={20} /> },
  ],
  admin: [
    { title: "Base de Datos", icon: <Database size={20} /> },
    { title: "Configuración", icon: <Settings size={20} /> },
    { title: "Ayuda", icon: <HelpCircle size={20} /> },
  ],
  user: {
    name: "Terminal UX",
    email: "senior.engineer@dibiagi.com",
    avatar: "https://ui-avatars.com/api/?name=TX&background=3291ff&color=fff"
  }
};

const AppSidebar = ({ activeView, setActiveView, isCollapsed, onCollapse, isMobile, showMobile, setShowMobile, children }) => {
  const handleNavClick = (viewId) => {
    setActiveView(viewId);
    if (isMobile && setShowMobile) setShowMobile(false);
  };

  const menuItems = [
    { id: 'dashboard', title: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { id: 'analitica', title: "Analítica", icon: <BarChart3 size={20} /> },
    { id: 'logistica', title: "Logística", icon: <Truck size={20} /> },
    { id: 'inventario', title: "Inventario", icon: <Box size={20} /> },
  ];

  const adminItems = [
    { id: 'database', title: "Base de Datos", icon: <Database size={20} /> },
    { id: 'settings', title: "Configuración", icon: <Settings size={20} /> },
    { id: 'help', title: "Ayuda", icon: <HelpCircle size={20} /> },
  ];

  return (
    <aside className={`premium-sidebar ${isCollapsed ? 'collapsed' : 'expanded'} ${isMobile ? 'mobile' : ''} ${showMobile ? 'show-mobile' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-box">
             <img src="/favicon.png" alt="Dibiagi Logo" className="sidebar-logo-img" />
          </div>
          {!isCollapsed && <span className="logo-text">Dibiagi <span className="logo-tag">CORE</span></span>}
        </div>
      </div>

      {!isMobile && (
        <button className="sidebar-toggle floating-toggle" onClick={() => onCollapse(!isCollapsed)}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}

      <div className="sidebar-content">
        <div className="nav-section">
          {!isCollapsed && <span className="section-label">Operaciones</span>}
          {menuItems.map((item) => (
            <button 
              key={item.id} 
              className={`nav-item ${activeView === item.id ? 'active' : ''}`} 
              onClick={() => handleNavClick(item.id)}
              title={isCollapsed ? item.title : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              {!isCollapsed && <span className="nav-label">{item.title}</span>}
              {activeView === item.id && !isCollapsed && <div className="active-glow"></div>}
            </button>
          ))}
        </div>


        <div className="sidebar-filters-container">
            {children}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-hub glass">
          <img src={navData.user.avatar} alt="Avatar" className="user-avatar" />
          {!isCollapsed && (
            <div className="user-info">
              <span className="user-name">{navData.user.name}</span>
              <span className="user-role">Administrador</span>
            </div>
          )}
          {!isCollapsed && <button className="logout-btn"><LogOut size={16} /></button>}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
