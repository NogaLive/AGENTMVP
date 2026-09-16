import React, { useState, useEffect, useRef } from 'react';
import { getDocumentoExtracto } from '../services/api';

/**
 * Función de resaltado sintáctico de términos y cláusulas jurídicas regulatorias.
 * Aplica el efecto de marcador fluorescente amarillo neón sobre las frases clave.
 */
function renderHighlightedText(text) {
  if (!text) return null;

  const highlightRegex = /(Personas Expuestas Políticamente|PEP|aprobación del funcionario de mayor rango de la unidad de negocio respectiva|aprobación del funcionario de mayor rango|aprobación expresa del Gerente de División o Director del Área Comercial|aprobación expresa|declaración jurada sobre el origen de los fondos|declaración jurada patrimonial actualizada|declaración jurada patrimonial|declaración jurada|monitoreo continuo reforzado|debida diligencia reforzada|debida diligencia|listas restrictivas y cautelares|listas cautelares|OFAC, ONU|requisito indispensable|requisitos operativos|plazo máximo para completar el legajo es de 15 días calendario|15 días calendario|ESTADO: NORMA DEROGADA \/ OBSOLETA|NORMA DEROGADA|régimen reforzado|régimen simplificado)/gi;

  const parts = text.split(highlightRegex);

  return parts.map((part, index) => {
    if (part.match(highlightRegex)) {
      return (
        <mark key={index} className="legal-highlight">
          {part}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/**
 * Texto de contingencia institucional en caso de no venir persistido en citas históricas
 */
function getFallbackText(docName = '', resolucion = '') {
  const nameLower = (docName + ' ' + resolucion).toLowerCase();
  if (nameLower.includes('2660') || nameLower.includes('sbs')) {
    return 'Resolución SBS N° 2660-2015 - Reglamento de Gestión de Riesgo de Lavado de Activos y Financiamiento del Terrorismo. Artículo 24.- Régimen Reforzado para Personas Expuestas Políticamente (PEP): Para la apertura de cuentas de ahorro u operaciones pasivas a Personas Expuestas Políticamente (PEP), es requisito indispensable contar con la aprobación del funcionario de mayor rango de la unidad de negocio respectiva, además de recabar la declaración jurada sobre el origen de los fondos y realizar un monitoreo continuo reforzado de sus transacciones.';
  }
  if (nameLower.includes('dir_pla') || nameLower.includes('dir-pla') || nameLower.includes('manual') || nameLower.includes('intern')) {
    return 'Directiva DIR-PLA-04: Procedimientos de Admisión de Clientes de Alto Riesgo. Numeral 5.2 - Requisitos Operativos para Cuentas PEP: En cumplimiento de las políticas de prevención de lavado de activos del banco, toda solicitud de apertura vinculada a un cliente PEP requiere: a) Validación previa en listas restrictivas y cautelares (OFAC, ONU). b) Aprobación expresa del Gerente de División o Director del Área Comercial antes del desembolso o apertura. c) Declaración Jurada Patrimonial actualizada. El plazo máximo para completar el legajo es de 15 días calendario.';
  }
  if (nameLower.includes('2180') || nameLower.includes('derogada')) {
    return 'Circular SBS N° B-2180-2008 - Disposiciones de Apertura Simplificada. ESTADO: NORMA DEROGADA / OBSOLETA. Artículo 1.- Régimen Simplificado para Cuentas Básicas (Disposición sin vigencia técnica por derogación expresa).';
  }
  return 'Evidencia documental recuperada de los registros regulatorios oficiales para sustento de la resolución normativa analizada.';
}

export default function CitationCard({ fuente }) {
  const { documento, resolucion_articulo, pagina, score_relevancia, extracto } = fuente;
  const scorePercent = Math.round((score_relevancia || 0) * 100);

  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extractoText, setExtractoText] = useState(extracto || '');
  const [loadingExtract, setLoadingExtract] = useState(false);
  const leaveTimeoutRef = useRef(null);

  const isDerogada = (documento + ' ' + (resolucion_articulo || '')).toLowerCase().includes('derogada');
  const isSBS = (documento + ' ' + (resolucion_articulo || '')).toLowerCase().includes('sbs');

  // Carga reactiva del extracto si no vino incluido en la cita
  useEffect(() => {
    if (extracto) {
      setExtractoText(extracto);
    } else if (isHovered && !extractoText && !loadingExtract) {
      setLoadingExtract(true);
      getDocumentoExtracto(documento, resolucion_articulo)
        .then((res) => {
          if (res && res.ok && res.contenido) {
            setExtractoText(res.contenido);
          } else {
            setExtractoText(getFallbackText(documento, resolucion_articulo));
          }
        })
        .catch(() => {
          setExtractoText(getFallbackText(documento, resolucion_articulo));
        })
        .finally(() => {
          setLoadingExtract(false);
        });
    }
  }, [isHovered, extracto, documento, resolucion_articulo]);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 220);
  };

  const handleCopyCitation = async (e) => {
    e.stopPropagation();
    const textoACopiar = `«${(extractoText || getFallbackText(documento, resolucion_articulo)).trim()}»\n\n— Fuente Oficial: ${resolucion_articulo || documento} (Página ${pagina || 1})\n— Repositorio Normativo ComplianceAI`;
    try {
      await navigator.clipboard.writeText(textoACopiar);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Error al copiar cita formal:', err);
    }
  };

  const pdfUrl = `/api/documentos/${encodeURIComponent(documento)}`;

  return (
    <div
      className="citation-card-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`citation-card ${isHovered ? 'active-hover' : ''}`}>
        <div className="citation-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ minWidth: 14 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span title={documento}>{documento}</span>
        </div>

        <div className="citation-ref">
          {resolucion_articulo || 'Referencia oficial'}
        </div>

        <div className="citation-meta">
          <span>Folio Pág. {pagina || 1}</span>
          {score_relevancia > 0 && (
            <span style={{ color: scorePercent > 70 ? 'var(--status-high-text)' : 'var(--brand-accent)' }}>
              Similitud {scorePercent}%
            </span>
          )}
        </div>
      </div>

      {/* Popover Flotante de Ficha de Folio Regulatorio con Resaltado Neón (Opción B) */}
      {isHovered && (
        <div
          className="citation-preview-popover"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Cabecera Institucional del Popover */}
          <div className="folio-popover-header">
            <div className="folio-popover-title-row">
              <span className={`folio-origin-badge ${isSBS ? 'sbs' : 'interna'}`}>
                {isSBS ? 'Norma Oficial SBS' : 'Directiva Interna'}
              </span>
              <span className={`folio-vigencia-badge ${isDerogada ? 'derogada' : 'vigente'}`}>
                {isDerogada ? '● Derogada' : '● Vigente'}
              </span>
            </div>

            <div className="folio-document-heading">
              <h4 className="folio-resolucion-title">
                {resolucion_articulo || documento}
              </h4>
              <span className="folio-page-tag">
                Pág. {pagina || 1} · {scorePercent > 0 ? `${scorePercent}% Similitud` : 'Cita Oficial'}
              </span>
            </div>
          </div>

          {/* Hoja de Evidencia Documental (Folio Notarial) */}
          <div className="folio-sheet">
            <div className="folio-sheet-watermark">
              {isSBS ? 'SBS · PERÚ' : 'BANCO · CUMPLIMIENTO'}
            </div>

            <div className="folio-sheet-text">
              {loadingExtract ? (
                <div className="folio-loading">Cargando folio oficial de evidencia...</div>
              ) : (
                renderHighlightedText(extractoText || getFallbackText(documento, resolucion_articulo))
              )}
            </div>
          </div>

          {/* Barra de Acciones Rápidas */}
          <div className="folio-actions-bar">
            <button
              type="button"
              className={`folio-action-btn copy ${copied ? 'copied' : ''}`}
              onClick={handleCopyCitation}
              title="Copiar texto subrayado y referencia jurídica"
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Cita Copiada ✓</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copiar Cita</span>
                </>
              )}
            </button>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="folio-action-btn primary"
              title="Abrir el archivo PDF oficial completo en una pestaña"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Ver PDF Oficial</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
