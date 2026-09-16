import React from 'react';

export default function Sidebar({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  user,
  onLogout,
  theme,
  onToggleTheme,
  isReadOnlyShare = false,
  onExitShare,
  activeView = 'chat',
  onOpenDocumentManager,
}) {
  const getInitials = (name) => {
    if (!name) return 'A';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-PE', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <aside className={`sidebar ${!user ? 'sidebar-deactivated' : ''}`}>
      <div className="sidebar-header">
        <div className="brand-badge">
          <div className="brand-icon-wrapper">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="brand-title">
            <span className="brand-title-text">ComplianceAI</span>
            <span className="brand-subtitle-text">Regulación y Riesgos</span>
          </div>
        </div>
      </div>

      <div className="conversations-list">
        {/* Acciones Principales de Navegación del Asistente */}
        <div className="sidebar-repo-action-box">
          {!isReadOnlyShare && (
            <button
              type="button"
              className={`sidebar-repo-nav-btn ${activeView === 'documents' ? 'active' : ''}`}
              onClick={onOpenDocumentManager}
              disabled={!user}
              title={user ? 'Gestionar y agregar documentos oficiales' : 'Inicia sesión para gestionar documentos'}
              id="btn-agregar-documentos-oficiales"
            >
              <div className="repo-nav-icon-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="12" y1="6" x2="12" y2="12" />
                  <line x1="9" y1="9" x2="15" y2="9" />
                </svg>
              </div>
              <div className="repo-nav-text-col">
                <span className="repo-nav-title">Agregar Documentos</span>
                <span className="repo-nav-sub">Repositorio SBS y Políticas</span>
              </div>
              <svg className="repo-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {isReadOnlyShare ? (
            <button
              type="button"
              className="sidebar-repo-nav-btn"
              onClick={onExitShare}
              title="Ir al inicio de sesión como analista"
              id="btn-iniciar-sesion-share"
            >
              <div className="repo-nav-icon-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div className="repo-nav-text-col">
                <span className="repo-nav-title">Iniciar Sesión</span>
                <span className="repo-nav-sub">Acceder como analista</span>
              </div>
              <svg className="repo-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className={`sidebar-repo-nav-btn ${activeView === 'chat' && !activeConversationId ? 'active' : ''}`}
              onClick={onNewChat}
              disabled={!user}
              title={user ? 'Iniciar nueva consulta regulatoria' : 'Inicia sesión para consultar'}
              id="btn-nueva-consulta"
            >
              <div className="repo-nav-icon-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="repo-nav-text-col">
                <span className="repo-nav-title">Nueva Consulta</span>
                <span className="repo-nav-sub">Iniciar nuevo chat regulatorio</span>
              </div>
              <svg className="repo-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        <div className="conversations-section-title">
          {isReadOnlyShare ? 'Enlace Compartido' : 'Historial de Consultas'}
        </div>

        {isReadOnlyShare ? (
          <div style={{ padding: '1.25rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', lineHeight: '1.4' }}>
            <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              🔒 Vista de solo lectura
            </div>
            Estás visualizando una consulta compartida por un analista.
          </div>
        ) : !user ? (
          <div style={{ padding: '1.5rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', lineHeight: '1.5' }}>
            <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Sesión Requerida
            </div>
            Inicia sesión en el panel principal para consultar y administrar tu historial privado.
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: '1.25rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
            No hay consultas previas registradas.
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeConversationId;
            return (
              <div
                key={c.id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectConversation(c.id)}
                title={c.titulo}
              >
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                  <span className="conv-title">{c.titulo}</span>
                  <span className="conv-meta">{formatDate(c.actualizado_en)}</span>
                </div>
                <button
                  type="button"
                  className="conv-delete-btn"
                  title="Eliminar consulta"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('¿Deseas eliminar esta consulta del historial?')) {
                      onDeleteConversation(c.id);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-profile-left">
            <div className="user-avatar">{user ? getInitials(user.nombre) : '—'}</div>
            <div className="user-info">
              <div className="user-name">{user ? user.nombre : 'No autenticado'}</div>
              <div className="user-handle">{user ? `@${user.usuario}` : 'Sesión cerrada'}</div>
            </div>
          </div>

          <div className="user-actions">
            {/* Botón de Cambio de Tema (☀️ / 🌙) */}
            <button
              type="button"
              className="action-circle-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Cambiar a Tema Claro (Claude)' : 'Cambiar a Tema Oscuro (Gemini)'}
              id="btn-cambiar-tema"
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Botón de Cerrar Sesión solo si hay usuario */}
            {user && (
              <button
                type="button"
                className="action-circle-btn"
                onClick={onLogout}
                title="Cerrar Sesión"
                id="btn-cerrar-sesion"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
