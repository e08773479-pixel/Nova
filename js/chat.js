/* =========================================================
   NOVA — Chat Engine
   File: js/chat.js
   Version: 1.0.0

   Responsibilities:
   - Conversations
   - Messages
   - Sending
   - Editing
   - Deleting
   - Replies
   - Reactions
   - Drafts
   - Attachments
   - Message selection
   - Search
   - Pagination
   - API preparation
   - Realtime preparation

   No fake users.
   No fake messages.
   No fake balances/statistics.
   ========================================================= */

(() => {
  "use strict";

  const CONFIG =
    window.APP_CONFIG || {};

  const APP =
    window.APP || {};

  const STORAGE =
    window.NOVA_STORAGE || null;

  const DEBUG =
    CONFIG.development?.debug === true;

  const log = (...args) => {
    if (DEBUG) {
      console.info(
        "[NOVA CHAT]",
        ...args
      );
    }
  };

  const warn = (...args) => {
    if (DEBUG) {
      console.warn(
        "[NOVA CHAT]",
        ...args
      );
    }
  };

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */

  const state = {
    initialized: false,

    activeConversationId: null,

    conversations: [],
    messages: [],

    selectedMessageIds: new Set(),

    replyTo: null,
    editingMessageId: null,

    searchQuery: "",

    pagination: {
      page: 1,
      perPage:
        CONFIG.messaging?.pagination
          ?.messagesPerPage || 50,
      hasMore: true,
      loading: false
    },

    sending: false,

    typing: {
      active: false,
      timer: null
    },

    realtime: {
      connected: false,
      enabled:
        CONFIG.realtime?.enabled === true
    },

    pendingUploads: new Map(),

    initializedElements: new WeakSet()
  };

  window.NOVA_CHAT =
    window.NOVA_CHAT || {};

  window.NOVA_CHAT.state =
    state;

  /* ---------------------------------------------------------
     DOM Helpers
     --------------------------------------------------------- */

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(
      root.querySelectorAll(selector)
    );
  }

  /* ---------------------------------------------------------
     Feature Check
     --------------------------------------------------------- */

  function featureEnabled(
    feature
  ) {
    if (
      typeof APP.isFeatureEnabled ===
      "function"
    ) {
      return APP.isFeatureEnabled(
        feature
      );
    }

    return true;
  }

  /* ---------------------------------------------------------
     API
     --------------------------------------------------------- */

  function getApiBase() {
    const api =
      CONFIG.api || {};

    const base =
      String(
        api.baseURL || "/api"
      ).replace(
        /\/+$/g,
        ""
      );

    const version =
      String(
        api.version || "v1"
      ).replace(
        /^\/+|\/+$/g,
        ""
      );

    return [
      base,
      version
    ]
      .filter(Boolean)
      .join("/");
  }

  function getEndpoint(
    name
  ) {
    return (
      CONFIG.api?.endpoints?.[
        name
      ] || `/${name}`
    );
  }

  function buildApiUrl(
    endpoint,
    id = ""
  ) {
    const cleanEndpoint =
      String(endpoint || "")
        .replace(/^\/+/g, "")
        .replace(/\/+$/g, "");

    const cleanId =
      id
        ? String(id)
            .replace(/^\/+/g, "")
            .replace(/\/+$/g, "")
        : "";

    return [
      getApiBase(),
      cleanEndpoint,
      cleanId
    ]
      .filter(Boolean)
      .join("/");
  }

  async function apiRequest(
    url,
    options = {}
  ) {
    const timeout =
      CONFIG.api?.timeout || 15000;

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        () => {
          controller.abort();
        },
        timeout
      );

    const headers = {
      Accept:
        "application/json",
      ...(options.headers || {})
    };

    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers[
        "Content-Type"
      ] =
        "application/json";
    }

    try {
      const response =
        await fetch(
          url,
          {
            ...options,
            credentials:
              CONFIG.api
                ?.credentials ||
              "include",
            headers,
            signal:
              controller.signal
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let data = null;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        const text =
          await response.text();

        data =
          text || null;
      }

      if (!response.ok) {
        const error =
          new Error(
            data?.message ||
              data?.error ||
              `Request failed: ${response.status}`
          );

        error.status =
          response.status;

        error.data =
          data;

        throw error;
      }

      return data;
    } finally {
      window.clearTimeout(
        timer
      );
    }
  }

  /* ---------------------------------------------------------
     Storage
     --------------------------------------------------------- */

  function storageKey(
    conversationId
  ) {
    return (
      `chat_draft_${conversationId}`
    );
  }

  function getDraft(
    conversationId
  ) {
    if (!conversationId) {
      return "";
    }

    try {
      if (
        STORAGE &&
        typeof STORAGE.drafts?.get ===
          "function"
      ) {
        return (
          STORAGE.drafts.get(
            conversationId
          ) || ""
        );
      }

      if (
        typeof APP.storageGet ===
        "function"
      ) {
        return (
          APP.storageGet(
            storageKey(
              conversationId
            )
          ) || ""
        );
      }

      return "";
    } catch (error) {
      warn(
        "Draft read failed:",
        error
      );

      return "";
    }
  }

  function saveDraft(
    conversationId,
    value
  ) {
    if (!conversationId) {
      return false;
    }

    const draft =
      String(value || "");

    try {
      if (
        STORAGE &&
        typeof STORAGE.drafts?.set ===
          "function"
      ) {
        return STORAGE.drafts.set(
          conversationId,
          draft
        );
      }

      if (
        typeof APP.storageSet ===
        "function"
      ) {
        return APP.storageSet(
          storageKey(
            conversationId
          ),
          draft
        );
      }

      return false;
    } catch (error) {
      warn(
        "Draft save failed:",
        error
      );

      return false;
    }
  }

  function removeDraft(
    conversationId
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      if (
        STORAGE &&
        typeof STORAGE.drafts?.remove ===
          "function"
      ) {
        return STORAGE.drafts.remove(
          conversationId
        );
      }

      if (
        typeof APP.storageRemove ===
        "function"
      ) {
        return APP.storageRemove(
          storageKey(
            conversationId
          )
        );
      }

      return false;
    } catch (error) {
      warn(
        "Draft remove failed:",
        error
      );

      return false;
    }
  }

  /* ---------------------------------------------------------
     Normalization
     --------------------------------------------------------- */

  function normalizeConversation(
    item
  ) {
    if (!item) {
      return null;
    }

    return {
      id:
        item.id ||
        item.conversationId ||
        null,

      type:
        item.type ||
        "private",

      title:
        item.title ||
        item.name ||
        "",

      avatar:
        item.avatar ||
        item.photo ||
        item.image ||
        "",

      participants:
        Array.isArray(
          item.participants
        )
          ? item.participants
          : [],

      lastMessage:
        item.lastMessage ||
        null,

      unreadCount:
        Number(
          item.unreadCount || 0
        ),

      updatedAt:
        item.updatedAt ||
        item.lastActivityAt ||
        null,

      muted:
        item.muted === true,

      archived:
        item.archived === true,

      pinned:
        item.pinned === true
    };
  }

  function normalizeMessage(
    item
  ) {
    if (!item) {
      return null;
    }

    return {
      id:
        item.id ||
        item.messageId ||
        null,

      conversationId:
        item.conversationId ||
        state.activeConversationId ||
        null,

      senderId:
        item.senderId ||
        item.sender?.id ||
        null,

      sender:
        item.sender ||
        null,

      type:
        item.type ||
        "text",

      text:
        typeof item.text ===
        "string"
          ? item.text
          : "",

      content:
        item.content ||
        null,

      attachments:
        Array.isArray(
          item.attachments
        )
          ? item.attachments
          : [],

      replyTo:
        item.replyTo ||
        null,

      reactions:
        Array.isArray(
          item.reactions
        )
          ? item.reactions
          : [],

      status:
        item.status ||
        "sent",

      edited:
        item.edited === true,

      deleted:
        item.deleted === true,

      createdAt:
        item.createdAt ||
        item.timestamp ||
        null,

      updatedAt:
        item.updatedAt ||
        null
    };
  }

  /* ---------------------------------------------------------
     Conversation Loading
     --------------------------------------------------------- */

  async function loadConversations(
    options = {}
  ) {
    if (
      !featureEnabled(
        "messaging"
      )
    ) {
      return [];
    }

    const {
      page = 1,
      perPage =
        CONFIG.messaging
          ?.pagination
          ?.conversationsPerPage ||
        30
    } = options;

    const endpoint =
      getEndpoint(
        "conversations"
      );

    const url =
      buildApiUrl(
        endpoint
      ) +
      `?page=${encodeURIComponent(
        page
      )}&perPage=${encodeURIComponent(
        perPage
      )}`;

    try {
      const result =
        await apiRequest(
          url,
          {
            method: "GET"
          }
        );

      const raw =
        Array.isArray(result)
          ? result
          : result?.data ||
            result?.conversations ||
            [];

      const conversations =
        raw
          .map(
            normalizeConversation
          )
          .filter(
            (item) => item?.id
          );

      if (page === 1) {
        state.conversations =
          conversations;
      } else {
        state.conversations =
          [
            ...state.conversations,
            ...conversations
          ];
      }

      renderConversationList();

      return state.conversations;
    } catch (error) {
      warn(
        "Could not load conversations:",
        error
      );

      dispatch(
        "nova:chat-error",
        {
          type:
            "conversations-load",
          error
        }
      );

      return [];
    }
  }

  /* ---------------------------------------------------------
     Message Loading
     --------------------------------------------------------- */

  async function loadMessages(
    conversationId,
    options = {}
  ) {
    if (
      !conversationId
    ) {
      return [];
    }

    if (
      !featureEnabled(
        "messaging"
      )
    ) {
      return [];
    }

    const {
      page = 1,
      perPage =
        CONFIG.messaging
          ?.pagination
          ?.messagesPerPage ||
        50,
      append = false
    } = options;

    state.pagination.loading =
      true;

    try {
      const endpoint =
        getEndpoint(
          "messages"
        );

      const url =
        buildApiUrl(
          endpoint
        ) +
        `?conversationId=${encodeURIComponent(
          conversationId
        )}&page=${encodeURIComponent(
          page
        )}&perPage=${encodeURIComponent(
          perPage
        )}`;

      const result =
        await apiRequest(
          url,
          {
            method: "GET"
          }
        );

      const raw =
        Array.isArray(result)
          ? result
          : result?.data ||
            result?.messages ||
            [];

      const messages =
        raw
          .map(
            normalizeMessage
          )
          .filter(
            (item) => item?.id
          );

      if (
        append
      ) {
        state.messages =
          [
            ...messages,
            ...state.messages
          ];
      } else {
        state.messages =
          messages;
      }

      state.pagination.page =
        page;

      state.pagination.hasMore =
        Boolean(
          result?.hasMore ??
          result?.pagination
            ?.hasMore ??
          messages.length >=
            perPage
        );

      renderMessages();

      return messages;
    } catch (error) {
      warn(
        "Could not load messages:",
        error
      );

      dispatch(
        "nova:chat-error",
        {
          type:
            "messages-load",
          error
        }
      );

      return [];
    } finally {
      state.pagination.loading =
        false;
    }
  }

  /* ---------------------------------------------------------
     Load Older Messages
     --------------------------------------------------------- */

  async function loadOlderMessages() {
    if (
      state.pagination.loading ||
      !state.pagination.hasMore ||
      !state.activeConversationId
    ) {
      return [];
    }

    return loadMessages(
      state.activeConversationId,
      {
        page:
          state.pagination.page +
          1,
        append: true
      }
    );
  }

  /* ---------------------------------------------------------
     Open Conversation
     --------------------------------------------------------- */

  async function openConversation(
    conversationId,
    options = {}
  ) {
    if (!conversationId) {
      return false;
    }

    state.activeConversationId =
      String(
        conversationId
      );

    state.messages = [];

    state.selectedMessageIds.clear();

    state.replyTo = null;

    state.editingMessageId =
      null;

    state.searchQuery = "";

    state.pagination = {
      page: 1,
      perPage:
        CONFIG.messaging
          ?.pagination
          ?.messagesPerPage ||
        50,
      hasMore: true,
      loading: false
    };

    renderConversationList();
    renderMessages();
    updateComposerState();

    const draft =
      getDraft(
        state.activeConversationId
      );

    setComposerValue(
      draft
    );

    dispatch(
      "nova:conversation-open",
      {
        conversationId:
          state.activeConversationId
      }
    );

    await loadMessages(
      state.activeConversationId
    );

    return true;
  }

  /* ---------------------------------------------------------
     Send Message
     --------------------------------------------------------- */

  async function sendMessage(
    text,
    options = {}
  ) {
    if (
      !featureEnabled(
        "messaging"
      )
    ) {
      return {
        success: false,
        reason:
          "feature-disabled"
      };
    }

    const conversationId =
      options.conversationId ||
      state.activeConversationId;

    if (!conversationId) {
      return {
        success: false,
        reason:
          "conversation-required"
      };
    }

    const content =
      String(text || "").trim();

    if (!content) {
      return {
        success: false,
        reason:
          "empty-message"
      };
    }

    const maxLength =
      CONFIG.messaging
        ?.maxMessageLength ||
      4096;

    if (
      content.length >
      maxLength
    ) {
      return {
        success: false,
        reason:
          "message-too-long"
      };
    }

    if (
      state.sending
    ) {
      return {
        success: false,
        reason:
          "already-sending"
      };
    }

    state.sending = true;

    const payload = {
      conversationId:
        String(
          conversationId
        ),
      type:
        options.type ||
        "text",
      text:
        content,
      replyToId:
        options.replyToId ||
        state.replyTo?.id ||
        null
    };

    try {
      const url =
        buildApiUrl(
          getEndpoint(
            "messages"
          )
        );

      const result =
        await apiRequest(
          url,
          {
            method: "POST",
            body:
              JSON.stringify(
                payload
              )
          }
        );

      const message =
        normalizeMessage(
          result?.data ||
            result?.message ||
            result
        );

      if (message?.id) {
        state.messages.push(
          message
        );
      }

      removeDraft(
        conversationId
      );

      state.replyTo = null;

      updateComposerState();

      setComposerValue("");

      renderMessages();

      dispatch(
        "nova:message-sent",
        {
          message
        }
      );

      return {
        success: true,
        message
      };
    } catch (error) {
      warn(
        "Send message failed:",
        error
      );

      dispatch(
        "nova:chat-error",
        {
          type:
            "message-send",
          error
        }
      );

      return {
        success: false,
        error
      };
    } finally {
      state.sending = false;
    }
  }

  /* ---------------------------------------------------------
     Edit Message
     --------------------------------------------------------- */

  async function editMessage(
    messageId,
    text
  ) {
    if (
      !messageId ||
      !featureEnabled(
        "messageEditing"
      )
    ) {
      return {
        success: false
      };
    }

    const content =
      String(text || "").trim();

    if (!content) {
      return {
        success: false,
        reason:
          "empty-message"
      };
    }

    try {
      const endpoint =
        getEndpoint(
          "messages"
        );

      const url =
        buildApiUrl(
          endpoint,
          messageId
        );

      const result =
        await apiRequest(
          url,
          {
            method: "PATCH",
            body:
              JSON.stringify({
                text: content
              })
          }
        );

      const updated =
        normalizeMessage(
          result?.data ||
            result?.message ||
            result
        );

      replaceMessage(
        updated
      );

      state.editingMessageId =
        null;

      renderMessages();

      dispatch(
        "nova:message-edited",
        {
          message:
            updated
        }
      );

      return {
        success: true,
        message:
          updated
      };
    } catch (error) {
      warn(
        "Edit message failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Delete Message
     --------------------------------------------------------- */

  async function deleteMessage(
    messageId,
    options = {}
  ) {
    if (
      !messageId ||
      !featureEnabled(
        "messageDeletion"
      )
    ) {
      return {
        success: false
      };
    }

    try {
      const endpoint =
        getEndpoint(
          "messages"
        );

      const url =
        buildApiUrl(
          endpoint,
          messageId
        );

      const result =
        await apiRequest(
          url,
          {
            method: "DELETE",
            body:
              JSON.stringify({
                deleteForEveryone:
                  options.deleteForEveryone ===
                  true
              })
          }
        );

      const index =
        state.messages.findIndex(
          (message) =>
            message.id ===
            messageId
        );

      if (index >= 0) {
        if (
          options.deleteForEveryone
        ) {
          state.messages[
            index
          ] = {
            ...state.messages[
              index
            ],
            deleted: true,
            text: "",
            content: null,
            attachments: []
          };
        } else {
          state.messages.splice(
            index,
            1
          );
        }
      }

      state.selectedMessageIds.delete(
        messageId
      );

      renderMessages();

      dispatch(
        "nova:message-deleted",
        {
          messageId,
          result
        }
      );

      return {
        success: true
      };
    } catch (error) {
      warn(
        "Delete message failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Reply
     --------------------------------------------------------- */

  function setReplyTo(
    message
  ) {
    if (
      !message ||
      !featureEnabled(
        "replies"
      )
    ) {
      return false;
    }

    state.replyTo =
      message;

    state.editingMessageId =
      null;

    updateComposerState();

    focusComposer();

    dispatch(
      "nova:reply-start",
      {
        message
      }
    );

    return true;
  }

  function cancelReply() {
    state.replyTo =
      null;

    updateComposerState();

    dispatch(
      "nova:reply-cancel"
    );
  }

  /* ---------------------------------------------------------
     Reactions
     --------------------------------------------------------- */

  async function reactToMessage(
    messageId,
    reaction
  ) {
    if (
      !messageId ||
      !reaction ||
      !featureEnabled(
        "reactions"
      )
    ) {
      return {
        success: false
      };
    }

    try {
      const endpoint =
        getEndpoint(
          "messages"
        );

      const url =
        buildApiUrl(
          `${endpoint}/${messageId}/reactions`
        );

      const result =
        await apiRequest(
          url,
          {
            method: "POST",
            body:
              JSON.stringify({
                reaction
              })
          }
        );

      dispatch(
        "nova:message-reaction",
        {
          messageId,
          reaction,
          result
        }
      );

      return {
        success: true,
        result
      };
    } catch (error) {
      warn(
        "Reaction failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Attachments
     --------------------------------------------------------- */

  async function uploadAttachment(
    file,
    conversationId =
      state.activeConversationId
  ) {
    if (
      !file ||
      !conversationId
    ) {
      return {
        success: false
      };
    }

    if (
      !featureEnabled(
        "mediaMessages"
      )
    ) {
      return {
        success: false,
        reason:
          "feature-disabled"
      };
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "conversationId",
      String(
        conversationId
      )
    );

    try {
      const endpoint =
        getEndpoint(
          "attachments"
        );

      const url =
        buildApiUrl(
          endpoint
        );

      const result =
        await apiRequest(
          url,
          {
            method: "POST",
            body:
              formData
          }
        );

      dispatch(
        "nova:attachment-uploaded",
        {
          result
        }
      );

      return {
        success: true,
        data:
          result?.data ||
          result
      };
    } catch (error) {
      warn(
        "Attachment upload failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Send Attachment Message
     --------------------------------------------------------- */

  async function sendAttachment(
    file,
    options = {}
  ) {
    const conversationId =
      options.conversationId ||
      state.activeConversationId;

    const upload =
      await uploadAttachment(
        file,
        conversationId
      );

    if (
      !upload.success
    ) {
      return upload;
    }

    try {
      const url =
        buildApiUrl(
          getEndpoint(
            "messages"
          )
        );

      const result =
        await apiRequest(
          url,
          {
            method: "POST",
            body:
              JSON.stringify({
                conversationId:
                  String(
                    conversationId
                  ),
                type:
                  options.type ||
                  detectAttachmentType(
                    file
                  ),
                text:
                  options.text ||
                  "",
                attachments:
                  [
                    upload.data
                  ],
                replyToId:
                  state.replyTo?.id ||
                  null
              })
          }
        );

      const message =
        normalizeMessage(
          result?.data ||
            result?.message ||
            result
        );

      if (message?.id) {
        state.messages.push(
          message
        );
      }

      state.replyTo = null;

      renderMessages();
      updateComposerState();

      dispatch(
        "nova:message-sent",
        {
          message
        }
      );

      return {
        success: true,
        message
      };
    } catch (error) {
      warn(
        "Attachment message failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  function detectAttachmentType(
    file
  ) {
    const type =
      String(
        file?.type || ""
      );

    if (
      type.startsWith(
        "image/"
      )
    ) {
      return "image";
    }

    if (
      type.startsWith(
        "video/"
      )
    ) {
      return "video";
    }

    if (
      type.startsWith(
        "audio/"
      )
    ) {
      return "audio";
    }

    return "document";
  }

  /* ---------------------------------------------------------
     Message Selection
     --------------------------------------------------------- */

  function toggleMessageSelection(
    messageId
  ) {
    if (
      !messageId ||
      !featureEnabled(
        "messageSelection"
      )
    ) {
      return false;
    }

    if (
      state.selectedMessageIds.has(
        messageId
      )
    ) {
      state.selectedMessageIds.delete(
        messageId
      );
    } else {
      state.selectedMessageIds.add(
        messageId
      );
    }

    updateSelectionUI();

    return true;
  }

  function clearSelection() {
    state.selectedMessageIds.clear();

    updateSelectionUI();

    dispatch(
      "nova:selection-clear"
    );
  }

  function getSelectedMessages() {
    return state.messages.filter(
      (message) =>
        state.selectedMessageIds.has(
          message.id
        )
    );
  }

  function updateSelectionUI() {
    $all(
      "[data-message-id]"
    ).forEach(
      (element) => {
        const id =
          element.dataset.messageId;

        const selected =
          state.selectedMessageIds.has(
            id
          );

        element.classList.toggle(
          "is-selected",
          selected
        );

        element.setAttribute(
          "aria-selected",
          String(selected)
        );
      }
    );

    $all(
      "[data-selection-count]"
    ).forEach(
      (element) => {
        element.textContent =
          String(
            state.selectedMessageIds.size
          );
      }
    );
  }

  /* ---------------------------------------------------------
     Search
     --------------------------------------------------------- */

  async function searchMessages(
    query
  ) {
    const value =
      String(
        query || ""
      ).trim();

    state.searchQuery =
      value;

    if (!value) {
      renderMessages();
      return [];
    }

    if (
      !state.activeConversationId
    ) {
      return [];
    }

    if (
      !featureEnabled(
        "messageSearch"
      )
    ) {
      return [];
    }

    try {
      const endpoint =
        getEndpoint(
          "messages"
        );

      const url =
        buildApiUrl(
          endpoint
        ) +
        `?conversationId=${encodeURIComponent(
          state.activeConversationId
        )}&search=${encodeURIComponent(
          value
        )}`;

      const result =
        await apiRequest(
          url,
          {
            method: "GET"
          }
        );

      const raw =
        Array.isArray(result)
          ? result
          : result?.data ||
            result?.messages ||
            [];

      const messages =
        raw
          .map(
            normalizeMessage
          )
          .filter(
            (message) =>
              message?.id
          );

      state.messages =
        messages;

      renderMessages();

      dispatch(
        "nova:message-search",
        {
          query:
            value,
          results:
            messages
        }
      );

      return messages;
    } catch (error) {
      warn(
        "Message search failed:",
        error
      );

      return [];
    }
  }

  /* ---------------------------------------------------------
     Typing Indicator
     --------------------------------------------------------- */

  function startTyping() {
    if (
      !state.activeConversationId ||
      !featureEnabled(
        "messaging"
      )
    ) {
      return;
    }

    if (
      state.typing.active
    ) {
      return;
    }

    state.typing.active =
      true;

    dispatch(
      "nova:typing-start",
      {
        conversationId:
          state.activeConversationId
      }
    );
  }

  function stopTyping() {
    if (
      !state.typing.active
    ) {
      return;
    }

    state.typing.active =
      false;

    dispatch(
      "nova:typing-stop",
      {
        conversationId:
          state.activeConversationId
      }
    );
  }

  function scheduleTypingStop() {
    if (
      state.typing.timer
    ) {
      window.clearTimeout(
        state.typing.timer
      );
    }

    state.typing.timer =
      window.setTimeout(
        () => {
          stopTyping();
        },
        1500
      );
  }

  /* ---------------------------------------------------------
     Composer
     --------------------------------------------------------- */

  function getComposer() {
    return (
      $(
        "[data-chat-composer]"
      ) ||
      $(
        "[data-message-input]"
      ) ||
      $(
        "#message-input"
      )
    );
  }

  function getComposerValue() {
    const composer =
      getComposer();

    if (!composer) {
      return "";
    }

    return String(
      composer.value || ""
    );
  }

  function setComposerValue(
    value
  ) {
    const composer =
      getComposer();

    if (!composer) {
      return;
    }

    composer.value =
      String(
        value || ""
      );

    autoResizeComposer(
      composer
    );
  }

  function focusComposer() {
    const composer =
      getComposer();

    if (!composer) {
      return;
    }

    composer.focus();

    const length =
      composer.value.length;

    try {
      composer.setSelectionRange(
        length,
        length
      );
    } catch (_) {}
  }

  function autoResizeComposer(
    element
  ) {
    if (
      !element ||
      element.tagName !==
        "TEXTAREA"
    ) {
      return;
    }

    element.style.height =
      "auto";

    const maxHeight =
      180;

    element.style.height =
      `${Math.min(
        element.scrollHeight,
        maxHeight
      )}px`;
  }

  function updateComposerState() {
    $all(
      "[data-reply-preview]"
    ).forEach(
      (element) => {
        if (
          state.replyTo
        ) {
          element.hidden =
            false;

          const text =
            $(
              "[data-reply-text]",
              element
            );

          if (text) {
            text.textContent =
              state.replyTo.text ||
              "رسالة";
          }
        } else {
          element.hidden =
            true;
        }
      }
    );

    $all(
      "[data-editing-indicator]"
    ).forEach(
      (element) => {
        element.hidden =
          !state.editingMessageId;
      }
    );
  }

  function handleComposerInput(
    event
  ) {
    const composer =
      event.currentTarget;

    autoResizeComposer(
      composer
    );

    if (
      state.activeConversationId
    ) {
      saveDraft(
        state.activeConversationId,
        composer.value
      );
    }

    startTyping();

    scheduleTypingStop();
  }

  async function handleComposerSubmit(
    event
  ) {
    event.preventDefault();

    const composer =
      getComposer();

    if (!composer) {
      return;
    }

    const value =
      composer.value.trim();

    if (!value) {
      return;
    }

    if (
      state.editingMessageId
    ) {
      const result =
        await editMessage(
          state.editingMessageId,
          value
        );

      if (
        result.success
      ) {
        setComposerValue("");
      }

      return;
    }

    await sendMessage(
      value
    );
  }

  function bindComposer() {
    const composer =
      getComposer();

    if (
      composer &&
      !state.initializedElements.has(
        composer
      )
    ) {
      composer.addEventListener(
        "input",
        handleComposerInput
      );

      composer.addEventListener(
        "keydown",
        (event) => {
          /*
           * Enter sends.
           * Shift + Enter creates a new line.
           */
          if (
            event.key ===
              "Enter" &&
            !event.shiftKey
          ) {
            event.preventDefault();

            const form =
              composer.closest(
                "form"
              );

            if (form) {
              form.requestSubmit();
            } else {
              handleComposerSubmit(
                event
              );
            }
          }
        }
      );

      state.initializedElements.add(
        composer
      );
    }

    const form =
      $(
        "[data-chat-form]"
      ) ||
      composer?.closest(
        "form"
      );

    if (
      form &&
      !state.initializedElements.has(
        form
      )
    ) {
      form.addEventListener(
        "submit",
        handleComposerSubmit
      );

      state.initializedElements.add(
        form
      );
    }

    $all(
      "[data-cancel-reply]"
    ).forEach(
      (button) => {
        if (
          state.initializedElements.has(
            button
          )
        ) {
          return;
        }

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            cancelReply();
          }
        );

        state.initializedElements.add(
          button
        );
      }
    );
  }

  /* ---------------------------------------------------------
     File Input
     --------------------------------------------------------- */

  function bindAttachmentInputs() {
    $all(
      "[data-chat-attachment]"
    ).forEach(
      (input) => {
        if (
          state.initializedElements.has(
            input
          )
        ) {
          return;
        }

        input.addEventListener(
          "change",
          async () => {
            const files =
              Array.from(
                input.files || []
              );

            for (
              const file
              of files
            ) {
              await sendAttachment(
                file
              );
            }

            input.value = "";
          }
        );

        state.initializedElements.add(
          input
        );
      }
    );
  }

  /* ---------------------------------------------------------
     Message UI
     --------------------------------------------------------- */

  function getMessageContainer() {
    return (
      $(
        "[data-messages]"
      ) ||
      $(
        "[data-chat-messages]"
      ) ||
      $(
        "#messages"
      )
    );
  }

  function escapeHTML(
    value
  ) {
    return String(
      value || ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function formatMessageText(
    value
  ) {
    return escapeHTML(
      value
    ).replace(
      /\n/g,
      "<br>"
    );
  }

  function renderMessageHTML(
    message
  ) {
    const selected =
      state.selectedMessageIds.has(
        message.id
      );

    const deleted =
      message.deleted === true;

    const text =
      deleted
        ? "تم حذف هذه الرسالة"
        : formatMessageText(
            message.text
          );

    const edited =
      message.edited
        ? '<span class="message-edited">معدلة</span>'
        : "";

    const reply =
      message.replyTo
        ? `
          <div class="message-reply">
            <span class="message-reply__label">
              رد على رسالة
            </span>
            <span class="message-reply__text">
              ${escapeHTML(
                message.replyTo.text ||
                  "رسالة"
              )}
            </span>
          </div>
        `
        : "";

    return `
      <article
        class="message ${deleted ? "is-deleted" : ""} ${
          selected ? "is-selected" : ""
        }"
        data-message-id="${escapeHTML(
          message.id
        )}"
        aria-selected="${String(
          selected
        )}"
      >
        ${reply}

        <div class="message__body">
          <div class="message__text">
            ${text}
          </div>

          ${
            message.attachments?.length
              ? renderAttachments(
                  message.attachments
                )
              : ""
          }

          <div class="message__meta">
            ${
              formatMessageTime(
                message.createdAt
              )
            }

            ${edited}
          </div>
        </div>
      </article>
    `;
  }

  function renderAttachments(
    attachments
  ) {
    if (
      !Array.isArray(
        attachments
      )
    ) {
      return "";
    }

    return `
      <div class="message-attachments">
        ${attachments
          .map(
            (attachment) =>
              renderAttachment(
                attachment
              )
          )
          .join("")}
      </div>
    `;
  }

  function renderAttachment(
    attachment
  ) {
    if (!attachment) {
      return "";
    }

    const url =
      attachment.url ||
      attachment.downloadUrl ||
      "";

    const type =
      attachment.type ||
      "";

    if (!url) {
      return "";
    }

    if (
      type.startsWith(
        "image/"
      ) ||
      attachment.kind ===
        "image"
    ) {
      return `
        <a
          class="message-attachment message-attachment--image"
          href="${escapeHTML(
            url
          )}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="${escapeHTML(
              url
            )}"
            alt="${escapeHTML(
              attachment.name ||
                "صورة"
            )}"
            loading="lazy"
          >
        </a>
      `;
    }

    if (
      type.startsWith(
        "video/"
      ) ||
      attachment.kind ===
        "video"
    ) {
      return `
        <video
          class="message-attachment message-attachment--video"
          controls
          preload="metadata"
        >
          <source
            src="${escapeHTML(
              url
            )}"
            type="${escapeHTML(
              type
            )}"
          >
        </video>
      `;
    }

    return `
      <a
        class="message-attachment message-attachment--file"
        href="${escapeHTML(
          url
        )}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="message-attachment__icon">
          📎
        </span>

        <span class="message-attachment__name">
          ${escapeHTML(
            attachment.name ||
              "ملف"
          )}
        </span>
      </a>
    `;
  }

  function formatMessageTime(
    timestamp
  ) {
    if (!timestamp) {
      return "";
    }

    const date =
      new Date(
        timestamp
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(
        "ar-EG",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      ).format(date);
    } catch (_) {
      return "";
    }
  }

  function renderMessages() {
    const container =
      getMessageContainer();

    if (!container) {
      return;
    }

    if (
      !state.activeConversationId
    ) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            💬
          </div>
          <h3>
            اختر محادثة
          </h3>
          <p>
            اختر محادثة لعرض الرسائل.
          </p>
        </div>
      `;

      return;
    }

    if (
      state.messages.length ===
      0
    ) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            💬
          </div>
          <h3>
            لا توجد رسائل
          </h3>
          <p>
            ابدأ المحادثة بإرسال أول رسالة.
          </p>
        </div>
      `;

      return;
    }

    const wasAtBottom =
      isMessagesAtBottom(
        container
      );

    container.innerHTML =
      state.messages
        .map(
          renderMessageHTML
        )
        .join("");

    bindMessageActions();

    updateSelectionUI();

    if (
      wasAtBottom
    ) {
      scrollMessagesToBottom(
        container
      );
    }
  }

  function isMessagesAtBottom(
    container
  ) {
    const threshold =
      100;

    return (
      container.scrollHeight -
        container.scrollTop -
        container.clientHeight <=
      threshold
    );
  }

  function scrollMessagesToBottom(
    container =
      getMessageContainer()
  ) {
    if (!container) {
      return;
    }

    container.scrollTop =
      container.scrollHeight;
  }

  /* ---------------------------------------------------------
     Message Actions
     --------------------------------------------------------- */

  function bindMessageActions() {
    const container =
      getMessageContainer();

    if (!container) {
      return;
    }

    $all(
      "[data-message-id]",
      container
    ).forEach(
      (element) => {
        if (
          state.initializedElements.has(
            element
          )
        ) {
          return;
        }

        const id =
          element.dataset.messageId;

        element.addEventListener(
          "click",
          (event) => {
            const action =
              event.target.closest(
                "[data-message-action]"
              );

            if (action) {
              return;
            }

            if (
              featureEnabled(
                "messageSelection"
              )
            ) {
              toggleMessageSelection(
                id
              );
            }
          }
        );

        $all(
          "[data-message-action]",
          element
        ).forEach(
          (action) => {
            action.addEventListener(
              "click",
              async (event) => {
                event.preventDefault();
                event.stopPropagation();

                await handleMessageAction(
                  action.dataset
                    .messageAction,
                  id
                );
              }
            );
          }
        );

        state.initializedElements.add(
          element
        );
      }
    );
  }

  async function handleMessageAction(
    action,
    messageId
  ) {
    const message =
      state.messages.find(
        (item) =>
          item.id ===
          messageId
      );

    if (!message) {
      return;
    }

    switch (
      action
    ) {
      case "reply":
        setReplyTo(
          message
        );
        break;

      case "edit":
        startEditing(
          message
        );
        break;

      case "delete":
        await deleteMessage(
          messageId
        );
        break;

      case "react":
        /*
         * UI can provide a separate
         * reaction picker and call
         * reactToMessage directly.
         */
        dispatch(
          "nova:reaction-picker",
          {
            message
          }
        );
        break;

      case "select":
        toggleMessageSelection(
          messageId
        );
        break;

      case "copy":
        await copyMessage(
          message
        );
        break;

      default:
        break;
    }
  }

  function startEditing(
    message
  ) {
    if (
      !message ||
      !featureEnabled(
        "messageEditing"
      )
    ) {
      return false;
    }

    state.editingMessageId =
      message.id;

    state.replyTo =
      null;

    setComposerValue(
      message.text
    );

    updateComposerState();

    focusComposer();

    dispatch(
      "nova:edit-start",
      {
        message
      }
    );

    return true;
  }

  async function copyMessage(
    message
  ) {
    if (
      !message?.text ||
      !featureEnabled(
        "messageCopy"
      )
    ) {
      return false;
    }

    if (
      !navigator.clipboard
    ) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(
        message.text
      );

      dispatch(
        "nova:message-copied",
        {
          messageId:
            message.id
        }
      );

      return true;
    } catch (error) {
      warn(
        "Copy failed:",
        error
      );

      return false;
    }
  }

  function replaceMessage(
    updated
  ) {
    if (!updated?.id) {
      return;
    }

    const index =
      state.messages.findIndex(
        (message) =>
          message.id ===
          updated.id
      );

    if (index < 0) {
      return;
    }

    state.messages[
      index
    ] = updated;
  }

  /* ---------------------------------------------------------
     Conversation List UI
     --------------------------------------------------------- */

  function renderConversationList() {
    const container =
      $(
        "[data-conversations]"
      ) ||
      $(
        "[data-chat-list]"
      );

    if (!container) {
      return;
    }

    if (
      state.conversations.length ===
      0
    ) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            💬
          </div>
          <h3>
            لا توجد محادثات
          </h3>
          <p>
            ابدأ محادثة جديدة من جهات الاتصال.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.conversations
        .map(
          (conversation) =>
            renderConversationHTML(
              conversation
            )
        )
        .join("");

    bindConversationActions();
  }

  function renderConversationHTML(
    conversation
  ) {
    const active =
      String(
        conversation.id
      ) ===
      String(
        state.activeConversationId
      );

    const unread =
      Number(
        conversation.unreadCount ||
          0
      );

    return `
      <button
        type="button"
        class="chat-item ${
          active
            ? "is-active"
            : ""
        }"
        data-conversation-id="${escapeHTML(
          conversation.id
        )}"
      >
        <span class="chat-item__avatar">
          ${
            conversation.avatar
              ? `
                <img
                  src="${escapeHTML(
                    conversation.avatar
                  )}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span aria-hidden="true">
                  👤
                </span>
              `
          }
        </span>

        <span class="chat-item__content">
          <strong class="chat-item__name">
            ${escapeHTML(
              conversation.title ||
                "محادثة"
            )}
          </strong>

          <span class="chat-item__preview">
            ${escapeHTML(
              getLastMessagePreview(
                conversation
              )
            )}
          </span>
        </span>

        <span class="chat-item__meta">
          ${
            unread > 0
              ? `
                <span class="chat-item__unread">
                  ${unread}
                </span>
              `
              : ""
          }
        </span>
      </button>
    `;
  }

  function getLastMessagePreview(
    conversation
  ) {
    const message =
      conversation.lastMessage;

    if (!message) {
      return "لا توجد رسائل بعد";
    }

    if (
      message.deleted
    ) {
      return "تم حذف الرسالة";
    }

    if (
      message.text
    ) {
      return message.text;
    }

    if (
      message.type ===
      "image"
    ) {
      return "📷 صورة";
    }

    if (
      message.type ===
      "video"
    ) {
      return "🎥 فيديو";
    }

    if (
      message.type ===
      "audio"
    ) {
      return "🎵 ملف صوتي";
    }

    if (
      message.type ===
      "document"
    ) {
      return "📎 ملف";
    }

    return "رسالة";
  }

  function bindConversationActions() {
    const container =
      $(
        "[data-conversations]"
      ) ||
      $(
        "[data-chat-list]"
      );

    if (!container) {
      return;
    }

    $all(
      "[data-conversation-id]",
      container
    ).forEach(
      (element) => {
        if (
          state.initializedElements.has(
            element
          )
        ) {
          return;
        }

        element.addEventListener(
          "click",
          () => {
            openConversation(
              element.dataset
                .conversationId
            );
          }
        );

        state.initializedElements.add(
          element
        );
      }
    );
  }

  /* ---------------------------------------------------------
     Realtime
     --------------------------------------------------------- */

  function handleRealtimeMessage(
    message
  ) {
    const normalized =
      normalizeMessage(
        message
      );

    if (
      !normalized?.id
    ) {
      return;
    }

    if (
      normalized.conversationId !==
      state.activeConversationId
    ) {
      return;
    }

    const exists =
      state.messages.some(
        (item) =>
          item.id ===
          normalized.id
      );

    if (!exists) {
      state.messages.push(
        normalized
      );

      renderMessages();

      dispatch(
        "nova:message-received",
        {
          message:
            normalized
        }
      );
    }
  }

  function handleRealtimeEvent(
    event
  ) {
    if (!event) {
      return;
    }

    switch (
      event.type
    ) {
      case "message":
      case "message.created":
        handleRealtimeMessage(
          event.data ||
            event.message ||
            event
        );
        break;

      case "message.updated":
        replaceMessage(
          normalizeMessage(
            event.data ||
              event.message
          )
        );

        renderMessages();
        break;

      case "message.deleted":
        handleRemoteDeletion(
          event
        );
        break;

      case "typing.start":
        dispatch(
          "nova:remote-typing-start",
          event
        );
        break;

      case "typing.stop":
        dispatch(
          "nova:remote-typing-stop",
          event
        );
        break;

      default:
        break;
    }
  }

  function handleRemoteDeletion(
    event
  ) {
    const messageId =
      event.messageId ||
      event.data?.messageId ||
      event.message?.id;

    if (!messageId) {
      return;
    }

    const index =
      state.messages.findIndex(
        (message) =>
          message.id ===
          messageId
      );

    if (index >= 0) {
      state.messages[
        index
      ] = {
        ...state.messages[
          index
        ],
        deleted: true,
        text: "",
        content: null,
        attachments: []
      };

      renderMessages();
    }
  }

  function connectRealtime() {
    if (
      !state.realtime.enabled
    ) {
      return false;
    }

    /*
     * WebSocket implementation will
     * be attached when backend realtime
     * infrastructure is enabled.
     *
     * No fake realtime connection is
     * created here.
     */

    const websocketURL =
      CONFIG.realtime
        ?.websocketURL;

    if (!websocketURL) {
      log(
        "Realtime enabled in config but websocketURL is empty."
      );

      return false;
    }

    dispatch(
      "nova:realtime-ready",
      {
        websocketURL
      }
    );

    return true;
  }

  /* ---------------------------------------------------------
     Scroll / Pagination Binding
     --------------------------------------------------------- */

  function bindMessageScroll() {
    const container =
      getMessageContainer();

    if (
      !container ||
      state.initializedElements.has(
        container
      )
    ) {
      return;
    }

    container.addEventListener(
      "scroll",
      async () => {
        if (
          container.scrollTop <=
          80
        ) {
          await loadOlderMessages();
        }
      },
      {
        passive: true
      }
    );

    state.initializedElements.add(
      container
    );
  }

  /* ---------------------------------------------------------
     Search Binding
     --------------------------------------------------------- */

  function bindSearch() {
    $all(
      "[data-message-search]"
    ).forEach(
      (input) => {
        if (
          state.initializedElements.has(
            input
          )
        ) {
          return;
        }

        input.addEventListener(
          "input",
          () => {
            const query =
              input.value;

            /*
             * Do not hit the API
             * for every keystroke.
             */
            debounceSearch(
              query
            );
          }
        );

        state.initializedElements.add(
          input
        );
      }
    );
  }

  let searchTimer =
    null;

  function debounceSearch(
    query
  ) {
    if (
      search
