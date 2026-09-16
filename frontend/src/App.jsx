import React, { useState, useEffect, useRef } from 'react';
import {
  authStorage,
  getProfile,
  listConversations,
  createConversation,
  getConversationDetail,
  removeConversation,
  sendChatMessage,
  getSharedConversation,
  updateConversationTitle,
} from './services/api';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthView from './components/AuthView';
import DocumentRepositoryManager from './components/DocumentRepositoryManager';

const THEME_KEY = 'sbs_plaft_theme';

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'light';
  });

  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'documents'
  const [user, setUser] = useState(authStorage.getUser());
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);

  // Estados de vista compartida cifrada (solo lectura)
  const [isReadOnlyShare, setIsReadOnlyShare] = useState(false);
  const [sharedConversation, setSharedConversation] = useState(null);

  // Separación de estados para evitar mezclar chats
  const [generatingChatIds, setGeneratingChatIds] = useState(() => new Set());
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);

  // Almacén de caché en memoria para carga instantánea a 0 ms
  const chatCache = useRef(new Map());

  // Indicador reactivo de generación para el chat actualmente activo
  const isGenerating = Boolean(
    activeConversationId
      ? generatingChatIds.has(activeConversationId)
      : Array.from(generatingChatIds).some((id) => id.startsWith('temp-'))
  );

  // 1. Efecto para aplicar tema en el documento HTML
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // 2. Detección de enlace público compartido (?share=token)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share');
    if (token) {
      setIsReadOnlyShare(true);
      setIsSwitchingChat(true);
      getSharedConversation(token)
        .then((detail) => {
          setSharedConversation(detail.conversacion);
          setMessages(detail.mensajes || []);
          setActiveConversationId(detail.conversacion.id);
        })
        .catch((err) => {
          console.error('Error al cargar conversación compartida:', err);
          alert('El enlace de la conversación compartida no es válido o ha expirado.');
          setIsReadOnlyShare(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => {
          setIsSwitchingChat(false);
        });
    }
  }, []);

  // 3. Inicialización: Validar token del analista si no está en modo share
  useEffect(() => {
    if (authStorage.getToken()) {
      getProfile()
        .then((userData) => {
          setUser(userData);
          authStorage.setUser(userData);
          loadConversations();
        })
        .catch(() => {
          authStorage.clear();
          setUser(null);
        });
    }
  }, []);

  // 4. Cargar lista de conversaciones privadas del analista
  const loadConversations = async () => {
    try {
      const list = await listConversations();
      setConversations(list || []);
    } catch (err) {
      console.error('Error al cargar conversaciones:', err);
    }
  };

  // 5. Seleccionar conversación (Carga Instantánea a 0 ms con Caché)
  const handleSelectConversation = async (convId) => {
    if (isReadOnlyShare) {
      handleExitShare();
    }

    setActiveView('chat');
    if (convId === activeConversationId) return;

    setActiveConversationId(convId);

    // Si ya existe en la caché local: CARGA INSTANTÁNEA (0 ms, sin spinners)
    if (chatCache.current.has(convId)) {
      setMessages(chatCache.current.get(convId));
      setIsSwitchingChat(false);
      return;
    }

    // Si es la primera vez que se consulta: cargar desde API y almacenar en memoria
    setIsSwitchingChat(true);
    setMessages([]);

    try {
      const detail = await getConversationDetail(convId);
      const msgs = detail.mensajes || [];
      chatCache.current.set(convId, msgs);
      setMessages(msgs);
    } catch (err) {
      console.error('Error al cargar detalle de conversación:', err);
      alert('No fue posible cargar el historial de la conversación seleccionada.');
    } finally {
      setIsSwitchingChat(false);
    }
  };

  // 6. Iniciar nueva consulta (Lienzo en blanco independiente)
  const handleNewChat = () => {
    if (isReadOnlyShare) {
      handleExitShare();
      return;
    }
    setActiveView('chat');
    setActiveConversationId(null);
    setMessages([]);
    setIsSwitchingChat(false);
  };

  // 7. Salir del modo compartido
  const handleExitShare = () => {
    setIsReadOnlyShare(false);
    setSharedConversation(null);
    setMessages([]);
    setActiveConversationId(null);
    window.history.replaceState({}, document.title, window.location.pathname);
    if (user) {
      loadConversations();
    }
  };

  // 8. Eliminar conversación
  const handleDeleteConversation = async (convId) => {
    try {
      await removeConversation(convId);
      chatCache.current.delete(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        handleNewChat();
      }
    } catch (err) {
      alert(err.message || 'Error al eliminar la consulta.');
    }
  };

  // 9. Renombrar conversación
  const handleRenameConversation = async (convId, nuevoTitulo) => {
    if (!convId || !nuevoTitulo.trim()) return;
    const cleanTitle = nuevoTitulo.trim();
    try {
      await updateConversationTitle(convId, cleanTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, titulo: cleanTitle } : c))
      );
      if (sharedConversation && sharedConversation.id === convId) {
        setSharedConversation((prev) => ({ ...prev, titulo: cleanTitle }));
      }
    } catch (err) {
      console.error('Error al renombrar conversación:', err);
      alert(err.message || 'No fue posible actualizar el título.');
    }
  };

  // 9. Enviar consulta regulatoria al agente
  const handleSendMessage = async (queryText) => {
    if (!user) return;
    if (isReadOnlyShare) return;

    // Turno optimista de usuario
    const userMsg = {
      rol: 'user',
      contenido: queryText,
      creado_en: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    let targetConvId = activeConversationId;
    const tempTrackId = `temp-${Date.now()}`;

    // Si es una consulta nueva (sin ID previo), crear de inmediato en BD y Sidebar
    if (!targetConvId) {
      setGeneratingChatIds((prev) => new Set(prev).add(tempTrackId));

      try {
        const titleSnippet = queryText.trim().slice(0, 100);
        const newConv = await createConversation({
          titulo: titleSnippet,
          primer_mensaje: queryText,
        });

        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);

        // Migrar ID de generación del temporal al definitivo de Supabase
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(tempTrackId);
          next.add(newConv.id);
          return next;
        });

        // Registrar inmediatamente en la lista del Sidebar
        setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);

        // Guardar mensaje optimista en caché del nuevo chat
        chatCache.current.set(newConv.id, nextMessages);
      } catch (errConv) {
        console.error('Error al inicializar conversación en base de datos:', errConv);
        // Continuar como fallback si hubiese un inconveniente puntual
      }
    } else {
      setGeneratingChatIds((prev) => new Set(prev).add(targetConvId));
      chatCache.current.set(targetConvId, nextMessages);
    }

    try {
      const response = await sendChatMessage(queryText, targetConvId);

      if (response.ok && response.data) {
        const finalConvId = targetConvId || response.conversacion_id;
        if (!activeConversationId && response.conversacion_id) {
          setActiveConversationId(response.conversacion_id);
        }

        const assistantMsg = {
          rol: 'assistant',
          contenido: response.data.respuesta,
          fuentes_citadas: response.data.fuentes_citadas || [],
          nivel_confianza: response.data.nivel_confianza || 'NO_CONCLUYENTE',
          outdated_alert: response.data.outdated_alert || false,
          creado_en: new Date().toISOString(),
        };

        const updatedHistory = [...nextMessages, assistantMsg];

        // Actualizar caché en memoria para este chat específico
        if (finalConvId) {
          chatCache.current.set(finalConvId, updatedHistory);
        }

        // Solo actualizar pantalla si el usuario sigue en esta conversación activa
        setActiveConversationId((currentActiveId) => {
          if (currentActiveId === finalConvId || currentActiveId === null) {
            setMessages(updatedHistory);
          }
          return currentActiveId;
        });

        loadConversations();
      } else {
        throw new Error(response.error || 'Respuesta no concluyente del agente.');
      }
    } catch (err) {
      console.error('Fallo en consulta de chat:', err);
      const errorMsg = {
        rol: 'assistant',
        contenido: `⚠️ **Aviso del Sistema:** ${err.message || 'Ocurrió un error al contactar al asistente regulatorio.'}`,
        fuentes_citadas: [],
        nivel_confianza: 'NO_CONCLUYENTE',
        outdated_alert: false,
        creado_en: new Date().toISOString(),
      };

      const historyWithError = [...nextMessages, errorMsg];
      if (targetConvId) {
        chatCache.current.set(targetConvId, historyWithError);
      }

      setActiveConversationId((currentActiveId) => {
        if (currentActiveId === targetConvId || currentActiveId === null) {
          setMessages(historyWithError);
        }
        return currentActiveId;
      });
    } finally {
      if (targetConvId) {
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(targetConvId);
          return next;
        });
      } else {
        setGeneratingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(tempTrackId);
          return next;
        });
      }
    }
  };

  // 10. Control de Sesión
  const handleAuthSuccess = (userData) => {
    setUser(userData);
    loadConversations();
  };

  const handleLogout = () => {
    authStorage.clear();
    chatCache.current.clear();
    setUser(null);
    setConversations([]);
    setMessages([]);
    setActiveConversationId(null);
    setIsReadOnlyShare(false);
    setSharedConversation(null);
    setActiveView('chat');
  };

  // Conversación activa actual
  const activeConversation = isReadOnlyShare
    ? sharedConversation
    : conversations.find((c) => c.id === activeConversationId) ||
      (activeConversationId ? { id: activeConversationId, titulo: 'Expediente Activo' } : null);

  return (
    <div className="app-container">
      {/* Barra Lateral con Historial y Selector de Tema en Footer */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isReadOnlyShare={isReadOnlyShare}
        onExitShare={handleExitShare}
        activeView={activeView}
        onOpenDocumentManager={() => setActiveView('documents')}
      />

      {/* Vista Principal: Lienzo de Chat, Gestor de Documentos o Login Embebido si no está autenticado */}
      {!user && !isReadOnlyShare ? (
        <AuthView onAuthSuccess={handleAuthSuccess} />
      ) : activeView === 'documents' ? (
        <DocumentRepositoryManager
          onBackToChat={() => setActiveView('chat')}
        />
      ) : (
        <ChatArea
          messages={messages}
          isGenerating={isGenerating}
          isSwitchingChat={isSwitchingChat}
          onSendMessage={handleSendMessage}
          activeConversationId={activeConversationId}
          conversation={activeConversation}
          isReadOnlyShare={isReadOnlyShare}
          onRenameConversation={handleRenameConversation}
        />
      )}
    </div>
  );
}

