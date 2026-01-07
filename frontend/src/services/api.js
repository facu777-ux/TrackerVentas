import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const seguimientoAPI = {
  // Buscar seguimiento con filtros
  buscarSeguimiento: async (filtros) => {
    const response = await api.post("/seguimiento", filtros);
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

  // Health check
  healthCheck: async () => {
    const response = await api.get("/health");
    return response.data;
  },
};

export default api;
