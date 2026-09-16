import React, { useState } from 'react';
import CitationCard from './CitationCard';

function renderFormattedText(text) {
  if (!text) return null;

  // Dividir en párrafos
  const paragraphs = text.split('\n\n');

  return paragraphs.map((para, pIdx) => {
    const lines = para.split('\n');

    // Verificar si es una lista con viñetas
    if (lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
      return (
        <ul key={pIdx}>
          {lines.map((l, lIdx) => (
            <li key={lIdx} dangerouslySetInnerHTML={{ __html: formatInline(l.replace(/^[-*]\s+/, '')) }} />
          ))}
        </ul>
      );
    }

    // Verificar si es un encabezado
    if (lines[0].startsWith('### ')) {
      return <h3 key={pIdx}>{lines[0].replace(/^###\s+/, '')}</h3>;
    }
    if (lines[0].startsWith('## ')) {
      return <h2 key={pIdx}>{lines[0].replace(/^##\s+/, '')}</h2>;
    }

    return (
      <p key={pIdx}>
        {lines.map((line, lIdx) => (
          <React.Fragment key={lIdx}>
            <span dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
            {lIdx < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function formatInline(str) {
  // Reemplazar **negrita**
  let formatted = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Reemplazar `codigo`
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:var(--bg-elevated);border:1px solid var(--border-subtle);padding:2px 6px;border-radius:6px;font-family:monospace;font-size:0.85em;color:var(--brand-primary);">$1</code>');
  return formatted;
}

export default function MessageItem({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.rol === 'user';
  const fuentes = message.fuentes_citadas || [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.contenido || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar texto:', err);
    }
  };

  return (
    <div className="message-row">
      <div className={`message-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        )}
      </div>

      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-author">{isUser ? 'Analista' : 'ComplianceAI'}</span>
          {!isUser && message.nivel_confianza && (
            <span className={`badge-confidence ${message.nivel_confianza}`}>
              Confianza {message.nivel_confianza}
            </span>
          )}
          {message.creado_en && (
            <span className="message-timestamp">
              {new Date(message.creado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div className={`message-bubble ${isUser ? 'user-bubble' : ''}`}>
          {/* Alerta de Norma Derogada / Obsoleta */}
          {!isUser && message.outdated_alert && (
            <div className="outdated-banner">
              <svg className="outdated-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ minWidth: 18 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <strong>ADVERTENCIA DE VIGENCIA REGULATORIA:</strong>
                <div style={{ marginTop: '2px', fontSize: '0.8rem' }}>
                  Esta consulta involucra normativa derogada, sustituida o en desuso. No utilice estas disposiciones para nuevos contratos o procesos operativos vigentes.
                </div>
              </div>
            </div>
          )}

          {/* Cuerpo de respuesta formateado */}
          <div className="message-body">
            {renderFormattedText(message.contenido)}
          </div>

          {/* Sección de Citas Documentales Oficiales */}
          {!isUser && fuentes.length > 0 && (
            <div className="citations-section">
              <div className="citations-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Evidencia y Citas Normativas ({fuentes.length})</span>
              </div>
              <div className="citations-grid">
                {fuentes.map((f, idx) => (
                  <CitationCard key={idx} fuente={f} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Acciones del Mensaje: Botón de Copiar */}
        <div className={`message-actions-row ${isUser ? 'user-actions' : ''}`}>
          <button
            type="button"
            className={`copy-message-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Copiar texto al portapapeles"
          >
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Copiado ✓</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
