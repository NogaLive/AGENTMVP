import React, { useState, useEffect, useRef } from 'react';
import { shareConversation } from '../services/api';

export default function ChatHeader({
  conversation,
  isReadOnlyShare = false,
  onRename,
}) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Estados para edición del título en línea
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(conversation?.titulo || '');
  const [savingTitle, setSavingTitle] = useState(false);
  const inputRef = useRef(null);

  // Medición para efecto marquee dinámico al hacer hover sobre .chat-header-card
  const containerRef = useRef(null);
  const titleTextRef = useRef(null);
  const [marqueeOffset, setMarqueeOffset] = useState(0);

  const measureOverflow = () => {
    if (titleTextRef.current && containerRef.current) {
      const scrollW = titleTextRef.current.scrollWidth;
      const clientW = containerRef.current.clientWidth;
      if (scrollW > clientW + 2) {
        setMarqueeOffset(scrollW - clientW);
      } else {
        setMarqueeOffset(0);
      }
    }
  };

  useEffect(() => {
    setTitleInput(conversation?.titulo || '');
    measureOverflow();
    const timer = setTimeout(measureOverflow, 80);

    let observer = null;
    if (window.ResizeObserver) {
      observer = new ResizeObserver(() => {
        measureOverflow();
      });
      if (containerRef.current) observer.observe(containerRef.current);
      if (titleTextRef.current) observer.observe(titleTextRef.current);
    }

    window.addEventListener('resize', measureOverflow);
    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measureOverflow);
    };
  }, [conversation?.titulo, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!conversation) return null;

  const handleStartEdit = () => {
    if (isReadOnlyShare) return;
    setTitleInput(conversation.titulo || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setTitleInput(conversation.titulo || '');
  };

  const handleSaveTitle = async (e) => {
    if (e) e.preventDefault();
    if (!titleInput.trim() || titleInput.trim() === conversation.titulo) {
      setIsEditing(false);
      return;
    }

    if (onRename) {
      setSavingTitle(true);
      try {
        await onRename(conversation.id, titleInput.trim());
        setIsEditing(false);
      } catch (err) {
        console.error('Error al guardar título:', err);
      } finally {
        setSavingTitle(false);
      }
    } else {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveTitle(e);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleOpenShare = async () => {
    setIsShareModalOpen(true);
    setCopied(false);
    setError(null);

    if (conversation.token_compartido) {
      setShareUrl(`${window.location.origin}/?share=${conversation.token_compartido}`);
      return;
    }

    setLoading(true);
    try {
      const res = await shareConversation(conversation.id);
      if (res && res.token_compartido) {
        const fullUrl = `${window.location.origin}/?share=${res.token_compartido}`;
        setShareUrl(fullUrl);
      }
    } catch (err) {
      console.error('Error al generar enlace seguro:', err);
      setError('No fue posible generar el enlace seguro. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Error al copiar enlace:', err);
    }
  };

  const formattedDate = conversation.actualizado_en
    ? new Date(conversation.actualizado_en).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <div className="chat-header-card" onMouseEnter={measureOverflow}>
        {/* Sección Principal (Alineada a la izquierda como antes) */}
        <div className="chat-header-main">
          <div className="chat-header-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          <div className="chat-header-info">
            {isEditing ? (
              <form onSubmit={handleSaveTitle} className="inline-title-edit-form">
                <input
                  ref={inputRef}
                  type="text"
                  className="inline-title-input"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={255}
                  disabled={savingTitle}
                  placeholder="Nombre del chat..."
                />
                <div className="inline-title-actions">
                  <button
                    type="submit"
                    className="inline-title-btn save"
                    title="Guardar nombre (Enter)"
                    disabled={savingTitle || !titleInput.trim()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="inline-title-btn cancel"
                    onClick={handleCancelEdit}
                    title="Cancelar (Esc)"
                    disabled={savingTitle}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </form>
            ) : (
              <div className="chat-title-row">
                <div
                  ref={containerRef}
                  className={`chat-title-marquee-container ${marqueeOffset > 0 ? 'has-marquee' : ''}`}
                  style={{ '--marquee-shift': `-${marqueeOffset + 16}px` }}
                >
                  <h2
                    ref={titleTextRef}
                    className="chat-header-title"
                    title={conversation.titulo}
                  >
                    {conversation.titulo || 'Expediente de Consulta Regulatoria'}
                  </h2>
                </div>

                {!isReadOnlyShare && (
                  <button
                    type="button"
                    className="edit-title-btn"
                    onClick={handleStartEdit}
                    title="Editar nombre del chat"
                    id="btn-editar-titulo-chat"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            <div className="chat-header-meta">
              {formattedDate && <span>Actualizado: {formattedDate}</span>}
              {conversation.area_normativa && (
                <>
                  <span className="chat-meta-dot">•</span>
                  <span className="chat-area-pill">
                    {conversation.area_normativa.replace(/_/g, ' ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sección Derecha: Compartir o Solo Lectura */}
        <div className="chat-header-actions">
          {isReadOnlyShare ? (
            <div className="shared-readonly-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Solo lectura</span>
            </div>
          ) : (
            <button
              type="button"
              className="share-header-btn"
              onClick={handleOpenShare}
              title="Compartir enlace seguro de solo lectura"
              id="btn-compartir-chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Compartir</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal / Diálogo de Compartir Enlace Cifrado */}
      {isShareModalOpen && (
        <div className="share-popover-overlay" onClick={() => setIsShareModalOpen(false)}>
          <div className="share-popover-card" onClick={(e) => e.stopPropagation()}>
            <div className="share-popover-header">
              <div className="share-popover-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <div>
                <h3 className="share-popover-title">Compartir Consulta Regulatoria</h3>
                <p className="share-popover-desc">
                  Genera un enlace público cifrado con token de alta entropía. El destinatario podrá leer las respuestas y citas oficiales, pero no podrá modificar ni continuar el chat.
                </p>
              </div>
              <button
                type="button"
                className="share-close-btn"
                onClick={() => setIsShareModalOpen(false)}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <div className="share-loading-box">
                <div className="share-spinner" />
                <span>Generando enlace cifrado no deducible...</span>
              </div>
            ) : error ? (
              <div className="auth-error-alert" style={{ margin: '1rem 0' }}>
                {error}
              </div>
            ) : (
              <div className="share-link-section">
                <div className="share-input-group">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="share-url-input"
                    id="input-share-url"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className={`share-copy-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopyLink}
                    id="btn-copiar-enlace-compartido"
                  >
                    {copied ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copiar enlace</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="share-security-notice">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ minWidth: 14 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>
                    <strong>Seguridad Criptográfica:</strong> La URL contiene un token aleatorio de 256 bits inmune a ataques por fuerza bruta o adivinación secuencial.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
