import React, { useState, useEffect, useRef } from 'react';
import {
  listRepositoryDocuments,
  uploadRepositoryDocument,
  deleteRepositoryDocument,
  updateRepositoryDocument,
} from '../services/api';

export default function DocumentRepositoryManager({ onBackToChat }) {
  // Sección activa: 'sbs' (Normativa Oficial SBS) o 'politicas' (Políticas y Manuales Internos)
  const [activeSection, setActiveSection] = useState('sbs');

  const [docsSBS, setDocsSBS] = useState([]);
  const [docsPoliticas, setDocsPoliticas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: '' }
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);

  // Referencia al selector de archivos nativo
  const fileInputRef = useRef(null);

  // Cargar lista de documentos desde el backend
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const data = await listRepositoryDocuments();
      if (data && data.ok) {
        setDocsSBS(data.sbs || []);
        setDocsPoliticas(data.politicas || []);
      }
    } catch (err) {
      console.error('Error al cargar repositorio:', err);
      setFeedback({
        type: 'error',
        message: 'No fue posible cargar el listado de documentos del repositorio.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Limpiar feedback automáticamente después de 4 segundos
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Manejador de subida de archivo
  const handleUploadFile = async (file) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFeedback({
        type: 'error',
        message: 'Formato no admitido. Por favor selecciona un archivo PDF oficial (.pdf).',
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgressText(
        `Subiendo "${file.name}" y vectorizando en Supabase pgvector...`
      );

      const res = await uploadRepositoryDocument(file, activeSection);
      if (res && res.ok) {
        setFeedback({
          type: 'success',
          message: `Documento "${file.name}" cargado, dividido en fragmentos y vectorizado exitosamente.`,
        });
        await fetchDocuments();
      } else {
        throw new Error(res.error || 'Error en la vectorización del documento.');
      }
    } catch (err) {
      console.error('Error al subir documento:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Ocurrió un error al cargar el archivo PDF.',
      });
    } finally {
      setUploading(false);
      setUploadProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleDelete = async (doc) => {
    const confirmacion = window.confirm(
      `¿Deseas eliminar el documento "${doc.nombre}" del repositorio oficial y desindexar sus fragmentos en Supabase pgvector?`
    );
    if (!confirmacion) return;

    try {
      await deleteRepositoryDocument(doc.carpeta, doc.nombre);
      setFeedback({
        type: 'success',
        message: `El documento "${doc.nombre}" fue eliminado del repositorio.`,
      });
      await fetchDocuments();
    } catch (err) {
      console.error('Error al eliminar:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'No fue posible eliminar el archivo.',
      });
    }
  };

  // Alternar vigencia rápida directamente desde la tarjeta
  const handleToggleVigencia = async (doc) => {
    const nuevoEstado = !doc.vigente;
    const anteriorSBS = [...docsSBS];
    const anteriorPoliticas = [...docsPoliticas];

    // Actualización optimista local
    const actualizarLista = (lista) =>
      lista.map((d) => (d.nombre === doc.nombre ? { ...d, vigente: nuevoEstado } : d));

    if (doc.carpeta === 'sbs') setDocsSBS(actualizarLista);
    else setDocsPoliticas(actualizarLista);

    try {
      await updateRepositoryDocument(doc.carpeta, doc.nombre, { vigente: nuevoEstado });
      setFeedback({
        type: 'success',
        message: `Estado de "${doc.nombre}" actualizado a ${nuevoEstado ? 'Vigente' : 'Derogada'}.`,
      });
    } catch (err) {
      console.error('Error al actualizar vigencia:', err);
      // Revertir en caso de falla
      setDocsSBS(anteriorSBS);
      setDocsPoliticas(anteriorPoliticas);
      setFeedback({
        type: 'error',
        message: err.message || 'No se pudo actualizar el estado de vigencia.',
      });
    }
  };

  // Guardar edición de atributos oficiales desde el modal
  const handleSaveAttributes = async (updatedData) => {
    if (!editingDoc) return;
    try {
      setSavingDoc(true);
      await updateRepositoryDocument(editingDoc.carpeta, editingDoc.nombre, updatedData);

      const actualizarLista = (lista) =>
        lista.map((d) => (d.nombre === editingDoc.nombre ? { ...d, ...updatedData } : d));

      if (editingDoc.carpeta === 'sbs') setDocsSBS(actualizarLista);
      else setDocsPoliticas(actualizarLista);

      setFeedback({
        type: 'success',
        message: `Atributos oficiales de "${editingDoc.nombre}" actualizados exitosamente en Supabase.`,
      });
      setEditingDoc(null);
    } catch (err) {
      console.error('Error al guardar atributos:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'No fue posible guardar los atributos del documento.',
      });
    } finally {
      setSavingDoc(false);
    }
  };

  // Documentos activos según la sección seleccionada
  const activeDocs = activeSection === 'sbs' ? docsSBS : docsPoliticas;
  const currentFolderName = activeSection === 'sbs' ? 'documentos_sbs' : 'documentos_politicas';

  return (
    <div className="document-repository-container">
      {/* Cabecera Principal del Gestor */}
      <div className="repo-header-card">
        <div className="repo-header-left">
          <div className="repo-header-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="repo-header-info">
            <h2 className="repo-header-title">Repositorio Documental y Marco Normativo</h2>
            <p className="repo-header-subtitle">
              Administración de fuentes oficiales. Los archivos PDF cargados se procesan y vectorizan automáticamente en Supabase para el razonamiento del agente.
            </p>
          </div>
        </div>

        {onBackToChat && (
          <button
            type="button"
            className="repo-back-btn"
            onClick={onBackToChat}
            title="Regresar a la consulta de chat"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Volver al Chat</span>
          </button>
        )}
      </div>

      {/* Notificación de feedback (éxito o error) */}
      {feedback && (
        <div className={`repo-feedback-toast ${feedback.type}`}>
          <div className="feedback-content">
            {feedback.type === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Interruptor / Toggle de 2 Secciones con Nombres Naturales */}
      <div className="repo-toggle-wrapper">
        <div className="repo-segmented-toggle">
          {/* Opción 1: Normativa Oficial SBS */}
          <button
            type="button"
            className={`repo-toggle-btn ${activeSection === 'sbs' ? 'active' : ''}`}
            onClick={() => setActiveSection('sbs')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="toggle-label">Normativa Oficial SBS</span>
            <span className="toggle-count-pill">{docsSBS.length}</span>
          </button>

          {/* Opción 2: Políticas y Manuales Internos */}
          <button
            type="button"
            className={`repo-toggle-btn ${activeSection === 'politicas' ? 'active' : ''}`}
            onClick={() => setActiveSection('politicas')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="toggle-label">Políticas y Manuales Internos</span>
            <span className="toggle-count-pill">{docsPoliticas.length}</span>
          </button>
        </div>

        <div className="repo-folder-indicator">
          <span>Carpeta en servidor:</span>
          <code>{currentFolderName}/</code>
        </div>
      </div>

      {/* Input de archivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Cuadrícula de Slots (3 columnas amplias, diseño minimalista) */}
      <div className="document-slots-grid">
        {/* Renderizado de los slots con contenido existentes */}
        {activeDocs.map((doc) => {
          const cleanTitle = doc.resolucion_articulo || doc.nombre.replace(/\.pdf$/i, '').replace(/_/g, ' ');

          return (
            <div key={doc.nombre} className="document-slot-card">
              {/* Fila Superior: Ícono sutil + Estado de Vigencia + Botón Eliminar */}
              <div className="slot-card-top">
                <div className="slot-doc-icon-box">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>

                <div className="slot-top-actions">
                  <button
                    type="button"
                    className={`slot-status-dot interactive ${doc.vigente ? 'vigente' : 'derogada'}`}
                    onClick={() => handleToggleVigencia(doc)}
                    title={`Clic para alternar vigencia a ${doc.vigente ? 'Derogada' : 'Vigente'}`}
                    aria-label="Alternar vigencia del documento"
                  >
                    <span className="dot-indicator" />
                    {doc.vigente ? 'Vigente' : 'Derogada'}
                  </button>

                  <button
                    type="button"
                    className="slot-edit-btn"
                    onClick={() => setEditingDoc(doc)}
                    title={`Editar metadatos oficiales de ${doc.nombre}`}
                    aria-label="Editar metadatos"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="slot-delete-btn"
                    onClick={() => handleDelete(doc)}
                    title={`Eliminar ${doc.nombre}`}
                    aria-label="Eliminar documento"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Bloque Central: Título principal y Nombre de Archivo con Truncamiento Seguro */}
              <div className="slot-card-middle">
                <h3 className="slot-title" title={cleanTitle}>
                  {cleanTitle}
                </h3>
                <span className="slot-filename-sub" title={doc.nombre}>
                  {doc.nombre}
                </span>
              </div>

              {/* Fila Inferior: Metadatos Limpios + Enlace de Visualización */}
              <div className="slot-card-bottom">
                <div className="slot-meta-clean">
                  <span>{doc.paginas || 1} {doc.paginas === 1 ? 'pág.' : 'págs.'}</span>
                  <span className="meta-separator">·</span>
                  <span>{doc.tamano_formateado}</span>
                </div>

                <a
                  href={`/api/documentos/${encodeURIComponent(doc.nombre)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="slot-open-link"
                  title="Abrir PDF oficial en nueva pestaña"
                >
                  <span>Ver PDF</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          );
        })}

        {/* SLOT EMPTY GENERADO AL LADO DEL ÚLTIMO SLOT CON CONTENIDO */}
        <div
          className={`document-slot-empty ${isDragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
          onClick={() => !uploading && fileInputRef.current && fileInputRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          title="Haz clic o arrastra un archivo PDF aquí para agregarlo al sistema"
        >
          {uploading ? (
            <div className="slot-empty-uploading">
              <div className="slot-upload-spinner" />
              <div className="slot-upload-status-text">Vectorizando documento...</div>
              <div className="slot-upload-subtext">{uploadProgressText}</div>
            </div>
          ) : (
            <div className="slot-empty-content">
              <div className="slot-empty-icon-circle">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>

              <div className="slot-empty-title">Cargar Documento PDF</div>
              <div className="slot-empty-desc">
                Haz clic para examinar o arrastra el archivo aquí
              </div>

              <div className="slot-empty-target-clean">
                <span>Destino: </span>
                <strong>{activeSection === 'sbs' ? 'Normativa SBS' : 'Políticas Internas'}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Minimalista de Edición de Atributos Oficiales */}
      {editingDoc && (
        <EditDocumentModal
          doc={editingDoc}
          onSave={handleSaveAttributes}
          onClose={() => !savingDoc && setEditingDoc(null)}
          saving={savingDoc}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente Minimalista: Modal de Edición de Metadatos del Documento
// ---------------------------------------------------------------------------
function EditDocumentModal({ doc, onSave, onClose, saving }) {
  const [resolucion, setResolucion] = useState(doc.resolucion_articulo || '');
  const [areaNormativa, setAreaNormativa] = useState(doc.area_normativa || 'prevencion_lavado_activos');
  const [vigente, setVigente] = useState(Boolean(doc.vigente));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      resolucion_articulo: resolucion.trim(),
      area_normativa: areaNormativa,
      vigente: vigente,
    });
  };

  return (
    <div className="doc-modal-backdrop" onClick={onClose}>
      <div className="doc-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="doc-modal-header">
          <div className="doc-modal-header-info">
            <h3 className="doc-modal-title">Metadatos del Documento</h3>
            <p className="doc-modal-filename" title={doc.nombre}>
              {doc.nombre}
            </p>
          </div>
          <button
            type="button"
            className="doc-modal-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="doc-modal-form">
          <div className="doc-form-group">
            <label className="doc-form-label">Título o Resolución Oficial</label>
            <input
              type="text"
              className="doc-form-input"
              value={resolucion}
              onChange={(e) => setResolucion(e.target.value)}
              placeholder="Ej. Res. SBS N° 2660-2015 o Manual PLAFT"
              required
            />
            <span className="doc-form-hint">
              Identificador formal citado por el asistente RAG en las respuestas regulatorias.
            </span>
          </div>

          <div className="doc-form-group">
            <label className="doc-form-label">Área Normativa Regulatoria</label>
            <select
              className="doc-form-select"
              value={areaNormativa}
              onChange={(e) => setAreaNormativa(e.target.value)}
            >
              <option value="prevencion_lavado_activos">
                Prevención de Lavado de Activos y Financiamiento del Terrorismo (PLAFT)
              </option>
              <option value="conducta_mercado">
                Conducta de Mercado y Transparencia
              </option>
              <option value="seguridad_informacion">
                Seguridad de la Información y Ciberseguridad
              </option>
              <option value="gestion_crediticia">
                Gestión de Riesgo Crediticio e Integral
              </option>
            </select>
            <span className="doc-form-hint">
              Clasificación regulatoria para indexación y filtrado en auditorías.
            </span>
          </div>

          <div className="doc-form-group">
            <label className="doc-form-label">Condición de Vigencia</label>
            <div className="doc-vigencia-toggle-group">
              <button
                type="button"
                className={`doc-vigencia-choice ${vigente ? 'active-vigente' : ''}`}
                onClick={() => setVigente(true)}
              >
                <span className="choice-dot green" />
                <span>Vigente</span>
              </button>
              <button
                type="button"
                className={`doc-vigencia-choice ${!vigente ? 'active-derogada' : ''}`}
                onClick={() => setVigente(false)}
              >
                <span className="choice-dot red" />
                <span>Derogada / Revocada</span>
              </button>
            </div>
            <span className="doc-form-hint">
              {vigente
                ? 'Norma de cumplimiento activo y obligatorio para la institución.'
                : 'El agente advertirá visualmente que la norma ha sido sustituida o revocada.'}
            </span>
          </div>

          <div className="doc-modal-actions">
            <button
              type="button"
              className="doc-btn-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="doc-btn-save"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar Atributos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

