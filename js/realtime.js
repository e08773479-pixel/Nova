 /* =========================================================
    NOVA — Realtime Connection Manager
    File: js/realtime.js
    Version: 1.0.0

    مسؤول عن:
    - WebSocket connection
    - reconnect
    - connection state
    - incoming events
    - outgoing events
    - typing events
    - messages
    - notifications
    - calls
    - presence

    ملاحظة:
    لا يتم إنشاء أي بيانات وهمية.
    إذا لم يتم ضبط websocketURL فلن يتم فتح اتصال.
    ========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const APP = window.APP || {};

  const state = {
    initialized: false,

    socket: null,

    status: "disconnected",

    connectedAt: null,

    lastMessageAt: null,

    reconnectAttempts: 0,

    reconnectTimer: null,

    heartbeatTimer: null,

    manuallyClosed: false,

    subscriptions: new Map(),

    listeners: new Map(),

    pendingMessages: new Map(),

    connectionId: null
  };

  /* ---------------------------------------------------------
     Utilities
     --------------------------------------------------------- */

  function debug(...args) {
    if (
      CONFIG.development?.debug
    ) {
      console.debug(
        "[NOVA Realtime]",
        ...args
      );
    }
  }

  function warn(...args) {
    if (
      CONFIG.development?.debug
    ) {
      console.warn(
        "[NOVA Realtime]",
        ...args
      );
    }
  }

  function getWebSocketURL() {
    const configured =
      CONFIG.realtime?.websocketURL;

    if (
      configured &&
      typeof configured === "string"
    ) {
      return configured;
    }

    return "";
  }

  function isEnabled() {
    return Boolean(
      CONFIG.realtime?.enabled &&
      getWebSocketURL()
    );
  }

  function createId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      "nova-" +
      Date.now() +
      "-" +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function safeParse(value) {
    if (
      value &&
      typeof value === "object"
    ) {
      return value;
    }

    if (
      typeof value !== "string"
    ) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function emitDOMEvent(
    name,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(
        `nova:realtime:${name}`,
        {
          detail
        }
      )
    );
  }

  /* ---------------------------------------------------------
     Status
     --------------------------------------------------------- */

  function setStatus(
    status,
    extra = {}
  ) {
    const previous =
      state.status;

    state.status =
      status;

    document.documentElement.dataset
      .realtime = status;

    document.body.dataset
      .realtime = status;

    emitDOMEvent(
      "status",
      {
        status,
        previous,
        ...extra
      }
    );

    emitListeners(
      "status",
      {
        status,
        previous,
        ...extra
      }
    );

    debug(
      "Status:",
      previous,
      "→",
      status
    );
  }

  function getStatus() {
    return state.status;
  }

  function isConnected() {
    return (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    );
  }

  /* ---------------------------------------------------------
     Listener System
     --------------------------------------------------------- */

  function on(
    event,
    callback
  ) {
    if (
      typeof callback !==
      "function"
    ) {
      return () => {};
    }

    if (
      !state.listeners.has(event)
    ) {
      state.listeners.set(
        event,
        new Set()
      );
    }

    const listeners =
      state.listeners.get(event);

    listeners.add(callback);

    return () => {
      listeners.delete(callback);

      if (!listeners.size) {
        state.listeners.delete(
          event
        );
      }
    };
  }

  function off(
    event,
    callback
  ) {
    const listeners =
      state.listeners.get(event);

    if (!listeners) {
      return;
    }

    listeners.delete(callback);

    if (!listeners.size) {
      state.listeners.delete(
        event
      );
    }
  }

  function emitListeners(
    event,
    payload
  ) {
    const listeners =
      state.listeners.get(event);

    if (!listeners) {
      return;
    }

    listeners.forEach(
      (callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(
            "[NOVA Realtime] Listener error:",
            error
          );
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Connect
     --------------------------------------------------------- */

  function connect() {
    if (
      !isEnabled()
    ) {
      setStatus(
        "disabled"
      );

      debug(
        "Realtime disabled or websocketURL is empty."
      );

      return false;
    }

    if (
      state.socket &&
      (
        state.socket.readyState ===
          WebSocket.OPEN ||
        state.socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return true;
    }

    state.manuallyClosed =
      false;

    clearReconnectTimer();

    const url =
      getWebSocketURL();

    setStatus(
      "connecting"
    );

    try {
      state.socket =
        new WebSocket(url);
    } catch (error) {
      setStatus(
        "error",
        {
          error
        }
      );

      scheduleReconnect();

      return false;
    }

    bindSocket(
      state.socket
    );

    return true;
  }

  function bindSocket(
    socket
  ) {
    socket.addEventListener(
      "open",
      handleOpen
    );

    socket.addEventListener(
      "message",
      handleMessage
    );

    socket.addEventListener(
      "error",
      handleError
    );

    socket.addEventListener(
      "close",
      handleClose
    );
  }

  function handleOpen() {
    state.reconnectAttempts =
      0;

    state.connectedAt =
      Date.now();

    state.connectionId =
      createId();

    setStatus(
      "connected",
      {
        connectionId:
          state.connectionId
      }
    );

    startHeartbeat();

    authenticateSocket();

    restoreSubscriptions();

    flushPendingMessages();

    emitDOMEvent(
      "connected",
      {
        connectionId:
          state.connectionId
      }
    );

    emitListeners(
      "connected",
      {
        connectionId:
          state.connectionId
      }
    );

    debug(
      "WebSocket connected."
    );
  }

  function handleError(
    event
  ) {
    setStatus(
      "error",
      {
        event
      }
    );

    emitDOMEvent(
      "error",
      {
        event
      }
    );

    emitListeners(
      "error",
      {
        event
      }
    );

    warn(
      "WebSocket error."
    );
  }

  function handleClose(
    event
  ) {
    stopHeartbeat();

    const wasManual =
      state.manuallyClosed;

    state.socket = null;

    setStatus(
      wasManual
        ? "disconnected"
        : "reconnecting",
      {
        code:
          event?.code,
        reason:
          event?.reason || ""
      }
    );

    emitDOMEvent(
      "disconnected",
      {
        code:
          event?.code,
        reason:
          event?.reason || "",
        manual:
          wasManual
      }
    );

    emitListeners(
      "disconnected",
      {
        code:
          event?.code,
        reason:
          event?.reason || "",
        manual:
          wasManual
      }
    );

    if (
      !wasManual
    ) {
      scheduleReconnect();
    }
  }

  /* ---------------------------------------------------------
     Authentication
     --------------------------------------------------------- */

  function authenticateSocket() {
    const token =
      getAuthToken();

    const user =
      getCurrentUser();

    /*
     * لا نرسل أي قيمة افتراضية
     * أو حساب وهمي.
     */

    if (
      !token &&
      !user
    ) {
      return;
    }

    send(
      "auth:identify",
      {
        token:
          token || null,
        userId:
          user?.id || null
      },
      {
        queue: false
      }
    );
  }

  function getAuthToken() {
    try {
      if (
        window.NOVA_STORAGE &&
        typeof window.NOVA_STORAGE.get ===
          "function"
      ) {
        return (
          window.NOVA_STORAGE.get(
            "auth_token"
          ) || null
        );
      }

      return (
        localStorage.getItem(
          "nova_auth_token"
        ) || null
      );
    } catch {
      return null;
    }
  }

  function getCurrentUser() {
    try {
      if (
        window.NOVA_AUTH &&
        typeof window.NOVA_AUTH.getCurrentUser ===
          "function"
      ) {
        return (
          window.NOVA_AUTH.getCurrentUser() ||
          null
        );
      }

      return null;
    } catch {
      return null;
    }
  }

  /* ---------------------------------------------------------
     Incoming Messages
     --------------------------------------------------------- */

  function handleMessage(
    event
  ) {
    state.lastMessageAt =
      Date.now();

    const payload =
      safeParse(
        event.data
      );

    if (!payload) {
      warn(
        "Received invalid realtime payload."
      );

      return;
    }

    routeIncomingEvent(
      payload
    );
  }

  function routeIncomingEvent(
    payload
  ) {
    const type =
      payload.type ||
      payload.event ||
      payload.action ||
      "";

    const data =
      payload.data ||
      payload.payload ||
      payload;

    switch (type) {
      case "pong":
        handlePong(
          data
        );
        break;

      case "auth:success":
      case "auth:authenticated":
        handleAuthenticated(
          data
        );
        break;

      case "message":
      case "message:new":
      case "chat:message":
        handleMessageEvent(
          data
        );
        break;

      case "message:update":
        handleMessageUpdate(
          data
        );
        break;

      case "message:delete":
        handleMessageDelete(
          data
        );
        break;

      case "message:reaction":
        handleMessageReaction(
          data
        );
        break;

      case "typing:start":
        handleTyping(
          data,
          true
        );
        break;

      case "typing:stop":
        handleTyping(
          data,
          false
        );
        break;

      case "presence":
      case "presence:update":
        handlePresence(
          data
        );
        break;

      case "notification":
      case "notification:new":
        handleNotification(
          data
        );
        break;

      case "call":
      case "call:incoming":
        handleCall(
          data
        );
        break;

      case "call:update":
        handleCallUpdate(
          data
        );
        break;

      case "read":
      case "message:read":
        handleRead(
          data
        );
        break;

      case "conversation:update":
        handleConversationUpdate(
          data
        );
        break;

      default:
        emitCustomEvent(
          type,
          data
        );
        break;
    }

    emitListeners(
      type,
      data
    );
  }

  function handleAuthenticated(
    data
  ) {
    emitDOMEvent(
      "authenticated",
      data
    );
  }

  function handlePong(
    data
  ) {
    emitDOMEvent(
      "pong",
      data
    );
  }

  /* ---------------------------------------------------------
     Message Events
     --------------------------------------------------------- */

  function handleMessageEvent(
    data
  ) {
    const message =
      data?.message ||
      data;

    emitDOMEvent(
      "message",
      {
        message
      }
    );
  }

  function handleMessageUpdate(
    data
  ) {
    const message =
      data?.message ||
      data;

    emitDOMEvent(
      "message:update",
      {
        message
      }
    );
  }

  function handleMessageDelete(
    data
  ) {
    emitDOMEvent(
      "message:delete",
      {
        messageId:
          data?.messageId ||
          data?.id ||
          null,

        conversationId:
          data?.conversationId ||
          null,

        mode:
          data?.mode ||
          "everyone"
      }
    );
  }

  function handleMessageReaction(
    data
  ) {
    emitDOMEvent(
      "message:reaction",
      data
    );
  }

  /* ---------------------------------------------------------
     Typing
     --------------------------------------------------------- */

  function handleTyping(
    data,
    typing
  ) {
    emitDOMEvent(
      "typing",
      {
        conversationId:
          data?.conversationId ||
          null,

        userId:
          data?.userId ||
          null,

        typing
      }
    );
  }

  function startTyping(
    conversationId
  ) {
    if (
      !conversationId
    ) {
      return false;
    }

    return send(
      "typing:start",
      {
        conversationId
      }
    );
  }

  function stopTyping(
    conversationId
  ) {
    if (
      !conversationId
    ) {
      return false;
    }

    return send(
      "typing:stop",
      {
        conversationId
      }
    );
  }

  /* ---------------------------------------------------------
     Presence
     --------------------------------------------------------- */

  function handlePresence(
    data
  ) {
    emitDOMEvent(
      "presence",
      data
    );
  }

  function subscribePresence(
    userIds = []
  ) {
    if (
      !Array.isArray(
        userIds
      ) ||
      !userIds.length
    ) {
      return false;
    }

    return subscribe(
      "presence",
      {
        userIds
      }
    );
  }

  /* ---------------------------------------------------------
     Notifications
     --------------------------------------------------------- */

  function handleNotification(
    data
  ) {
    const notification =
      data?.notification ||
      data;

    emitDOMEvent(
      "notification",
      {
        notification
      }
    );
  }

  /* ---------------------------------------------------------
     Calls
     --------------------------------------------------------- */

  function handleCall(
    data
  ) {
    emitDOMEvent(
      "call",
      data
    );
  }

  function handleCallUpdate(
    data
  ) {
    emitDOMEvent(
      "call:update",
      data
    );
  }

  function sendCallSignal(
    callId,
    signal
  ) {
    if (
      !callId ||
      !signal
    ) {
      return false;
    }

    return send(
      "call:signal",
      {
        callId,
        signal
      }
    );
  }

  /* ---------------------------------------------------------
     Read Receipts
     --------------------------------------------------------- */

  function handleRead(
    data
  ) {
    emitDOMEvent(
      "read",
      data
    );
  }

  function markConversationRead(
    conversationId,
    messageIds = []
  ) {
    if (
      !conversationId
    ) {
      return false;
    }

    return send(
      "message:read",
      {
        conversationId,
        messageIds
      }
    );
  }

  /* ---------------------------------------------------------
     Conversations
     --------------------------------------------------------- */

  function handleConversationUpdate(
    data
  ) {
    emitDOMEvent(
      "conversation:update",
      data
    );
  }

  function subscribeConversation(
    conversationId
  ) {
    if (
      !conversationId
    ) {
      return false;
    }

    return subscribe(
      "conversation",
      {
        conversationId
      }
    );
  }

  function unsubscribeConversation(
    conversationId
  ) {
    if (
      !conversationId
    ) {
      return false;
    }

    return unsubscribe(
      "conversation",
      {
        conversationId
      }
    );
  }

  /* ---------------------------------------------------------
     Generic Send
     --------------------------------------------------------- */

  function send(
    type,
    data = {},
    options = {}
  ) {
    const {
      queue = true,
      messageId =
        createId()
    } = options;

    const payload = {
      id: messageId,
      type,
      data,
      timestamp:
        new Date().toISOString()
    };

    if (
      !isConnected()
    ) {
      if (queue) {
        queueMessage(
          payload
        );
      }

      return false;
    }

    try {
      state.socket.send(
        JSON.stringify(
          payload
        )
      );

      state.pendingMessages.delete(
        messageId
      );

      return true;
    } catch (error) {
      warn(
        "Failed to send realtime event:",
        error
      );

      if (queue) {
        queueMessage(
          payload
        );
      }

      return false;
    }
  }

  function queueMessage(
    payload
  ) {
    if (
      !payload?.id
    ) {
      return;
    }

    state.pendingMessages.set(
      payload.id,
      payload
    );
  }

  function flushPendingMessages() {
    if (
      !isConnected() ||
      !state.pendingMessages.size
    ) {
      return;
    }

    const pending =
      Array.from(
        state.pendingMessages.values()
      );

    state.pendingMessages.clear();

    pending.forEach(
      (payload) => {
        try {
          state.socket.send(
            JSON.stringify(
              payload
            )
          );
        } catch {
          state.pendingMessages.set(
            payload.id,
            payload
          );
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Subscriptions
     --------------------------------------------------------- */

  function subscribe(
    channel,
    data = {}
  ) {
    if (!channel) {
      return false;
    }

    const key =
      createSubscriptionKey(
        channel,
        data
      );

    state.subscriptions.set(
      key,
      {
        channel,
        data
      }
    );

    if (
      isConnected()
    ) {
      send(
        "subscribe",
        {
          channel,
          ...data
        }
      );
    }

    return true;
  }

  function unsubscribe(
    channel,
    data = {}
  ) {
    if (!channel) {
      return false;
    }

    const key =
      createSubscriptionKey(
        channel,
        data
      );

    state.subscriptions.delete(
      key
    );

    if (
      isConnected()
    ) {
      send(
        "unsubscribe",
        {
          channel,
          ...data
        },
        {
          queue: false
        }
      );
    }

    return true;
  }

  function restoreSubscriptions() {
    if (
      !isConnected()
    ) {
      return;
    }

    state.subscriptions.forEach(
      ({
        channel,
        data
      }) => {
        send(
          "subscribe",
          {
            channel,
            ...data
          },
          {
            queue: false
          }
        );
      }
    );
  }

  function createSubscriptionKey(
    channel,
    data
  ) {
    let serialized = "";

    try {
      serialized =
        JSON.stringify(data);
    } catch {
      serialized = "";
    }

    return `${channel}:${serialized}`;
  }

  /* ---------------------------------------------------------
     Heartbeat
     --------------------------------------------------------- */

  function startHeartbeat() {
    stopHeartbeat();

    const interval =
      Math.max(
        5000,
        Number(
          CONFIG.realtime?.heartbeatInterval ||
            25000
        )
      );

    state.heartbeatTimer =
      setInterval(
        () => {
          if (
            !isConnected()
          ) {
            return;
          }

          send(
            "ping",
            {
              timestamp:
                Date.now()
            },
            {
              queue: false
            }
          );
        },
        interval
      );
  }

  function stopHeartbeat() {
    if (
      state.heartbeatTimer
    ) {
      clearInterval(
        state.heartbeatTimer
      );

      state.heartbeatTimer =
        null;
    }
  }

  /* ---------------------------------------------------------
     Reconnect
     --------------------------------------------------------- */

  function scheduleReconnect() {
    if (
      state.manuallyClosed ||
      !isEnabled()
    ) {
      return;
    }

    const reconnect =
      CONFIG.realtime?.reconnect ||
      {};

    if (
      reconnect.enabled === false
    ) {
      return;
    }

    const maxAttempts =
      Number(
        reconnect.maxAttempts ||
          10
      );

    if (
      state.reconnectAttempts >=
      maxAttempts
    ) {
      setStatus(
        "failed"
      );

      emitDOMEvent(
        "reconnect:failed",
        {
          attempts:
            state.reconnectAttempts
        }
      );

      return;
    }

    clearReconnectTimer();

    state.reconnectAttempts +=
      1;

    const baseDelay =
      Number(
        reconnect.delay ||
          2000
      );

    const maxDelay =
      Number(
        reconnect.maxDelay ||
          30000
      );

    const exponential =
      Math.min(
        maxDelay,
        baseDelay *
          Math.pow(
            2,
            state.reconnectAttempts -
              1
          )
      );

    const jitter =
      Math.floor(
        Math.random() *
          500
      );

    const delay =
      Math.min(
        maxDelay,
        exponential +
          jitter
      );

    setStatus(
      "reconnecting",
      {
        attempt:
          state.reconnectAttempts,
        delay
      }
    );

    state.reconnectTimer =
      setTimeout(
        () => {
          state.reconnectTimer =
            null;

          connect();
        },
        delay
      );
  }

  function clearReconnectTimer() {
    if (
      state.reconnectTimer
    ) {
      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer =
        null;
    }
  }

  /* ---------------------------------------------------------
     Disconnect
     --------------------------------------------------------- */

  function disconnect(
    code = 1000,
    reason = "manual"
  ) {
    state.manuallyClosed =
      true;

    clearReconnectTimer();
    stopHeartbeat();

    if (
      state.socket
    ) {
      try {
        state.socket.close(
          code,
          reason
        );
      } catch {
        state.socket = null;
      }
    } else {
      setStatus(
        "disconnected"
      );
    }
  }

  /* ---------------------------------------------------------
     Custom Events
     --------------------------------------------------------- */

  function emitCustomEvent(
    type,
    data
  ) {
    if (!type) {
      return;
    }

    const safeType =
      String(type)
        .replace(
          /[^a-zA-Z0-9:_-]/g,
          ""
        );

    if (!safeType) {
      return;
    }

    emitDOMEvent(
      safeType,
      data
    );
  }

  /* ---------------------------------------------------------
     Network Awareness
     --------------------------------------------------------- */

  function bindNetworkEvents() {
    window.addEventListener(
      "online",
      () => {
        emitDOMEvent(
          "network",
          {
            online: true
          }
        );

        if (
          !isConnected()
        ) {
          connect();
        }
      }
    );

    window.addEventListener(
      "offline",
      () => {
        emitDOMEvent(
          "network",
          {
            online: false
          }
        );

        setStatus(
          "offline"
        );
      }
    );
  }

  /* ---------------------------------------------------------
     Initialization
     --------------------------------------------------------- */

  function init() {
    if (
      state.initialized
    ) {
      return;
    }

    state.initialized =
      true;

    bindNetworkEvents();

    if (
      !isEnabled()
    ) {
      setStatus(
        "disabled"
      );

      debug(
        "Realtime manager initialized without active WebSocket."
      );

      return;
    }

    connect();

    document.dispatchEvent(
      new CustomEvent(
        "nova:realtime:ready"
      )
    );
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.NOVA_REALTIME = {
    state,

    init,

    connect,
    disconnect,

    send,

    on,
    off,

    subscribe,
    unsubscribe,

    subscribeConversation,
    unsubscribeConversation,

    subscribePresence,

    startTyping,
    stopTyping,

    markConversationRead,

    sendCallSignal,

    isConnected,
    getStatus,
    getWebSocketURL,

    getSubscriptions() {
      return Array.from(
        state.subscriptions.values()
      );
    }
  };

  /* ---------------------------------------------------------
     Auto Start
     --------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }
})();
