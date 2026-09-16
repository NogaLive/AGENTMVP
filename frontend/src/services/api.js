/**
 * Capa de Servicios de API (src/services/api.js)
 * Conexión centralizada con FastAPI con manejo de Bearer Tokens e interceptores.
 */

const TOKEN_KEY = 'sbs_plaft_auth_token';
const USER_KEY = 'sbs_plaft_user_data';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  removeToken: () => localStorage.removeItem(TOKEN_KEY),

  getUser: () => {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  removeUser: () => localStorage.removeItem(USER_KEY),

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getFullApiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

async function apiRequest(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(getFullApiUrl(endpoint), {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.detail || 'Ocurrió un error en la solicitud.';
    throw new Error(errorMsg);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Servicios de Autenticación
// ---------------------------------------------------------------------------

export async function loginUser(usuario, password) {
  const res = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, password }),
  });
  if (res.access_token) {
    authStorage.setToken(res.access_token);
    authStorage.setUser(res.usuario);
  }
  return res;
}

export async function registerUser(usuario, nombre, password) {
  return await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ usuario, nombre, password }),
  });
}

export async function getProfile() {
  return await apiRequest('/api/auth/me', {
    method: 'GET',
  });
}

// ---------------------------------------------------------------------------
// Servicios de Conversaciones Privadas
// ---------------------------------------------------------------------------

export async function listConversations() {
  return await apiRequest('/api/conversaciones', {
    method: 'GET',
  });
}

export async function createConversation(data = {}) {
  return await apiRequest('/api/conversaciones', {
    method: 'POST',
    body: JSON.stringify({
      titulo: data.titulo || null,
      area_normativa: data.area_normativa || 'prevencion_lavado_activos',
      primer_mensaje: data.primer_mensaje || null,
    }),
  });
}

export async function getConversationDetail(id) {
  return await apiRequest(`/api/conversaciones/${id}`, {
    method: 'GET',
  });
}

export async function removeConversation(id) {
  return await apiRequest(`/api/conversaciones/${id}`, {
    method: 'DELETE',
  });
}

export async function updateConversationTitle(id, titulo) {
  return await apiRequest(`/api/conversaciones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ titulo }),
  });
}

// ---------------------------------------------------------------------------
// Servicio del Agente Regulatorio
// ---------------------------------------------------------------------------

export async function sendChatMessage(query, conversacionId = null, filters = {}) {
  return await apiRequest('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      query,
      conversacion_id: conversacionId,
      filters: {
        area_normativa: filters.area_normativa || 'prevencion_lavado_activos',
        tipo_producto: filters.tipo_producto || null,
        vigente: filters.vigente !== undefined ? filters.vigente : true,
      },
    }),
  });
}

export async function checkSystemStatus() {
  return await apiRequest('/api/estado', {
    method: 'GET',
  });
}

// ---------------------------------------------------------------------------
// Servicios de Compartición Cifrada (Solo Lectura)
// ---------------------------------------------------------------------------

export async function shareConversation(conversacionId) {
  return await apiRequest(`/api/conversaciones/${conversacionId}/compartir`, {
    method: 'POST',
  });
}

export async function getSharedConversation(tokenCompartido) {
  return await apiRequest(`/api/compartido/${tokenCompartido}`, {
    method: 'GET',
  });
}

// ---------------------------------------------------------------------------
// Servicios de Documentos Normativos y Extractos Oficiales
// ---------------------------------------------------------------------------

export async function getDocumentoExtracto(documento, resolucion) {
  const params = new URLSearchParams();
  if (documento) params.append('documento', documento);
  if (resolucion) params.append('resolucion', resolucion);
  try {
    const res = await fetch(getFullApiUrl(`/api/documentos/extracto/detalle?${params.toString()}`));
    return await res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function listRepositoryDocuments() {
  const token = authStorage.getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(getFullApiUrl('/api/documentos/repositorio/listar'), {
    method: 'GET',
    headers,
  });
  if (!res.ok) throw new Error('Error al listar documentos del repositorio.');
  return await res.json();
}

export async function uploadRepositoryDocument(file, carpeta = 'sbs') {
  const token = authStorage.getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('carpeta', carpeta);

  const res = await fetch(getFullApiUrl('/api/documentos/upload'), {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Error al subir documento PDF.');
  }
  return data;
}

export async function deleteRepositoryDocument(carpeta, filename) {
  const token = authStorage.getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(getFullApiUrl(`/api/documentos/${encodeURIComponent(carpeta)}/${encodeURIComponent(filename)}`), {
    method: 'DELETE',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Error al eliminar documento.');
  }
  return data;
}

export async function updateRepositoryDocument(carpeta, filename, updateData) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(getFullApiUrl(`/api/documentos/${encodeURIComponent(carpeta)}/${encodeURIComponent(filename)}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updateData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Error al actualizar atributos del documento.');
  }
  return data;
}


