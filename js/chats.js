/* =========================================================
   NOVA — Conversations List Manager
   File: js/chats.js
   Version: 1.0.0

   المسؤول عن:
   - تحميل قائمة المحادثات من API
   - البحث في المحادثات
   - ترتيب المحادثات
   - unread count
   - pin / mute / archive
   - حذف المحادثة
   - تحديد المحادثة الحالية
   - فتح المحادثة
   - تحديث القائمة عبر realtime
   - عدم إنشاء أي بيانات وهمية
   ========================================================= */

(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const APP = window.APP || {};

  const state = {
    initialized: false,

    loading: false,

    loadingMore: false,

    page: 1,

    hasMore: true,

    perPage:
      Number(
        CONFIG.messaging?.pagination
          ?.conversationsPerPage || 30
      ),

    conversations: [],

    filtered: [],

    selectedId: null,

    searchQuery: "",

    filter: "all",

    sort: "recent",

    abortController: null,

    initializedContainers: new WeakSet()
  };

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function debug(...args) {
    if (
      CONFIG.development?.debug
    ) {
      console.debug(
        "[NOVA Chats]",
        ...args
      );
    }
  }

  function warn(...args) {
    if (
      CONFIG.development?.debug
    ) {
      console.warn(
        "[NOVA Chats]",
        ...args
      );
    }
  }

  function escapeHTML(value) {
    return String(
      value ?? ""
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getAPIBase() {
    return (
      CONFIG.api?.baseURL ||
      "/api"
    );
  }

  function getAPIVersion() {
    return (
      CONFIG.api?.version ||
      "v1"
    );
  }

  function apiURL(
    path = ""
  ) {
    return [
      getAPIBase().replace(
        /\/+$/g,
        ""
      ),
      getAPIVersion().replace(
        /^\/+|\/+$/g,
        ""
      ),
      String(path).replace(
        /^\/+/g,
        ""
      )
    ]
      .filter(Boolean)
      .join("/");
  }

  function getToken() {
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

  async function apiRequest(
    path,
    options = {}
  ) {
    const {
      method = "GET",
      body = null,
      signal = null
    } = options;

    const headers = {
      Accept:
        "application/json"
    };

    const token =
      getToken();

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    if (
      body !== null &&
      !(body instanceof FormData)
    ) {
      headers[
        "Content-Type"
      ] = "application/json";
    }

    const response =
      await fetch(
        apiURL(path),
        {
          method,
          headers,
          credentials:
            CONFIG.api?.credentials ||
            "include",
          body:
            body === null
              ? undefined
              : body instanceof FormData
              ? body
              : JSON.stringify(body),
          signal
        }
      );

    let payload = null;

    try {
      payload =
        await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error =
        new Error(
          payload?.message ||
            `Request failed: ${response.status}`
        );

      error.status =
        response.status;

      error.payload =
        payload;

      throw error;
    }

    return payload;
  }

  function extractList(
    payload
  ) {
    if (
      Array.isArray(payload)
    ) {
      return payload;
    }

    if (
      Array.isArray(
        payload?.data
      )
    ) {
      return payload.data;
    }

    if (
      Array.isArray(
        payload?.data?.items
      )
    ) {
      return payload.data.items;
    }

    if (
      Array.isArray(
        payload?.items
      )
    ) {
      return payload.items;
    }

    if (
      Array.isArray(
        payload?.conversations
      )
    ) {
      return payload.conversations;
    }

    if (
      Array.isArray(
        payload?.data?.conversations
      )
    ) {
      return payload.data.conversations;
    }

    return [];
  }

  function extractMeta(
    payload
  ) {
    return (
      payload?.meta ||
      payload?.data?.meta ||
      {}
    );
  }

  /* ---------------------------------------------------------
     Normalize
     --------------------------------------------------------- */

  function normalizeConversation(
    item
  ) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      return null;
    }

    const lastMessage =
      item.lastMessage ||
      item.last_message ||
      null;

    const participant =
      item.participant ||
      item.otherUser ||
      item.other_user ||
      null;

    const unread =
      Number(
        item.unreadCount ??
          item.unread_count ??
          0
      );

    return {
      id:
        item.id ||
        item.conversationId ||
        item.conversation_id ||
        null,

      type:
        item.type ||
        "private",

      title:
        item.title ||
        item.name ||
        participant?.name ||
        participant?.displayName ||
        "",

      username:
        item.username ||
        participant?.username ||
        "",

      avatar:
        item.avatar ||
        participant?.avatar ||
        participant?.photo ||
        "",

      online:
        Boolean(
          item.online ??
            participant?.online ??
            false
        ),

      verified:
        Boolean(
          item.verified ??
            participant?.verified ??
            false
        ),

      lastMessage: {
        id:
          lastMessage?.id ||
          null,

        text:
          lastMessage?.text ||
          lastMessage?.body ||
          lastMessage?.content ||
          "",

        type:
          lastMessage?.type ||
          "text",

        senderId:
          lastMessage?.senderId ||
          lastMessage?.sender_id ||
          null,

        createdAt:
          lastMessage?.createdAt ||
          lastMessage?.created_at ||
          null,

        status:
          lastMessage?.status ||
          "",

        deleted:
          Boolean(
            lastMessage?.deleted
          )
      },

      unreadCount:
        unread > 0
          ? unread
          : 0,

      pinned:
        Boolean(
          item.pinned ??
            item.isPinned ??
            item.is_pinned ??
            false
        ),

      muted:
        Boolean(
          item.muted ??
            item.isMuted ??
            item.is_muted ??
            false
        ),

      archived:
        Boolean(
          item.archived ??
            item.isArchived ??
            item.is_archived ??
            false
        ),

      blocked:
        Boolean(
          item.blocked ??
            item.isBlocked ??
            item.is_blocked ??
            false
        ),

      updatedAt:
        item.updatedAt ||
        item.updated_at ||
        lastMessage?.createdAt ||
        lastMessage?.created_at ||
        null,

      createdAt:
        item.createdAt ||
        item.created_at ||
        null,

      raw: item
    };
  }

  /* ---------------------------------------------------------
     Merge
     --------------------------------------------------------- */

  function mergeConversations(
    incoming,
    replace = false
  ) {
    const normalized =
      incoming
        .map(
          normalizeConversation
        )
        .filter(
          Boolean
        )
        .filter(
          (item) => Boolean(item.id)
        );

    if (replace) {
      state.conversations =
        normalized;
    } else {
      const map =
        new Map(
          state.conversations.map(
            (item) => [
              item.id,
              item
            ]
          )
        );

      normalized.forEach(
        (item) => {
          const previous =
            map.get(item.id);

          map.set(
            item.id,
            previous
              ? {
                  ...previous,
                  ...item,
                  lastMessage: {
                    ...previous.lastMessage,
                    ...item.lastMessage
                  }
                }
              : item
          );
        }
      );

      state.conversations =
        Array.from(
          map.values()
        );
    }

    applyFilters();
  }

  /* ---------------------------------------------------------
     Sorting
     --------------------------------------------------------- */

  function getTimestamp(
    conversation
  ) {
    const value =
      conversation?.updatedAt ||
      conversation?.lastMessage
        ?.createdAt ||
      conversation?.createdAt;

    if (!value) {
      return 0;
    }

    const timestamp =
      new Date(
        value
      ).getTime();

    return Number.isNaN(
      timestamp
    )
      ? 0
      : timestamp;
  }

  function sortConversations(
    list
  ) {
    const copy =
      [...list];

    if (
      state.sort ===
      "unread"
    ) {
      return copy.sort(
        (a, b) =>
          b.unreadCount -
          a.unreadCount
      );
    }

    if (
      state.sort ===
      "name"
    ) {
      return copy.sort(
        (a, b) =>
          String(a.title)
            .localeCompare(
              String(b.title),
              "ar",
              {
                sensitivity:
                  "base"
              }
            )
      );
    }

    return copy.sort(
      (a, b) => {
        if (
          a.pinned !==
          b.pinned
        ) {
          return a.pinned
            ? -1
            : 1;
        }

        return (
          getTimestamp(b) -
          getTimestamp(a)
        );
      }
    );
  }

  /* ---------------------------------------------------------
     Filtering
     --------------------------------------------------------- */

  function applyFilters() {
    const query =
      state.searchQuery
        .trim()
        .toLocaleLowerCase(
          "ar"
        );

    let list =
      [...state.conversations];

    switch (
      state.filter
    ) {
      case "unread":
        list =
          list.filter(
            (item) =>
              item.unreadCount >
              0
          );
        break;

      case "pinned":
        list =
          list.filter(
            (item) =>
              item.pinned
          );
        break;

      case "muted":
        list =
          list.filter(
            (item) =>
              item.muted
          );
        break;

      case "archived":
        list =
          list.filter(
            (item) =>
              item.archived
          );
        break;

      case "private":
        list =
          list.filter(
            (item) =>
              item.type ===
              "private"
          );
        break;

      case "groups":
        list =
          list.filter(
            (item) =>
              item.type ===
                "group" ||
              item.type ===
                "community"
          );
        break;

      case "all":
      default:
        list =
          list.filter(
            (item) =>
              !item.archived
          );
        break;
    }

    if (query) {
      list =
        list.filter(
          (item) => {
            const searchable =
              [
                item.title,
                item.username,
                item.lastMessage
                  ?.text
              ]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase(
                  "ar"
                );

            return searchable.includes(
              query
            );
          }
        );
    }

    state.filtered =
      sortConversations(
        list
      );

    renderAll();
  }

  /* ---------------------------------------------------------
     Load
     --------------------------------------------------------- */

  async function load(
    options = {}
  ) {
    const {
      page = 1,
      append = false,
      silent = false
    } = options;

    if (
      state.loading ||
      (
        state.loadingMore &&
        append
      )
    ) {
      return;
    }

    if (
      append &&
      !state.hasMore
    ) {
      return;
    }

    if (
      state.abortController
    ) {
      state.abortController.abort();
    }

    state.abortController =
      new AbortController();

    if (append) {
      state.loadingMore =
        true;
    } else {
      state.loading =
        true;
    }

    renderLoading(
      !silent
    );

    try {
      const query =
        new URLSearchParams();

      query.set(
        "page",
        String(page)
      );

      query.set(
        "limit",
        String(
          state.perPage
        )
      );

      const payload =
        await apiRequest(
          `${CONFIG.api?.endpoints?.conversations || "/conversations"}?${query.toString()}`,
          {
            method: "GET",
            signal:
              state
                .abortController
                .signal
          }
        );

      const list =
        extractList(
          payload
        );

      const meta =
        extractMeta(
          payload
        );

      mergeConversations(
        list,
        !append
      );

      state.page =
        Number(
          meta.page ||
            page
        );

      const totalPages =
        Number(
          meta.totalPages ||
            meta.total_pages ||
            0
        );

      if (
        totalPages
      ) {
        state.hasMore =
          state.page <
          totalPages;
      } else if (
        typeof meta.hasMore ===
        "boolean"
      ) {
        state.hasMore =
          meta.hasMore;
      } else {
        state.hasMore =
          list.length >=
          state.perPage;
      }

      renderAll();

      return state.filtered;
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        return;
      }

      warn(
        "Failed to load conversations:",
        error
      );

      renderError(
        error
      );

      throw error;
    } finally {
      state.loading =
        false;

      state.loadingMore =
        false;

      state.abortController =
        null;

      renderLoading(
        false
      );
    }
  }

  async function loadMore() {
    return load({
      page:
        state.page + 1,
      append: true
    });
  }

  /* ---------------------------------------------------------
     Actions
     --------------------------------------------------------- */

  async function pin(
    conversationId,
    value = true
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      await apiRequest(
        `${CONFIG.api?.endpoints?.conversations || "/conversations"}/${encodeURIComponent(conversationId)}/pin`,
        {
          method:
            value
              ? "POST"
              : "DELETE"
        }
      );

      updateLocal(
        conversationId,
        {
          pinned:
            value
        }
      );

      return true;
    } catch (error) {
      warn(
        "Pin failed:",
        error
      );

      return false;
    }
  }

  async function mute(
    conversationId,
    value = true
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      await apiRequest(
        `${CONFIG.api?.endpoints?.conversations || "/conversations"}/${encodeURIComponent(conversationId)}/mute`,
        {
          method:
            value
              ? "POST"
              : "DELETE"
        }
      );

      updateLocal(
        conversationId,
        {
          muted:
            value
        }
      );

      return true;
    } catch (error) {
      warn(
        "Mute failed:",
        error
      );

      return false;
    }
  }

  async function archive(
    conversationId,
    value = true
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      await apiRequest(
        `${CONFIG.api?.endpoints?.conversations || "/conversations"}/${encodeURIComponent(conversationId)}/archive`,
        {
          method:
            value
              ? "POST"
              : "DELETE"
        }
      );

      updateLocal(
        conversationId,
        {
          archived:
            value
        }
      );

      return true;
    } catch (error) {
      warn(
        "Archive failed:",
        error
      );

      return false;
    }
  }

  async function remove(
    conversationId
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      await apiRequest(
        `${CONFIG.api?.endpoints?.conversations || "/conversations"}/${encodeURIComponent(conversationId)}`,
        {
          method:
            "DELETE"
        }
      );

      state.conversations =
        state.conversations.filter(
          (item) =>
            item.id !==
            conversationId
        );

      if (
        state.selectedId ===
        conversationId
      ) {
        state.selectedId =
          null;
      }

      applyFilters();

      return true;
    } catch (error) {
      warn(
        "Delete conversation failed:",
        error
      );

      return false;
    }
  }

  async function markRead(
    conversationId
  ) {
    if (!conversationId) {
      return false;
    }

    try {
      await apiRequest(
        `${CONFIG.api?.endpoints?.conversations || "/conversations"}/${encodeURIComponent(conversationId)}/read`,
        {
          method:
            "POST"
        }
      );

      updateLocal(
        conversationId,
        {
          unreadCount: 0
        }
      );

      return true;
    } catch (error) {
      warn(
        "Mark read failed:",
        error
      );

      return false;
    }
  }

  /* ---------------------------------------------------------
     Local State
     --------------------------------------------------------- */

  function updateLocal(
    conversationId,
    changes
  ) {
    const index =
      state.conversations.findIndex(
        (item) =>
          item.id ===
          conversationId
      );

    if (
      index === -1
    ) {
      return false;
    }

    state.conversations[
      index
    ] = {
      ...state.conversations[
        index
      ],
      ...changes
    };

    applyFilters();

    return true;
  }

  function select(
    conversationId
  ) {
    state.selectedId =
      conversationId ||
      null;

    updateActiveState();

    return get(
      conversationId
    );
  }

  function get(
    conversationId
  ) {
    return (
      state.conversations.find(
        (item) =>
          item.id ===
          conversationId
      ) ||
      null
    );
  }

  /* ---------------------------------------------------------
     Open Conversation
     --------------------------------------------------------- */

  function open(
    conversationId
  ) {
    const conversation =
      get(
        conversationId
      );

    if (!conversation) {
      return false;
    }

    select(
      conversationId
    );

    const route =
      APP.getRoute
        ? APP.getRoute(
            "pages.chat"
          )
        : "pages/chat.html";

    const url =
      new URL(
        route,
        window.location.href
      );

    url.searchParams.set(
      "conversation",
      conversationId
    );

    window.location.href =
      url.toString();

    return true;
  }

  /* ---------------------------------------------------------
     Rendering
     --------------------------------------------------------- */

  function getContainers() {
    return Array.from(
      document.querySelectorAll(
        "[data-conversations-list]"
      )
    );
  }

  function renderAll() {
    const containers =
      getContainers();

    if (!containers.length) {
      return;
    }

    containers.forEach(
      (container) => {
        renderContainer(
          container
        );
      }
    );

    updateActiveState();
  }

  function renderContainer(
    container
  ) {
    if (
      !container
    ) {
      return;
    }

    const list =
      state.filtered;

    if (
      state.loading &&
      !list.length
    ) {
      container.innerHTML =
        renderSkeletons();

      return;
    }

    if (!list.length) {
      container.innerHTML =
        renderEmptyState();

      return;
    }

    const fragment =
      document.createDocumentFragment();

    list.forEach(
      (conversation) => {
        const wrapper =
          document.createElement(
            "div"
          );

        wrapper.innerHTML =
          renderConversation(
            conversation
          );

        const element =
          wrapper.firstElementChild;

        if (element) {
          fragment.appendChild(
            element
          );
        }
      }
    );

    container.replaceChildren(
      fragment
    );

    bindContainer(
      container
    );
  }

  function renderConversation(
    conversation
  ) {
    const selected =
      state.selectedId ===
      conversation.id;

    const title =
      conversation.title ||
      "محادثة";

    const preview =
      getPreviewText(
        conversation
      );

    const time =
      formatTime(
        conversation.updatedAt ||
          conversation.lastMessage
            ?.createdAt
      );

    const avatar =
      conversation.avatar;

    const avatarMarkup =
      avatar
        ? `
          <img
            src="${escapeHTML(
              avatar
            )}"
            alt=""
            loading="lazy"
            class="nova-chat-avatar-image"
          >
        `
        : `
          <span
            class="nova-chat-avatar-fallback"
            aria-hidden="true"
          >
            ${escapeHTML(
              getInitial(
                title
              )
            )}
          </span>
        `;

    return `
      <article
        class="nova-conversation-item ${
          selected
            ? "is-active"
            : ""
        } ${
          conversation.unreadCount >
          0
            ? "has-unread"
            : ""
        } ${
          conversation.pinned
            ? "is-pinned"
            : ""
        }"
        data-conversation-id="${escapeHTML(
          conversation.id
        )}"
        tabindex="0"
        role="button"
        aria-current="${
          selected
            ? "page"
            : "false"
        }"
      >

        <div class="nova-chat-avatar">
          ${avatarMarkup}

          ${
            conversation.online
              ? `
                <span
                  class="nova-chat-online"
                  aria-label="متصل الآن"
                ></span>
              `
              : ""
          }
        </div>

        <div class="nova-conversation-main">

          <div class="nova-conversation-top">

            <div class="nova-conversation-title">

              <span class="nova-conversation-name">
                ${escapeHTML(
                  title
                )}
              </span>

              ${
                conversation.verified
                  ? `
                    <span
                      class="nova-verified"
                      title="حساب موثق"
                      aria-label="حساب موثق"
                    >
                      ✓
                    </span>
                  `
                  : ""
              }

            </div>

            <time
              class="nova-conversation-time"
              datetime="${
                conversation.updatedAt ||
                ""
              }"
            >
              ${escapeHTML(
                time
              )}
            </time>

          </div>

          <div class="nova-conversation-bottom">

            <div class="nova-conversation-preview">

              ${
                conversation.lastMessage
                  ?.senderId &&
                isCurrentUser(
                  conversation.lastMessage
                    .senderId
                )
                  ? `
                    <span class="nova-message-owner">
                      أنت:
                    </span>
                  `
                  : ""
              }

              <span>
                ${escapeHTML(
                  preview
                )}
              </span>

            </div>

            <div class="nova-conversation-meta">

              ${
                conversation.pinned
                  ? `
                    <span
                      class="nova-chat-meta-icon"
                      title="مثبتة"
                      aria-label="مثبتة"
                    >
                      📌
                    </span>
                  `
                  : ""
              }

              ${
                conversation.muted
                  ? `
                    <span
                      class="nova-chat-meta-icon"
                      title="مكتومة"
                      aria-label="مكتومة"
                    >
                      🔕
                    </span>
                  `
                  : ""
              }

              ${
                conversation.unreadCount >
                0
                  ? `
                    <span
                      class="nova-unread-badge"
                      aria-label="${
                        conversation.unreadCount
                      } رسائل غير مقروءة"
                    >
                      ${
                        conversation.unreadCount >
                        99
                          ? "99+"
                          : conversation.unreadCount
                      }
                    </span>
                  `
                  : ""
              }

            </div>

          </div>

        </div>

        <button
          type="button"
          class="nova-conversation-menu"
          data-conversation-menu
          aria-label="خيارات المحادثة"
          aria-expanded="false"
        >
          ⋮
        </button>

      </article>
    `;
  }

  function renderSkeletons() {
    return Array.from(
      {
        length: 6
      },
      () => `
        <div class="nova-conversation-skeleton">
          <span></span>
          <div>
            <i></i>
            <b></b>
          </div>
        </div>
      `
    ).join("");
  }

  function renderEmptyState() {
    const hasSearch =
      Boolean(
        state.searchQuery
      );

    return `
      <div class="nova-conversations-empty">

        <div class="nova-empty-icon">
          ${
            hasSearch
              ? "⌕"
              : "✦"
          }
        </div>

        <h3>
          ${
            hasSearch
              ? "لا توجد نتائج"
              : "لا توجد محادثات"
          }
        </h3>

        <p>
          ${
            hasSearch
              ? "جرّب البحث بكلمة أخرى."
              : "عندما تبدأ محادثة ستظهر هنا."
          }
        </p>

      </div>
    `;
  }

  function renderError(
    error
  ) {
    const containers =
      getContainers();

    containers.forEach(
      (container) => {
        container.innerHTML = `
          <div class="nova-conversations-error">

            <div class="nova-error-icon">
              !
            </div>

            <h3>
              تعذر تحميل المحادثات
            </h3>

            <p>
              ${
                error?.status ===
                401
                  ? "انتهت جلسة تسجيل الدخول."
                  : "حدث خطأ أثناء الاتصال بالخادم."
              }
            </p>

            <button
              type="button"
              data-conversations-retry
            >
              إعادة المحاولة
            </button>

          </div>
        `;
      }
    );

    document
      .querySelectorAll(
        "[data-conversations-retry]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => load()
          );
        }
      );
  }

  function renderLoading(
    visible
  ) {
    document
      .querySelectorAll(
        "[data-conversations-loading]"
      )
      .forEach(
        (element) => {
          element.hidden =
            !visible;
        }
      );
  }

  /* ---------------------------------------------------------
     Preview
     --------------------------------------------------------- */

  function getPreviewText(
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

    switch (
      message.type
    ) {
      case "image":
        return "📷 صورة";

      case "video":
        return "🎬 فيديو";

      case "audio":
        return "🎵 ملف صوتي";

      case "voice":
        return "🎙️ رسالة صوتية";

      case "document":
        return "📄 مستند";

      case "location":
        return "📍 موقع";

      case "contact":
        return "👤 جهة اتصال";

      case "sticker":
        return "✨ ملصق";

      default:
        return (
          message.text ||
          "رسالة"
        );
    }
  }

  function formatTime(
    value
  ) {
    if (!value) {
      return "";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    const now =
      new Date();

    const sameDay =
      date.toDateString() ===
      now.toDateString();

    if (sameDay) {
      return new Intl.DateTimeFormat(
        "ar-EG",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      ).format(date);
    }

    const diff =
      now.getTime() -
      date.getTime();

    const oneDay =
      86400000;

    if (
      diff >= 0 &&
      diff <
        oneDay * 7
    ) {
      return new Intl.DateTimeFormat(
        "ar-EG",
        {
          weekday:
            "short"
        }
      ).format(date);
    }

    return new Intl.DateTimeFormat(
      "ar-EG",
      {
        day: "2-digit",
        month: "2-digit"
      }
    ).format(date);
  }

  function getInitial(
    value
  ) {
    return (
      String(
        value || "N"
      )
        .trim()
        .charAt(0)
        .toUpperCase() ||
      "N"
    );
  }

  function isCurrentUser(
    userId
  ) {
    try {
      const user =
        window.NOVA_AUTH?.getCurrentUser?.();

      return (
        Boolean(
          user?.id
        ) &&
        String(user.id) ===
          String(userId)
      );
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------
     Search / Filters
     --------------------------------------------------------- */

  function search(
    query
  ) {
    state.searchQuery =
      String(
        query || ""
      );

    applyFilters();

    return state.filtered;
  }

  function setFilter(
    filter
  ) {
    const allowed = [
      "all",
      "unread",
      "pinned",
      "muted",
      "archived",
      "private",
      "groups"
    ];

    state.filter =
      allowed.includes(
        filter
      )
        ? filter
        : "all";

    applyFilters();
  }

  function setSort(
    sort
  ) {
    const allowed = [
      "recent",
      "unread",
      "name"
    ];

    state.sort =
      allowed.includes(
        sort
      )
        ? sort
        : "recent";

    applyFilters();
  }

  /* ---------------------------------------------------------
     DOM Binding
     --------------------------------------------------------- */

  function bindContainer(
    container
  ) {
    if (
      state.initializedContainers.has(
        container
      )
    ) {
      // العناصر نفسها اتغيرت،
      // لذلك event delegation يتم
      // ربطه مرة واحدة فقط.
      return;
    }

    state.initializedContainers.add(
      container
    );

    container.addEventListener(
      "click",
      handleContainerClick
    );

    container.addEventListener(
      "keydown",
      handleContainerKeydown
    );
  }

  function handleContainerClick(
    event
  ) {
    const menu =
      event.target.closest(
        "[data-conversation-menu]"
      );

    if (menu) {
      event.stopPropagation();

      const item =
        menu.closest(
          "[data-conversation-id]"
        );

      if (!item) {
        return;
      }

      toggleConversationMenu(
        item,
        menu
      );

      return;
    }

    const item =
      event.target.closest(
        "[data-conversation-id]"
      );

    if (!item) {
      return;
    }

    const id =
      item.dataset
        .conversationId;

    if (id) {
      open(id);
    }
  }

  function handleContainerKeydown(
    event
  ) {
    if (
      event.key !==
      "Enter"
    ) {
      return;
    }

    const item =
      event.target.closest(
        "[data-conversation-id]"
      );

    if (!item) {
      return;
    }

    const id =
      item.dataset
        .conversationId;

    if (id) {
      event.preventDefault();
      open(id);
    }
  }

  function toggleConversationMenu(
    item,
    button
  ) {
    closeConversationMenus(
      button
    );

    const conversation =
      get(
        item.dataset
          .conversationId
      );

    if (!conversation) {
      return;
    }

    const menu =
      document.createElement(
        "div"
      );

    menu.className =
      "nova-conversation-context-menu";

    menu.innerHTML = `
      <button
        type="button"
        data-action="pin"
      >
        ${
          conversation.pinned
            ? "إلغاء التثبيت"
            : "تثبيت المحادثة"
        }
      </button>

      <button
        type="button"
        data-action="mute"
      >
        ${
          conversation.muted
            ? "إلغاء الكتم"
            : "كتم الإشعارات"
        }
      </button>

      <button
        type="button"
        data-action="archive"
      >
        ${
          conversation.archived
            ? "إلغاء الأرشفة"
            : "أرشفة المحادثة"
        }
      </button>

      <button
        type="button"
        data-action="read"
      >
        ${
          conversation.unreadCount >
          0
            ? "تحديد كمقروءة"
            : "تحديد كغير مقروءة"
        }
      </button>

      <button
        type="button"
        data-action="delete"
        class="is-danger"
      >
        حذف المحادثة
      </button>
    `;

    document.body.appendChild(
      menu
    );

    const rect =
      button.getBoundingClientRect();

    const menuWidth =
      210;

    let left =
      rect.left -
      menuWidth +
      rect.width;

    if (
      left < 12
    ) {
      left = 12;
    }

    let top =
      rect.bottom +
      8;

    if (
      top +
        260 >
      window.innerHeight
    ) {
      top =
        rect.top -
        260;
    }

    menu.style.position =
      "fixed";

    menu.style.left =
      `${left}px`;

    menu.style.top =
      `${Math.max(
        12,
        top
      )}px`;

    menu.addEventListener(
      "click",
      async (event) => {
        const action =
          event.target.closest(
            "[data-action]"
          )?.dataset.action;

        if (!action) {
          return;
        }

        menu.remove();

        switch (
          action
        ) {
          case "pin":
            await pin(
              conversation.id,
              !conversation.pinned
            );
            break;

          case "mute":
            await mute(
              conversation.id,
              !conversation.muted
            );
            break;

          case "archive":
            await archive(
              conversation.id,
              !conversation.archived
            );
            break;

          case "read":
            if (
              conversation.unreadCount >
              0
            ) {
              await markRead(
                conversation.id
              );
            }
            break;

          case "delete":
            await remove(
              conversation.id
            );
            break;
        }
      }
    );

    button.setAttribute(
      "aria-expanded",
      "true"
    );

    const close =
      (event) => {
        if (
          !menu.contains(
            event.target
          ) &&
          event.target !==
            button
        ) {
          menu.remove();

          button.setAttribute(
            "aria-expanded",
            "false"
          );

          document.removeEventListener(
            "pointerdown",
            close
          );
        }
      };

    setTimeout(
      () => {
        document.addEventListener(
          "pointerdown",
          close
        );
      },
      0
    );
  }

  function closeConversationMenus(
    exceptButton = null
  ) {
    document
      .querySelectorAll(
        ".nova-conversation-context-menu"
      )
      .forEach(
        (menu) => {
          menu.remove();
        }
      );

    document
      .querySelectorAll(
        "[data-conversation-menu]"
      )
      .forEach(
        (button) => {
          if (
            button !==
            exceptButton
          ) {
            button.setAttribute(
              "aria-expanded",
              "false"
            );
          }
        }
      );
  }

  function updateActiveState() {
    document
      .querySelectorAll(
        "[data-conversation-id]"
      )
      .forEach(
        (element) => {
          const active =
            element.dataset
              .conversationId ===
            state.selectedId;

          element.classList.toggle(
            "is-active",
            active
          );

          element.setAttribute(
            "aria-current",
            active
              ? "page"
              : "false"
          );
        }
      );
  }

  /* ---------------------------------------------------------
     Search Inputs
     --------------------------------------------------------- */

  function bindSearch() {
    document
      .querySelectorAll(
        "[data-conversations-search]"
      )
      .forEach(
        (input) => {
          if (
            input.dataset
              .novaBound ===
            "true"
          ) {
            return;
          }

          input.dataset
            .novaBound =
            "true";

          input.addEventListener(
            "input",
            () => {
              search(
                input.value
              );
            }
          );
        }
      );
  }

  function bindFilters() {
    document
      .querySelectorAll(
        "[data-conversations-filter]"
      )
      .forEach(
        (element) => {
          if (
            element.dataset
              .novaBound ===
            "true"
          ) {
            return;
          }

          element.dataset
            .novaBound =
            "true";

          element.addEventListener(
            "click",
            () => {
              setFilter(
                element.dataset
                  .conversationsFilter
              );

              document
                .querySelectorAll(
                  "[data-conversations-filter]"
                )
                .forEach(
                  (item) => {
                    item.classList.toggle(
                      "is-active",
                      item ===
                        element
                    );
                  }
                );
            }
          );
        }
      );
  }

  function bindSort() {
    document
      .querySelectorAll(
        "[data-conversations-sort]"
      )
      .forEach(
        (element) => {
          if (
            element.dataset
              .novaBound ===
            "true"
          ) {
            return;
          }

          element.dataset
            .novaBound =
            "true";

          element.addEventListener(
            "change",
            () => {
              setSort(
                element.value
              );
            }
          );
        }
      );
  }

  function bindLoadMore() {
    document
      .querySelectorAll(
        "[data-conversations-load-more]"
      )
      .forEach(
        (button) => {
          if (
            button.dataset
              .novaBound ===
            "true"
          ) {
            return;
          }

          button.dataset
            .novaBound =
            "true";

          button.addEventListener(
            "click",
            () => {
              loadMore();
            }
          );
        }
      );
  }

  /* ---------------------------------------------------------
     Realtime
     --------------------------------------------------------- */

  function bindRealtime() {
    if (
      document.documentElement
        .dataset
        .novaChatsRealtimeBound ===
      "true"
    ) {
      return;
    }

    document.documentElement
      .dataset
      .novaChatsRealtimeBound =
      "true";

    document.addEventListener(
      "nova:realtime:message",
      (event) => {
        handleRealtimeMessage(
          event.detail
            ?.message ||
            event.detail
        );
      }
    );

    document.addEventListener(
      "nova:realtime:message:update",
      (event) => {
        handleRealtimeMessage(
          event.detail
            ?.message ||
            event.detail
        );
      }
    );

    document.addEventListener(
      "nova:realtime:read",
      (event) => {
        const data =
          event.detail ||
          {};

        if (
          data.conversationId
        ) {
          updateLocal(
            data.conversationId,
            {
              unreadCount: 0
            }
          );
        }
      }
    );

    document.addEventListener(
      "nova:realtime:conversation:update",
      (event) => {
        handleRealtimeConversation(
          event.detail
        );
      }
    );

    document.addEventListener(
      "nova:realtime:presence",
      (event) => {
        handleRealtimePresence(
          event.detail
        );
      }
    );
  }

  function handleRealtimeMessage(
    message
  ) {
    if (
      !message
    ) {
      return;
    }

    const conversationId =
      message.conversationId ||
      message.conversation_id;

    if (
      !conversationId
    ) {
      return;
    }

    const existing =
      get(
        conversationId
      );

    if (!existing) {
      /*
       * لا ننشئ محادثة وهمية.
       * سيتم تحميلها من السيرفر.
       */
      return;
    }

    const isMine =
      isCurrentUser(
        message.senderId ||
          message.sender_id
      );

    updateLocal(
      conversationId,
      {
        lastMessage: {
          id:
            message.id ||
            null,

          text:
            message.text ||
            message.body ||
            message.content ||
            "",

          type:
            message.type ||
            "text",

          senderId:
            message.senderId ||
            message.sender_id ||
            null,

          createdAt:
            message.createdAt ||
            message.created_at ||
            new Date().toISOString(),

          status:
            message.status ||
            "received"
        },

        updatedAt:
          message.createdAt ||
          message.created_at ||
          new Date().toISOString(),

        unreadCount:
          isMine
            ? existing.unreadCount
            : existing.unreadCount +
              (
                state.selectedId ===
                conversationId
                  ? 0
                  : 1
              )
      }
    );
  }

  function handleRealtimeConversation(
    data
  ) {
    const conversation =
      normalizeConversation(
        data?.conversation ||
          data
      );

    if (
      !conversation?.id
    ) {
      return;
    }

    mergeConversations(
      [conversation],
      false
    );
  }

  function handleRealtimePresence(
    data
  ) {
    const userId =
      data?.userId ||
      data?.user_id;

    if (!userId) {
      return;
    }

    state.conversations =
      state.conversations.map(
        (conversation) => {
          const matches =
            String(
              conversation.raw
                ?.participant
                ?.id ||
                conversation.raw
                  ?.otherUser
                  ?.id ||
                conversation.raw
                  ?.other_user
                  ?.id ||
                ""
            ) ===
            String(userId);

          if (!matches) {
            return conversation;
          }

          return {
            ...conversation,
            online:
              Boolean(
                data.online
              )
          };
        }
      );

    applyFilters();
  }

  /* ---------------------------------------------------------
     Page Events
     --------------------------------------------------------- */

  function bindGlobalEvents() {
    window.addEventListener(
      "nova:chat:opened",
      (event) => {
        const id =
          event.detail
            ?.conversationId;

        if (id) {
          select(id);
        }
      }
    );

    window.addEventListener(
      "beforeunload",
      () => {
        if (
          state.abortController
        ) {
          state.abortController.abort();
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Initialization
     --------------------------------------------------------- */

  async function init() {
    if (
      state.initialized
    ) {
      return;
    }

    state.initialized =
      true;

    bindSearch();
    bindFilters();
    bindSort();
    bindLoadMore();
    bindRealtime();
    bindGlobalEvents();

    const params =
      new URLSearchParams(
        window.location.search
      );

    const conversationParam =
      params.get(
        "conversation"
      );

    if (
      conversationParam
    ) {
      state.selectedId =
        conversationParam;
    }

    try {
      await load();
    } catch {
      // تم التعامل مع الخطأ داخل load().
    }
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.NOVA_CHATS = {
    state,

    init,

    load,
    loadMore,

    search,
    setFilter,
    setSort,

    get,

    select,
    open,

    pin,
    mute,
    archive,
    remove,
    markRead,

    updateLocal,

    getConversations() {
      return [
        ...state.conversations
      ];
    },

    getFiltered() {
      return [
        ...state.filtered
      ];
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
