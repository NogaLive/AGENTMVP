import React, { useState, useEffect, useRef } from 'react';
import {
  authStorage,
  getProfile,
  listConversations,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);

  // Almacén de caché en memoria para carga instantánea a 0 ms
  const chatCache = useRef(new Map());

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
    setIsGenerating(false);
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
    setIsGenerating(true);

    try {
      const response = await sendChatMessage(queryText, activeConversationId);

      if (response.ok && response.data) {
        const convId = activeConversationId || response.conversacion_id;
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
        setMessages(updatedHistory);

        // Actualizar caché en memoria de inmediato para este chat
        if (convId) {
          chatCache.current.set(convId, updatedHistory);
        }

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
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
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

