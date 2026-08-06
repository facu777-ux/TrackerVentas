import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RutasReporteModal from './components/RutasReporteModal.jsx'
import './index.css'

// Si la URL trae ?reporte=rutas, se renderiza el reporte de rutas como página
// completa (abierto en pestaña nueva desde el modal) en lugar de la app.
const params = new URLSearchParams(window.location.search)
const isRutasPage = params.get('reporte') === 'rutas'
  && params.get('fechaDesde')
  && params.get('fechaHasta')

// La app aplica el tema desde App.jsx; en la página standalone hay que
// aplicarlo acá para que las variables CSS (data-theme) coincidan.
if (isRutasPage) {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isRutasPage ? (
      <RutasReporteModal
        standalone
        searchCriteria={{
          fechaDesde: params.get('fechaDesde'),
          fechaHasta: params.get('fechaHasta'),
        }}
        empresaFiltro={params.get('empresa') || null}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
