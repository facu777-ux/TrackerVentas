import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 segundos de timeout
  headers: {
    "Content-Type": "application/json",
  },
});

const isApiTraceEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage?.getItem("tv_api_trace") === "1";
};

export const seguimientoAPI = {
  // Buscar seguimiento con filtros
  buscarSeguimiento: async (filtros) => {
    if (isApiTraceEnabled()) {
      console.info("[API_TRACE] /seguimiento request", filtros);
    }
    const response = await api.post("/seguimiento", filtros);
    if (isApiTraceEnabled()) {
      const count = Array.isArray(response.data?.data) ? response.data.data.length : 0;
      console.info("[API_TRACE] /seguimiento response", {
        success: !!response.data?.success,
        count,
      });
    }
    return response.data;
  },

  // Obtener lista de empresas
  obtenerEmpresas: async () => {
    const response = await api.get("/seguimiento/empresas");
    return response.data;
  },

  // Buscar clientes
  buscarClientes: async (search = "") => {
    const response = await api.get("/seguimiento/clientes", {
      params: { search },
    });
    return response.data;
  },

  // Obtener puntos de venta externos (proxy backend)
  obtenerPuntosVenta: async () => {
    const response = await api.get("/points-of-sale");
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.get("/health");
    return response.data;
  },
};

export const agingAPI = {
  obtenerAging: async (empresa = null) => {
    const params = empresa ? { empresa } : {};
    const response = await api.get("/aging", { params });
    return response.data;
  },
};

export default api;
