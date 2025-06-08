import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Główny komponent aplikacji
export default function App() {
  // Stan aplikacji
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState('login');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [sidebarVisible, setSidebarVisible] = useState(true); // Nowy stan dla widoczności sidebara
  
  // Dane formularzy
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });
  const [error, setError] = useState('');
  
  // Stan czatu
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [privateMessages, setPrivateMessages] = useState({});
  const [startedConversations, setStartedConversations] = useState(new Set()); // Nowy stan dla rozpoczętych konwersacji
  const [messageInput, setMessageInput] = useState('');
  const [unreadMessages, setUnreadMessages] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [privateTypingUsers, setPrivingTypingUsers] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState({}); // Nowy stan do śledzenia, czy są starsze wiadomości
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false); // Nowy stan do śledzenia ładowania starszych wiadomości
  
  // Stany dla wątków
  const [showThread, setShowThread] = useState(false);
  const [threadMessage, setThreadMessage] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadInput, setThreadInput] = useState('');
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  
  // WebSocket
  const socketRef = useRef(null);
  const currentTokenRef = useRef(null); // Ref to store the current token for socket re-initialization

  // Modal states
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showOtherUserProfile, setShowOtherUserProfile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showUsersList, setShowUsersList] = useState(false);
  const [newChannelData, setNewChannelData] = useState({
    name: '',
    description: ''
  });

  // Referencje do elementów
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Emojis
  const emojis = ['😀', '😂', '❤️', '👍', '👎', '🎉', '🔥', '💯', '🤔', '😎'];

  // Zastosuj motyw
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Wczytaj rozpoczęte konwersacje z localStorage przy starcie
  useEffect(() => {
    const savedConversations = localStorage.getItem('startedConversations');
    if (savedConversations) {
      setStartedConversations(new Set(JSON.parse(savedConversations)));
    }
    
    // Przywróć aktywną prywatną konwersację
    const savedActivePrivateChat = localStorage.getItem('activePrivateChat');
    if (savedActivePrivateChat) {
      setActivePrivateChat(savedActivePrivateChat);
      setActiveChannel(null); // Upewnij się, że kanał nie jest aktywny
      
      // Dodaj przywróconą konwersację do listy rozpoczętych konwersacji
      setStartedConversations(prev => new Set([...prev, savedActivePrivateChat]));
    }
  }, []);

  // Zapisz rozpoczęte konwersacje do localStorage przy każdej zmianie
  useEffect(() => {
    localStorage.setItem('startedConversations', JSON.stringify([...startedConversations]));
  }, [startedConversations]);

  // Zapisz aktywną prywatną konwersację do localStorage
  useEffect(() => {
    if (activePrivateChat) {
      localStorage.setItem('activePrivateChat', activePrivateChat);
    } else {
      localStorage.removeItem('activePrivateChat');
    }
  }, [activePrivateChat]);

  // Funkcja dodawania konwersacji do listy rozpoczętych
  const addToStartedConversations = (userId) => {
    setStartedConversations(prev => new Set([...prev, userId]));
  };

  // Funkcja do wyświetlania powiadomień lokalnych
  const showLocalNotification = (title, body) => {
    // Sprawdź czy powiadomienia są obsługiwane i dozwolone
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'chat-notification',
          requireInteraction: false,
          silent: false
        });
      } catch (error) {
        console.warn('Błąd wyświetlania powiadomienia:', error);
      }
    } else if ('Notification' in window && Notification.permission === 'default') {
      // Poproś o pozwolenie, jeśli nie zostało jeszcze udzielone
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          showLocalNotification(title, body);
        }
      });
    }
  };

  // Scrolluj do ostatniej wiadomości
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, privateMessages, activeChannel, activePrivateChat]);

  // Sprawdź autoryzację przy starcie
  useEffect(() => {
    const tokenFromLocalStorage = localStorage.getItem('token');
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl);
      currentTokenRef.current = tokenFromUrl; // Store token
      window.history.replaceState({}, document.title, '/');
      fetchUserProfile(tokenFromUrl);
    } else if (tokenFromLocalStorage) {
      currentTokenRef.current = tokenFromLocalStorage; // Store token
      fetchUserProfile(tokenFromLocalStorage);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Pobierz profil użytkownika
  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
        initializeSocket(token);
        fetchChannels(token);
        fetchUsers(token);
        fetchNotifications(token);
        fetchUnreadMessages(token);
        fetchConversations(token); // Pobierz konwersacje z serwera
        
        // Pobierz wiadomości dla przywróconej aktywnej prywatnej konwersacji
        const savedActivePrivateChat = localStorage.getItem('activePrivateChat');
        if (savedActivePrivateChat) {
          fetchPrivateMessages(savedActivePrivateChat);
        }
        
        registerServiceWorker();
      } else {
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Błąd pobierania profilu:', error);
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  };

  // Rejestracja Service Worker dla powiadomień push
  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker zarejestrowany');
        
        // Poproś o pozwolenie na powiadomienia
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          subscribeToPush(registration);
        }
      } catch (error) {
        console.error('Błąd rejestracji Service Worker:', error);
      }
    }
  };

  // Subskrypcja powiadomień push
  const subscribeToPush = async (registration) => {
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY' // Musisz wygenerować klucz VAPID
      });
      
      // Wyślij subskrypcję do serwera
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('subscribePush', subscription);
      }
    } catch (error) {
      console.error('Błąd subskrypcji push:', error);
    }
  };

  // Inicjalizacja WebSocket
  const initializeSocket = (token) => {
    if (!token) {
      console.error("initializeSocket called without a token.");
      return;
    }
    currentTokenRef.current = token;

    if (socketRef.current) {
      socketRef.current.off('disconnect', handleDisconnect);
      socketRef.current.disconnect();
      console.log('Previous socket disconnected.');
      socketRef.current = null;
    }

    const newSocket = io('http://localhost:5000', {
      auth: { token: token },
    });

    console.log('Initializing new socket with ID:', newSocket.id);

    newSocket.on('connect', () => {
      console.log('Połączono z Socket.IO:', newSocket.id);
      
      // Po połączeniu, automatycznie dołącz do wszystkich kanałów użytkownika
      if (channels.length > 0) {
        const channelIds = channels.map(channel => channel._id);
        newSocket.emit('joinChannels', channelIds);
      }
    });

    newSocket.on('privateMessage', (data) => {
      console.log(`Socket [${newSocket.id}] received privateMessage:`, data); // Debug log
      const senderId = data.sender._id;
      const receiverId = data.receiver._id;
      
      // Pobierz aktualnego użytkownika z state lub z localStorage
      let currentUserId = user?._id;
      if (!currentUserId) {
        // Fallback - spróbuj pobrać z localStorage token i zdekodować
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUserId = payload.id || payload.userId;
          } catch (error) {
            console.warn('Nie można zdekodować tokenu:', error);
          }
        }
      }
      
      if (!currentUserId) {
        console.warn('Nie można określić ID aktualnego użytkownika');
        return;
      }
      
      // Określ ID rozmówcy
      const conversationPartnerId = senderId === currentUserId ? receiverId : senderId;
      
      // Automatycznie dodaj rozmówcę do rozpoczętych konwersacji
      addToStartedConversations(conversationPartnerId);
      
      setPrivateMessages(prev => {
        const senderMessages = prev[senderId] || [];
        const receiverMessages = prev[receiverId] || [];
        
        // Sprawdź, czy wiadomość nie została już dodana (opcja, aby uniknąć duplikatów w przypadku ponownego odbioru tej samej wiadomości)
        if (senderMessages.some(msg => msg._id === data._id) || receiverMessages.some(msg => msg._id === data._id)) {
          console.warn(`Socket [${newSocket.id}] Duplicate privateMessage prevented for msg ID: ${data._id}`);
          return prev; // Nie dodawaj, jeśli już istnieje
        }
        
        return {
          ...prev,
          [conversationPartnerId]: [...(prev[conversationPartnerId] || []), data]
        };
      });

      // Aktualizuj nieprzeczytane wiadomości tylko jeśli to nie nasza wiadomość i nie jesteśmy w tej konwersacji
      if (activePrivateChat !== conversationPartnerId && currentUserId && senderId !== currentUserId) {
        setUnreadMessages(prev => ({
          ...prev,
          [conversationPartnerId]: (prev[conversationPartnerId] || 0) + 1
        }));
        
        // Pokaż powiadomienie
        showLocalNotification(`Nowa wiadomość od ${data.sender.username}`, data.content);
      }
    });

    newSocket.on('newMessage', (data) => {
      console.log(`Socket [${newSocket.id}] received newMessage:`, data); // Debug log
      setMessages(prev => {
        const currentMessages = prev[data.channel] || [];
        // Sprawdź czy wiadomość już istnieje
        if (currentMessages.some(msg => msg._id === data._id)) {
          console.warn(`Socket [${newSocket.id}] Duplicate newMessage prevented for msg ID: ${data._id}`);
          return prev;
        }
        return {
          ...prev,
          [data.channel]: [...currentMessages, data]
        };
      });

      // Pokaż powiadomienie jeśli użytkownik nie jest w aktywnym kanale
      if ((!activeChannel || activeChannel._id !== data.channel) && user && data.sender._id !== user._id) {
        const channel = channels.find(ch => ch._id === data.channel);
        showLocalNotification(`Nowa wiadomość w #${channel?.name}`, `${data.sender.username}: ${data.content}`);
      }
    });

    newSocket.on('newChannel', (data) => {
      console.log('Otrzymano nowy kanał:', data.channel);
      setChannels(prev => {
        if (prev.find(ch => ch._id === data.channel._id)) {
          return prev;
        }
        // Automatycznie dołącz do nowego kanału
        newSocket.emit('joinChannel', data.channel._id);
        return [...prev, data.channel];
      });
    });

    newSocket.on('userStatusUpdate', (data) => {
      updateUserStatus(data.userId, data.isOnline);
    });

    newSocket.on('userTyping', (data) => {
      setTypingUsers(prev => ({
        ...prev,
        [data.channelId]: {
          ...(prev[data.channelId] || {}),
          [data.userId]: data.isTyping ? data.username : undefined
        }
      }));

      // Usuń po 3 sekundach jeśli użytkownik przestał pisać
      if (data.isTyping) {
        setTimeout(() => {
          setTypingUsers(prev => ({
            ...prev,
            [data.channelId]: {
              ...(prev[data.channelId] || {}),
              [data.userId]: undefined
            }
          }));
        }, 3000);
      }
    });

    newSocket.on('userPrivateTyping', (data) => {
      setPrivingTypingUsers(prev => ({
        ...prev,
        [data.userId]: data.isTyping
      }));

      // Usuń po 3 sekundach
      if (data.isTyping) {
        setTimeout(() => {
          setPrivingTypingUsers(prev => ({
            ...prev,
            [data.userId]: false
          }));
        }, 3000);
      }
    });

    newSocket.on('reactionAdded', (data) => {
      updateMessageReaction(data.messageId, data.emoji, data.userId);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Błąd Socket.IO Connection:', error);
    });

    newSocket.on('disconnect', handleDisconnect);

    // Nowa obsługa odpowiedzi w wątku
    newSocket.on('threadReply', (data) => {
      console.log(`Socket [${newSocket.id}] received threadReply:`, data);
      // Dodaj odpowiedź do wątku jeśli jest otwarty i dotyczy tej wiadomości
      if (showThread && threadMessage && data.parentMessageId === threadMessage._id) {
        setThreadMessages(prev => [...prev, data]);
      }
      
      // Zaktualizuj liczbę odpowiedzi w głównej wiadomości
      setMessages(prev => {
        const newMessages = { ...prev };
        Object.keys(newMessages).forEach(channelId => {
          newMessages[channelId] = newMessages[channelId].map(msg => 
            msg._id === data.parentMessageId 
              ? { ...msg, threadReplies: (msg.threadReplies || 0) + 1, lastReplyAt: data.createdAt }
              : msg
          );
        });
        return newMessages;
      });
    });

    newSocket.on('privateThreadReply', (data) => {
      console.log(`Socket [${newSocket.id}] received privateThreadReply:`, data);
      // Dodaj odpowiedź do wątku jeśli jest otwarty i dotyczy tej wiadomości
      if (showThread && threadMessage && data.parentMessageId === threadMessage._id) {
        setThreadMessages(prev => [...prev, data]);
      }
      
      // Zaktualizuj liczbę odpowiedzi w głównej wiadomości prywatnej
      setPrivateMessages(prev => {
        const newMessages = { ...prev };
        Object.keys(newMessages).forEach(userId => {
          newMessages[userId] = newMessages[userId].map(msg => 
            msg._id === data.parentMessageId 
              ? { ...msg, threadReplies: (msg.threadReplies || 0) + 1, lastReplyAt: data.createdAt }
              : msg
          );
        });
        return newMessages;
      });
    });

    socketRef.current = newSocket;
  };
  
  const handleDisconnect = () => {
    console.log('Socket disconnected. ID was:', socketRef.current ? socketRef.current.id : 'N/A');

    setTimeout(() => {
      if (isAuthenticated && currentTokenRef.current) {
        console.log("Attempting to re-initialize socket after disconnect...");
        initializeSocket(currentTokenRef.current);
      } else {
        console.log("Not re-initializing socket: not authenticated or no token.");
      }
    }, 5000);
  };

  // Aktualizuj status użytkownika
  const updateUserStatus = (userId, isOnline) => {
    setUsers(prev => prev.map(user => 
      user._id === userId ? { ...user, isOnline } : user
    ));
  };

  // Dodaj reakcję
  const addReaction = (messageId, emoji) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('addReaction', {
        messageId,
        emoji,
        channelId: activeChannel?._id,
        privateUserId: activePrivateChat
      });
    }
  };

  // Aktualizuj reakcję na wiadomość
  const updateMessageReaction = (messageId, emoji, reactionUserId) => {
    // Aktualizuj w wiadomościach kanałowych
    setMessages(prev => {
      const newMessages = { ...prev };
      Object.keys(newMessages).forEach(channelId => {
        newMessages[channelId] = newMessages[channelId].map(msg => {
          if (msg._id === messageId) {
            const reactions = msg.reactions || [];
            const existingReaction = reactions.find(r => r.emoji === emoji);
            if (existingReaction) {
              if (!existingReaction.users.includes(reactionUserId)) {
                existingReaction.users.push(reactionUserId);
              }
            } else {
              reactions.push({ emoji, users: [reactionUserId] });
            }
            return { ...msg, reactions };
          }
          return msg;
        });
      });
      return newMessages;
    });

    // Aktualizuj w wiadomościach prywatnych
    setPrivateMessages(prev => {
      const newMessages = { ...prev };
      Object.keys(newMessages).forEach(privateUserId => {
        newMessages[privateUserId] = newMessages[privateUserId].map(msg => {
          if (msg._id === messageId) {
            const reactions = msg.reactions || [];
            const existingReaction = reactions.find(r => r.emoji === emoji);
            if (existingReaction) {
              if (!existingReaction.users.includes(reactionUserId)) {
                existingReaction.users.push(reactionUserId);
              }
            } else {
              reactions.push({ emoji, users: [reactionUserId] });
            }
            return { ...msg, reactions };
          }
          return msg;
        });
      });
      return newMessages;
    });
  };

  // Pobierz kanały
  const fetchChannels = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/channels', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const channelsData = await response.json();
        setChannels(channelsData);
        
        // Tylko ustaw domyślny kanał jeśli nie ma ani aktywnego kanału ani aktywnej prywatnej konwersacji
        const savedActivePrivateChat = localStorage.getItem('activePrivateChat');
        if (channelsData.length > 0 && !activeChannel && !activePrivateChat && !savedActivePrivateChat) {
          setActiveChannel(channelsData[0]);
          fetchMessages(channelsData[0]._id);
        }
      }
    } catch (error) {
      console.error('Błąd pobierania kanałów:', error);
    }
  };

  // Pobierz użytkowników
  const fetchUsers = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/users', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const usersData = await response.json();
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Błąd pobierania użytkowników:', error);
    }
  };

  // Pobierz powiadomienia
  const fetchNotifications = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const notificationsData = await response.json();
        setNotifications(notificationsData);
      }
    } catch (error) {
      console.error('Błąd pobierania powiadomień:', error);
    }
  };

  // Pobierz nieprzeczytane wiadomości
  const fetchUnreadMessages = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/messages/unread', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const unreadData = await response.json();
        const unreadMap = {};
        unreadData.forEach(item => {
          unreadMap[item._id] = item.count;
        });
        setUnreadMessages(unreadMap);
      }
    } catch (error) {
      console.error('Błąd pobierania nieprzeczytanych:', error);
    }
  };

  // Pobierz rozpoczęte konwersacje z serwera
  const fetchConversations = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/messages/conversations', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const conversationsData = await response.json();
        // Wyciągnij tylko ID użytkowników z konwersacji
        const conversationIds = conversationsData.map(conv => conv._id);
        setStartedConversations(new Set(conversationIds));
      }
    } catch (error) {
      console.error('Błąd pobierania konwersacji:', error);
    }
  };

  // Pobierz wiadomości z kanału
  const fetchMessages = async (channelId, loadMore = false) => {
    if (isLoadingMoreMessages && loadMore) return; // Zapobiegaj wielokrotnemu ładowaniu
    if (loadMore) setIsLoadingMoreMessages(true);

    try {
      let url = `http://localhost:5000/api/channels/${channelId}/messages`;
      const currentChannelMessages = messages[channelId] || [];
      if (loadMore && currentChannelMessages.length > 0) {
        const oldestMessageTimestamp = currentChannelMessages[0].createdAt;
        url += `?before=${oldestMessageTimestamp}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const messagesData = await response.json();
        setMessages(prev => ({
          ...prev,
          [channelId]: loadMore ? [...messagesData, ...currentChannelMessages] : messagesData
        }));
        setHasMoreMessages(prev => ({ ...prev, [channelId]: messagesData.length === 50 })); // Załóżmy, że limit to 50
      }
    } catch (error) {
      console.error('Błąd pobierania wiadomości:', error);
    } finally {
      if (loadMore) setIsLoadingMoreMessages(false);
    }
  };

  // Pobierz wiadomości prywatne
  const fetchPrivateMessages = async (userId, loadMore = false) => {
    if (isLoadingMoreMessages && loadMore) return;
    if (loadMore) setIsLoadingMoreMessages(true);

    try {
      let url = `http://localhost:5000/api/messages/private/${userId}`;
      const currentPrivateChatMessages = privateMessages[userId] || [];
      if (loadMore && currentPrivateChatMessages.length > 0) {
        const oldestMessageTimestamp = currentPrivateChatMessages[0].createdAt;
        url += `?before=${oldestMessageTimestamp}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const messagesData = await response.json();
        setPrivateMessages(prev => ({
          ...prev,
          [userId]: loadMore ? [...messagesData, ...currentPrivateChatMessages] : messagesData
        }));
        setHasMoreMessages(prev => ({ ...prev, [userId]: messagesData.length === 50 })); // Załóżmy, że limit to 50
        // Usuń licznik nieprzeczytanych tylko przy pierwszym ładowaniu
        if (!loadMore) {
          setUnreadMessages(prevUnread => {
            const newUnread = { ...prevUnread };
            delete newUnread[userId];
            return newUnread;
          });
        }
      }
    } catch (error) {
      console.error('Błąd pobierania wiadomości prywatnych:', error);
    } finally {
      if (loadMore) setIsLoadingMoreMessages(false);
    }
  };

  // Oznacz powiadomienia jako przeczytane
  const markNotificationsAsRead = async () => {
    try {
      await fetch('http://localhost:5000/api/notifications/read', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Błąd oznaczania powiadomień:', error);
    }
  };

  // Obsługa formularza logowania/rejestracji
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const endpoint = currentView === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = currentView === 'login' 
      ? { email: formData.email, password: formData.password }
      : formData;
    
    try {
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        initializeSocket(data.token);
        fetchChannels(data.token);
        fetchUsers(data.token);
        fetchNotifications(data.token);
        fetchUnreadMessages(data.token);
        registerServiceWorker();
      } else {
        setError(data.message || 'Wystąpił błąd');
      }
    } catch (error) {
      setError('Błąd połączenia z serwerem');
    }
  };

  // Logowanie przez Google
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  // Wylogowanie
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('startedConversations'); // Wyczyść zapisane konwersacje
    localStorage.removeItem('activePrivateChat'); // Wyczyść aktywną prywatną konwersację
    currentTokenRef.current = null;

    if (socketRef.current) {
      socketRef.current.off('disconnect', handleDisconnect); 
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('Socket disconnected on logout.');
    }
    setUser(null);
    setIsAuthenticated(false);
    setChannels([]);
    setUsers([]);
    setMessages({});
    setPrivateMessages({});
    setStartedConversations(new Set()); // Wyczyść stan rozpoczętych konwersacji
    setActiveChannel(null);
    setActivePrivateChat(null);
    setNotifications([]);
    setUnreadMessages({});
  };

  // Wysyłanie wiadomości
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    
    try {
      if (activePrivateChat) {
        // Wyślij wiadomość prywatną
        const response = await fetch(`http://localhost:5000/api/messages/private/${activePrivateChat}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            content: messageInput,
            type: 'text'
          })
        });
        
        if (response.ok) {
          setMessageInput('');
        }
      } else if (activeChannel) {
        // Wyślij wiadomość do kanału
        const response = await fetch(`http://localhost:5000/api/channels/${activeChannel._id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            content: messageInput,
            type: 'text'
          })
        });
        
        if (response.ok) {
          setMessageInput('');
        }
      }
    } catch (error) {
      console.error('Błąd wysyłania wiadomości:', error);
    }
  };

  // Upload pliku
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', file.type.startsWith('image/') ? 'image' : 'file');
    
    try {
      let url;
      if (activePrivateChat) {
        url = `http://localhost:5000/api/messages/private/${activePrivateChat}`;
      } else if (activeChannel) {
        url = `http://localhost:5000/api/channels/${activeChannel._id}/messages`;
      } else {
        return;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      fileInputRef.current.value = '';
    } catch (error) {
      console.error('Błąd uploadu pliku:', error);
    }
  };

  // Obsługa pisania
  const handleTyping = (isTyping) => {
    if (socketRef.current && socketRef.current.connected) {
      if (activePrivateChat) {
        socketRef.current.emit('privateTyping', {
          userId: activePrivateChat,
          isTyping
        });
      } else if (activeChannel) {
        socketRef.current.emit('typing', {
          channelId: activeChannel._id,
          isTyping
        });
      }
    }
  };

  // Debounce dla pisania
  const typingTimeout = useRef(null);
  const handleMessageInputChange = (e) => {
    setMessageInput(e.target.value);
    
    // Wyślij info o pisaniu
    handleTyping(true);
    
    // Wyczyść poprzedni timeout
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    
    // Ustaw nowy timeout
    typingTimeout.current = setTimeout(() => {
      handleTyping(false);
    }, 1000);
  };

  // Tworzenie kanału
  const createChannel = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('http://localhost:5000/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newChannelData)
      });
      
      if (response.ok) {
        const newChannel = await response.json();
        setChannels([...channels, newChannel]);
        setShowCreateChannel(false);
        setNewChannelData({ name: '', description: '' });
        setActiveChannel(newChannel);
        setActivePrivateChat(null);
        fetchMessages(newChannel._id);
        
        // Backend już wysyła powiadomienie przez WebSocket, więc nie trzeba tego robić tutaj
      } else {
        const errorData = await response.json();
        console.error('Błąd tworzenia kanału:', errorData);
        setError(errorData.message || 'Nie udało się utworzyć kanału');
      }
    } catch (error) {
      console.error('Błąd tworzenia kanału:', error);
      setError('Błąd połączenia z serwerem');
    }
  };

  // Otwórz czat prywatny
  const openPrivateChat = (userId) => {
    setActivePrivateChat(userId);
    setActiveChannel(null);
    setShowUsersList(false);
    
    // Dodaj do listy rozpoczętych konwersacji
    addToStartedConversations(userId);
    
    // Zawsze pobierz historię wiadomości z serwera
    fetchPrivateMessages(userId);
  };

  // Funkcja do otwierania profilu innego użytkownika
  const openUserProfile = (userId) => {
    const userToShow = users.find(u => u._id === userId);
    if (userToShow && userToShow._id !== user._id) {
      setSelectedUser(userToShow);
      setShowOtherUserProfile(true);
    }
  };

  // Renderuj listę użytkowników piszących
  const renderTypingIndicator = () => {
    let typingList = [];
    
    if (activeChannel && typingUsers[activeChannel._id]) {
      typingList = Object.values(typingUsers[activeChannel._id]).filter(Boolean);
    } else if (activePrivateChat && privateTypingUsers[activePrivateChat]) {
      const user = users.find(u => u._id === activePrivateChat);
      if (user) typingList = [user.username];
    }
    
    if (typingList.length === 0) return null;
    
    return (
      <div className="px-6 py-2 text-sm text-gray-500 dark:text-gray-400 italic animate-fadeIn">
        <div className="flex items-center space-x-2">
          <div className="typing-indicator flex space-x-1">
            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
          </div>
          <span>{typingList.join(', ')} pisze...</span>
        </div>
      </div>
    );
  };

  // Pobierz aktualną konwersację
  const getCurrentMessages = () => {
    if (activePrivateChat) {
      return privateMessages[activePrivateChat] || [];
    } else if (activeChannel) {
      return messages[activeChannel._id] || [];
    }
    return [];
  };

  // Funkcje dla wątków
  const openThread = async (message) => {
    setThreadMessage(message);
    setShowThread(true);
    setReplyingToMessage(null);
    
    try {
      const endpoint = message.isPrivate 
        ? `/api/messages/private/${message._id}/thread`
        : `/api/messages/${message._id}/thread`;
        
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const threadData = await response.json();
        setThreadMessages(threadData.threadMessages || []);
      }
    } catch (error) {
      console.error('Błąd pobierania wątku:', error);
    }
  };

  const closeThread = () => {
    setShowThread(false);
    setThreadMessage(null);
    setThreadMessages([]);
    setThreadInput('');
    setReplyingToMessage(null);
  };

  const sendThreadReply = async (e) => {
    e.preventDefault();
    if (!threadInput.trim() || !threadMessage) return;
    
    try {
      // Użyj dedykowanego endpointu dla odpowiedzi w wątku
      let endpoint;
      if (threadMessage.isPrivate) {
        // Dla wiadomości prywatnych - użyj endpointu wątku prywatnego
        const otherUserId = threadMessage.sender._id === user._id ? threadMessage.receiver._id : threadMessage.sender._id;
        endpoint = `/api/messages/private/${otherUserId}/thread`;
      } else {
        // Dla wiadomości kanałowych - użyj endpointu wątku kanału
        endpoint = `/api/messages/${threadMessage._id}/thread/reply`;
      }
        
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          content: threadInput,
          type: 'text',
          parentMessageId: threadMessage._id
        })
      });
      
      if (response.ok) {
        setThreadInput('');
        // Odśwież wątek - pobierz ponownie odpowiedzi
        try {
          const threadEndpoint = threadMessage.isPrivate 
            ? `/api/messages/private/${threadMessage._id}/thread`
            : `/api/messages/${threadMessage._id}/thread`;
            
          const threadResponse = await fetch(`http://localhost:5000${threadEndpoint}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (threadResponse.ok) {
            const threadData = await threadResponse.json();
            setThreadMessages(threadData.threadMessages || []);
          }
        } catch (error) {
          console.error('Błąd odświeżania wątku:', error);
        }
      } else {
        console.error('Błąd wysyłania odpowiedzi w wątku');
      }
    } catch (error) {
      console.error('Błąd wysyłania odpowiedzi w wątku:', error);
    }
  };

  const startReply = (message) => {
    setReplyingToMessage(message);
    setMessageInput(`@${message.sender.username} `);
  };

  // Ekran ładowania
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen animated-gradient">
        <div className="text-center animate-fadeIn">
          <div className="relative">
            <div className="spinner-gradient w-16 h-16 mx-auto mb-4"></div>
            <div className="absolute inset-0 w-16 h-16 mx-auto border-4 border-transparent border-t-white rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2 animate-pulse-slow">Ładowanie ChatApp</h2>
          <p className="text-white opacity-80 animate-fadeIn" style={{ animationDelay: '0.5s' }}>Przygotowujemy wszystko dla Ciebie...</p>
        </div>
      </div>
    );
  }

  // Strona logowania/rejestracji
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen animated-gradient flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md hover-lift animate-fadeIn glass">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center animate-slideInLeft">
            {currentView === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-8 animate-slideInRight">
            {currentView === 'login' ? 'Witaj ponownie!' : 'Dołącz do naszej społeczności'}
          </p>
          
          {error && (
            <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-600 dark:text-red-300 px-4 py-2 rounded-lg mb-4 animate-bounce-gentle">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {currentView === 'register' && (
              <input
                type="text"
                placeholder="Nazwa użytkownika"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all hover-lift animate-fadeIn"
                required
              />
            )}
            
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all hover-lift animate-fadeIn"
              required
            />
            
            <input
              type="password"
              placeholder="Hasło"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all hover-lift animate-fadeIn"
              required
            />
            
            <button
              type="submit"
              className="w-full animated-gradient-purple text-white font-semibold py-3 rounded-lg transition-all duration-200 hover-lift hover-glow animate-fadeIn"
            >
              {currentView === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
            </button>
          </form>
          
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">lub</span>
              </div>
            </div>
            
            <button
              onClick={handleGoogleLogin}
              className="mt-4 w-full bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 border border-gray-300 dark:border-gray-600 hover-lift"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Zaloguj się przez Google</span>
            </button>
          </div>
          
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            {currentView === 'login' ? 'Nie masz konta?' : 'Masz już konto?'}
            <button
              type="button"
              onClick={() => {
                setCurrentView(currentView === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="ml-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold hover-scale transition-all"
            >
              {currentView === 'login' ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Interfejs czatu
  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="flex w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        {/* Sidebar z kanałami */}
        <div className={`${sidebarVisible ? 'w-64' : 'w-0'} transition-all duration-300 bg-gray-50 dark:bg-gray-800 flex flex-col border-r border-gray-200 dark:border-gray-700 animate-slideInLeft overflow-hidden`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="animated-gradient-purple px-3 py-1 rounded-lg">
                <h1 className="text-xl font-bold text-white animate-pulse-slow">ChatApp</h1>
              </div>
              <div className="flex items-center space-x-2">
                {/* Przycisk ukrywania sidebara */}
                <button
                  onClick={() => setSidebarVisible(false)}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover-scale hover-glow"
                  title="Ukryj sidebar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                
                {/* Przycisk przełączania motywu */}
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover-scale hover-glow"
                  title="Przełącz motyw"
                >
                  {theme === 'dark' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>
                
                {/* Przycisk powiadomień */}
                <button
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications) {
                      markNotificationsAsRead();
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 relative hover-scale hover-glow"
                  title="Powiadomienia"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-notificationBounce">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>

                {/* Przycisk wylogowania - mały */}
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 hover:bg-opacity-50 transition-all duration-200 hover-scale hover-glow text-red-600 dark:text-red-400"
                  title="Wyloguj się"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
            
            <button
              onClick={() => setShowUserProfile(true)}
              className="flex items-center space-x-3 w-full hover:bg-gray-200 dark:hover:bg-gray-700 p-3 rounded-xl transition-all duration-200 hover-lift animate-fadeIn group"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center hover-scale transition-transform duration-200 shadow-lg">
                {user?.profilePicture ? (
                  <img src={`http://localhost:5000${user.profilePicture}`} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-white">{user?.username?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{user?.username}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Kliknij aby edytować profil</div>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          {/* Lista kanałów */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">KANAŁY</h2>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 hover-scale hover-glow"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-1 mb-6">
              {channels.map((channel, index) => (
                <button
                  key={channel._id}
                  onClick={() => {
                    setActiveChannel(channel);
                    setActivePrivateChat(null);
                    if (!messages[channel._id]) {
                      fetchMessages(channel._id);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 hover-lift animate-fadeIn ${
                    activeChannel?._id === channel._id
                      ? 'animated-gradient-purple text-white shadow-lg'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <span className="text-gray-500 dark:text-gray-500">#</span> {channel.name}
                </button>
              ))}
            </div>
            
            {/* Wiadomości prywatne */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">WIADOMOŚCI PRYWATNE</h2>
              <button
                onClick={() => setShowUsersList(true)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 hover-scale hover-glow"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-1">
              {users.filter(u => startedConversations.has(u._id)).map((user, index) => (
                <button
                  key={user._id}
                  onClick={() => openPrivateChat(user._id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center justify-between hover-lift animate-fadeIn ${
                    activePrivateChat === user._id
                      ? 'animated-gradient-purple text-white shadow-lg'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full transition-all duration-200 ${user.isOnline ? 'bg-green-500 online-indicator' : 'bg-gray-400'}`}></div>
                    <span>{user.username}</span>
                  </div>
                  {unreadMessages[user._id] > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 animate-notificationBounce">
                      {unreadMessages[user._id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* Footer z przyciskiem wylogowania */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition-all duration-200 hover-lift hover-glow"
            >
              Wyloguj się
            </button>
          </div>
        </div>
        
        {/* Główny obszar czatu */}
        <div className="flex-1 flex flex-col">
          {(activeChannel || activePrivateChat) ? (
            <>
              {/* Header kanału/czatu */}
              <div className="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Przycisk toggle sidebara */}
                  <button
                    onClick={() => setSidebarVisible(!sidebarVisible)}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover-scale"
                    title={sidebarVisible ? "Ukryj sidebar" : "Pokaż sidebar"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button
                  >
                  
                  <div>
                    {activeChannel ? (
                      <>
                        <h2 className="text-xl font-semibold">
                          <span className="text-gray-500">#</span> {activeChannel.name}
                        </h2>
                        {activeChannel.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{activeChannel.description}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${users.find(u => u._id === activePrivateChat)?.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        <h2 className="text-xl font-semibold">
                          {users.find(u => u._id === activePrivateChat)?.username}
                        </h2>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Przycisk zamykania wątku jeśli jest otwarty */}
                {showThread && (
                  <button
                    onClick={closeThread}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                    title="Zamknij wątek"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              <div className="flex flex-1 overflow-hidden">
                {/* Obszar głównych wiadomości */}
                <div className={`${showThread ? 'w-1/2' : 'w-full'} flex flex-col transition-all duration-300`}>
                  {/* Obszar wiadomości */}
                  <div 
                    className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-gray-900"
                    onScroll={(e) => {
                      if (e.currentTarget.scrollTop === 0 && !isLoadingMoreMessages) {
                        if (activeChannel && hasMoreMessages[activeChannel._id]) {
                          fetchMessages(activeChannel._id, true);
                        } else if (activePrivateChat && hasMoreMessages[activePrivateChat]) {
                          fetchPrivateMessages(activePrivateChat, true);
                        }
                      }
                    }}
                  >
                    {isLoadingMoreMessages && (
                      <div className="flex justify-center py-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500"></div>
                      </div>
                    )}
                    {getCurrentMessages().map((message, index) => {
                      const isMyMessage = user && message.sender._id === user._id;
                      return (
                        <div key={message._id} className={`flex transition-all duration-200 group animate-messageSlideIn ${
                          isMyMessage ? 'flex-row-reverse' : ''
                        }`}>
                          {/* Avatar */}
                          <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 animate-fadeIn hover-scale mr-3" style={{ animationDelay: `${index * 0.1}s` }}>
                            {message.sender?.profilePicture ? (
                              <img src={`http://localhost:5000${message.sender.profilePicture}`} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-white font-semibold text-sm">{message.sender?.username?.[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          
                          {/* Kontener wiadomości z akcjami */}
                          <div className={`flex flex-col max-w-xs lg:max-md xl:max-w-lg ${isMyMessage ? 'items-end mr-3' : 'items-start'}`}>
                            {/* Dymek wiadomości */}
                            <div className={`px-4 py-3 rounded-2xl shadow-md hover-scale animate-fadeIn transition-all duration-200 group-hover:shadow-lg ${
                              isMyMessage 
                                ? 'animated-gradient-purple text-white rounded-br-md' 
                                : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md border border-gray-200 dark:border-gray-600'
                            }`} style={{ animationDelay: `${index * 0.1}s` }}>
                              
                              {/* Nazwa użytkownika i timestamp dla wiadomości nie-własnych */}
                              {!isMyMessage && (
                                <div className="flex items-baseline space-x-2 mb-1">
                                  <button 
                                    onClick={() => openUserProfile(message.sender._id)}
                                    className="font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-sm cursor-pointer hover:underline"
                                  >
                                    {message.sender?.username}
                                  </button>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(message.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}
                              
                              {/* Zawartość wiadomości */}
                              {message.type === 'text' ? (
                                <p className={`animate-fadeIn ${isMyMessage ? 'text-white' : 'text-gray-800 dark:text-gray-300'}`}>{message.content}</p>
                              ) : message.type === 'image' ? (
                                <img 
                                  src={`http://localhost:5000${message.fileUrl}`} 
                                  alt="Przesłany obraz" 
                                  className="max-w-full h-auto rounded-lg animate-fadeIn hover-scale cursor-pointer"
                                  onClick={() => window.open(`http://localhost:5000${message.fileUrl}`, '_blank')}
                                />
                              ) : (
                                <a 
                                  href={`http://localhost:5000${message.fileUrl}`} 
                                  download 
                                  className={`flex items-center space-x-2 hover:underline ${isMyMessage ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-sm">{message.fileName}</span>
                                </a>
                              )}
                              
                              {/* Timestamp dla własnych wiadomości */}
                              {isMyMessage && (
                                <div className="text-xs text-white text-opacity-80 mt-1 text-right">
                                  {new Date(message.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                            
                            {/* Reakcje i przyciski akcji pod dymkiem */}
                            <div className={`flex items-center space-x-2 mt-2 flex-wrap gap-1 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                              {/* Reakcje */}
                              {message.reactions && message.reactions.length > 0 && (
                                <>
                                  {message.reactions.map((reaction, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => addReaction(message._id, reaction.emoji)}
                                      className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full text-sm transition-all duration-200 flex items-center space-x-1 min-w-0 reaction-button hover-scale animate-reactionPop shadow-sm"
                                      title={`${reaction.users.length} reakcji`}
                                      style={{ animationDelay: `${idx * 0.1}s` }}
                                    >
                                      <span className="text-base leading-none">{reaction.emoji}</span>
                                      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{reaction.users.length}</span>
                                    </button>
                                  ))}
                                </>
                              )}
                              
                              {/* Przyciski akcji */}
                              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                {/* Przycisk odpowiedzi w wątku */}
                                <button
                                  onClick={() => openThread(message)}
                                  className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full text-sm transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover-scale hover-glow shadow-sm flex items-center space-x-1"
                                  title="Odpowiedz w wątku"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                  {message.threadReplies > 0 && (
                                    <span className="text-xs">{message.threadReplies}</span>
                                  )}
                                </button>
                                
                                {/* Przycisk szybkiej odpowiedzi */}
                                <button
                                  onClick={() => startReply(message)}
                                  className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full text-sm transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover-scale hover-glow shadow-sm"
                                  title="Odpowiedz"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                </button>
                                
                                {/* Przycisk dodawania reakcji */}
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => setShowEmojiPicker(showEmojiPicker === message._id ? null : message._id)}
                                    className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full text-sm transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover-scale hover-glow shadow-sm"
                                    title="Dodaj reakcję"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </button>
                                  
                                  {/* Picker emoji */}
                                  {showEmojiPicker === message._id && (
                                    <div className={`absolute top-full mt-2 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-2 grid grid-cols-5 gap-1 z-50 min-w-max animate-emojiPickerSlide glass ${
                                      isMyMessage ? 'right-0' : 'left-0'
                                    }`}>
                                      {emojis.map((emoji, emojiIdx) => (
                                        <button
                                          key={emoji}
                                          onClick={() => {
                                            addReaction(message._id, emoji);
                                            setShowEmojiPicker(null);
                                          }}
                                          className="hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded transition-all duration-200 text-lg leading-none w-10 h-10 flex items-center justify-center hover-scale animate-fadeIn"
                                          title={`Dodaj ${emoji}`}
                                          style={{ animationDelay: `${emojiIdx * 0.05}s` }}
                                        >
                                          {emoji}
                                        </button>
                                                                           ))}
                                    </div>
                                  )}
                                                              
                                                               </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {renderTypingIndicator()}
                    <div ref={messagesEndRef} />
                  </div>
                  
                  {/* Formularz wysyłania wiadomości */}
                  <div className="bg-white dark:bg-gray-800 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    {replyingToMessage && (
                      <div className="mb-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Odpowiadasz na wiadomość od {replyingToMessage.sender.username}
                          </span>
                                               </div>
                        <button
                          onClick={() => {
                            setReplyingToMessage(null);
                            setMessageInput('');
                          }}
                          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    
                    <form onSubmit={sendMessage} className="flex items-center space-x-4">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                      />
                      
                      <button
                        type="button"
                        onClick={() => fileInputRef.current.click()}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      </button>
                      
                      <input
                        type="text"
                        value={messageInput}
                        onChange={handleMessageInputChange}
                        placeholder={activeChannel ? `Wyślij wiadomość do #${activeChannel.name}` : `Wyślij wiadomość do ${users.find(u => u._id === activePrivateChat)?.username}`}
                        className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      
                      <button
                        type="submit"
                        disabled={!messageInput.trim()}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
                
                {/* Panel wątku */}
                {showThread && threadMessage && (
                  <div className="w-1/2 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col animate-slideInRight">
                    {/* Header wątku */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Wątek</h3>
                        <button
                          onClick={closeThread}
                          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Wiadomość nadrzędna */}
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                            {threadMessage.sender?.profilePicture ? (
                              <img src={`http://localhost:5000${threadMessage.sender.profilePicture}`} alt="" className="w-full h-full rounded-full" />
                            ) : (
                              <span className="text-white font-semibold text-xs">{threadMessage.sender?.username?.[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <span className="font-semibold text-sm">{threadMessage.sender?.username}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(threadMessage.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {threadMessage.type === 'text' ? (
                          <p className="text-sm">{threadMessage.content}</p>
                        ) : threadMessage.type === 'image' ? (
                          <img 
                            src={`http://localhost:5000${threadMessage.fileUrl}`} 
                            alt="Przesłany obraz" 
                            className="max-w-full h-auto rounded-lg"
                          />
                        ) : (
                          <a 
                            href={`http://localhost:5000${threadMessage.fileUrl}`} 
                            download 
                            className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:underline"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-sm">{threadMessage.fileName}</span>
                          </a>
                        )}
                        {threadMessage.threadReplies > 0 && (
                          <p className="text-xs text-gray-500 mt-2">{threadMessage.threadReplies} odpowiedzi</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Odpowiedzi w wątku */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                      {threadMessages.map((message, index) => {
                        const isMyMessage = user && message.sender._id === user._id;
                        return (
                          <div key={message._id} className={`flex items-start space-x-3 animate-fadeIn ${
                            isMyMessage ? 'flex-row-reverse space-x-reverse' : ''
                          }`} style={{ animationDelay: `${index * 0.1}s` }}>
                            {/* Avatar */}
                            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                              {message.sender?.profilePicture ? (
                                <img src={`http://localhost:5000${message.sender.profilePicture}`} alt="" className="w-full h-full rounded-full" />
                              ) : (
                                <span className="text-white font-semibold text-xs">{message.sender?.username?.[0]?.toUpperCase()}</span>
                              )}
                            </div>
                            
                            {/* Wiadomość */}
                            <div className={`max-w-xs px-3 py-2 rounded-xl shadow-sm ${
                              isMyMessage 
                                ? 'bg-purple-600 text-white rounded-br-md' 
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
                            }`}>
                              {!isMyMessage && (
                                <div className="flex items-baseline space-x-2 mb-1">
                                  <span className="font-semibold text-xs">{message.sender?.username}</span>
                                  <span className="text-xs opacity-60">
                                    {new Date(message.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}
                              
                              {message.type === 'text' ? (
                                <p className="text-sm">{message.content}</p>
                              ) : message.type === 'image' ? (
                                <img 
                                  src={`http://localhost:5000${message.fileUrl}`} 
                                  alt="Przesłany obraz" 
                                  className="max-w-full h-auto rounded-lg"
                                />
                              ) : (
                                <a 
                                  href={`http://localhost:5000${message.fileUrl}`} 
                                  download 
                                  className={`flex items-center space-x-2 hover:underline ${isMyMessage ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-sm">{message.fileName}</span>
                                </a>
                              )}
                              
                              {isMyMessage && (
                                <div className="text-xs opacity-60 mt-1 text-right">
                                  {new Date(message.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Formularz odpowiedzi w wątku */}
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                      <form onSubmit={sendThreadReply} className="flex items-center space-x-3">
                        <input
                          type="text"
                          value={threadInput}
                          onChange={(e) => setThreadInput(e.target.value)}
                          placeholder="Odpowiedz w wątku..."
                          className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        
                        <button
                          type="submit"
                          disabled={!threadInput.trim()}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <p>Wybierz kanał lub rozpocznij rozmowę, aby zacząć pisać</p>
            </div>
          )}
        </div>
        
        {/* Panel powiadomień */}
        {showNotifications && (
          <div className="absolute top-16 right-4 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold">Powiadomienia</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.length > 0 ? (
                notifications.map(notification => (
                  <div key={notification._id} className={`p-4 ${notification.read ? 'opacity-60' : ''}`}>
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{notification.body}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {new Date(notification.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  Brak powiadomień
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Modal tworzenia kanału */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100">
            <h3 className="text-xl font-bold mb-4">Utwórz nowy kanał</h3>
            
            <form onSubmit={createChannel} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nazwa kanału</label>
                <input
                  type="text"
                  value={newChannelData.name}
                  onChange={(e) => setNewChannelData({...newChannelData, name: e.target.value})}
                  className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="np. ogólny"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Opis (opcjonalny)</label>
                <textarea
                  value={newChannelData.description}
                  onChange={(e) => setNewChannelData({...newChannelData, description: e.target.value})}
                  className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder="O czym jest ten kanał?"
                  rows={3}
                />
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateChannel(false);
                    setNewChannelData({ name: '', description: '' });
                                   }}
                  className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Utwórz kanał
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Modal profilu użytkownika */}
      {showUserProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100">
            <h3 className="text-xl font-bold mb-4">Profil użytkownika</h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center">
                  {user?.profilePicture ? (
                    <img src={`http://localhost:5000${user.profilePicture}`} alt="" className="w-full h-full rounded-full" />
                  ) : (
                    <span className="text-2xl font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-semibold">{user?.username}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Zmień zdjęcie profilowe</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const formData = new FormData();
                    formData.append('profilePicture', file);
                    
                    try {
                      const response = await fetch('http://localhost:5000/api/users/profile', {
                        method: 'PUT',
                        headers: {
                          'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: formData
                      });
                      
                      if (response.ok) {
                        const updatedUser = await response.json();
                        setUser(updatedUser);
                      }
                    } catch (error) {
                      console.error('Błąd aktualizacji zdjęcia:', error);
                    }
                  }}
                  className="w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
              </div>
              
              <div className="pt-4">
                <button
                  onClick={() => setShowUserProfile(false)}
                  className="w-full bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal profilu innego użytkownika */}
      {showOtherUserProfile && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100">
            <h3 className="text-xl font-bold mb-4">Profil użytkownika</h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center">
                  {selectedUser?.profilePicture ? (
                    <img src={`http://localhost:5000${selectedUser.profilePicture}`} alt="" className="w-full h-full rounded-full" />
                  ) : (
                    <span className="text-2xl font-bold text-white">{selectedUser?.username?.[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-semibold">{selectedUser?.username}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedUser?.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {selectedUser.isOnline ? 'Online' : `Ostatnio ${new Date(selectedUser.lastSeen).toLocaleString('pl-PL')}`}
                  </p>
                </div>
              </div>
              
              <div className="pt-4 space-y-3">
                <button
                  onClick={() => {
                    setShowOtherUserProfile(false);
                    openPrivateChat(selectedUser._id);
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Wyślij wiadomość prywatną
                </button>
                <button
                  onClick={() => setShowOtherUserProfile(false)}
                  className="w-full bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal listy użytkowników */}
      {showUsersList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md transform transition-all duration-300 scale-100 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Wybierz użytkownika</h3>
            
            <div className="space-y-2">
              {users.map(user => (
                <button
                  key={user._id}
                  onClick={() => openPrivateChat(user._id)}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                    {user.profilePicture ? (
                      <img src={`http://localhost:5000${user.profilePicture}`} alt="" className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-sm font-semibold text-white">{user.username[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{user.username}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {user.isOnline ? 'Online' : `Ostatnio ${new Date(user.lastSeen).toLocaleString('pl-PL')}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowUsersList(false)}
              className="w-full mt-4 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Zamknij
            </button>
          </div>
        </div>
      )}
    </div>
  );
}