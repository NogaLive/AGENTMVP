import React, { useState, useRef, useEffect } from 'react';
import MessageItem from './MessageItem';
import ChatHeader from './ChatHeader';

const SAMPLE_QUERIES = [
  {
    title: 'Debida Diligencia para Clientes PEP',
    query: '¿Cuáles son los requisitos obligatorios y aprobaciones necesarias para la apertura de cuentas a Personas Expuestas Políticamente (PEP)?',
    desc: 'Resolución SBS 2660-2015 y Directiva DIR-PLA-04',
  },
  {
    title: 'Validación de Circular SBS B-2180-2008',
    query: '¿Es aplicable la Circular SBS B-2180-2008 para simplificar la apertura de cuentas de ahorro sin declaración jurada?',
    desc: 'Detección de norma derogada y sustituida',
  },
  {
    title: 'Procedimiento de Alertas y Operaciones Inusuales',
    query: '¿Cuáles son los plazos y criterios internos para emitir un Reporte de Operaciones Sospechosas (ROS) ante la UIF?',
    desc: 'Manual Interno PLAFT y marco regulatorio SBS',
  },
];

export default function ChatArea({
  messages = [],
  isGenerating = false,
  isSwitchingChat = false,
  onSendMessage,
  activeConversationId,
  conversation,
  isReadOnlyShare = false,
  onRenameConversation,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isSwitchingChat) {
      scrollToBottom();
    }
  }, [messages, isGenerating, isSwitchingChat]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating || isSwitchingChat) return;

    onSendMessage(input.trim());

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 46), 220)}px`;
  };

  return (
    <div className="main-content" key={activeConversationId || (isReadOnlyShare ? 'shared-view' : 'new-session')}>
      {/* Contenedor de Mensajes como Ventana Independiente */}
      <div className="messages-container">
        {/* Cabecera del expediente con Título, Fecha y Compartir */}
        {((messages.length > 0) || activeConversationId || isReadOnlyShare) && conversation && (
          <ChatHeader
            conversation={conversation}
            isReadOnlyShare={isReadOnlyShare}
            onRename={onRenameConversation}
          />
        )}

        {/* Caso A: Cargando cambio de conversación */}
        {isSwitchingChat ? (
          <div className="chat-switching-view">
            <div className="chat-switching-spinner" />
            <div>
              <div className="chat-switching-title">Cargando expediente de consulta...</div>
              <div className="chat-switching-subtitle">Recuperando fundamentación y evidencia documental</div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          /* Caso B: Estado inicial de bienvenida con consultas modelo */
          <div className="empty-state">
            <div className="empty-state-badge">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h1>ComplianceAI</h1>
            <p>
              Asistente de regulación y riesgos con sustento documental oficial, trazabilidad auditada y control de vigencia normativa.
            </p>

            <div className="sample-queries-grid">
              {SAMPLE_QUERIES.map((q, idx) => (
                <div
                  key={idx}
                  className="sample-query-card"
                  onClick={() => {
                    setInput(q.query);
                    textareaRef.current?.focus();
                  }}
                >
                  <div>
                    <div className="sample-query-title">{q.title}</div>
                    <div className="sample-query-desc">{q.desc}</div>
                  </div>
                  <div style={{ color: 'var(--brand-primary)', marginLeft: '1rem', display: 'flex', alignItems: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Caso C: Historial de mensajes */
          messages.map((m, idx) => <MessageItem key={m.id || idx} message={m} />)
        )}

        {/* Indicador de pensamiento activo del asistente */}
        {!isSwitchingChat && isGenerating && (
          <div className="message-row">
            <div className="message-avatar assistant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
            </div>
            <div className="message-content-wrapper">
              <div className="message-header">
                <span className="message-author">Asistente Regulatorio</span>
                <span className="badge-confidence MEDIO">Analizando Normativa...</span>
              </div>
              <div className="message-bubble" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: '2px solid var(--border-medium)',
                    borderTopColor: 'var(--brand-primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Recuperando evidencia documental y validando vigencia...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Barra de Chat Flotante Inferior Ultra-Limpia (Estilo Gemini / Claude) */}
      <div className="floating-input-container">
        {isReadOnlyShare ? (
          <div className="floating-capsule readonly-capsule">
            <div className="readonly-input-content">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: 'var(--brand-primary)', minWidth: 18 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="readonly-capsule-text">
                Esta conversación es compartida y de solo lectura. No es posible redactar nuevos mensajes en este hilo.
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="floating-capsule">
            <div className="input-interactive-row">
              <textarea
                ref={textareaRef}
                rows={2}
                className="chat-textarea"
                placeholder="Escribe tu consulta regulatoria o caso operativo (ej. aperturas PEP, normas derogadas)..."
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={isGenerating || isSwitchingChat}
                id="input-consulta-regulatoria"
              />
              <button
                type="submit"
                className="floating-send-btn"
                disabled={!input.trim() || isGenerating || isSwitchingChat}
                title="Enviar consulta (Enter)"
                id="btn-enviar-flotante"
              >
                {isGenerating ? (
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
