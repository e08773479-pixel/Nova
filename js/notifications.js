/* =========================================================
   NOVA — Notifications Engine
   File: js/notifications.js
   Version: 1.0.0

   المسؤول عن:
   - تحميل الإشعارات من API
   - Pagination
   - عداد الإشعارات غير المقروءة
   - تعليم إشعار كمقروء
   - تعليم كل الإشعارات كمقروءة
   - حذف إشعار
   - حذف كل الإشعارات
   - فتح الرابط المرتبط بالإشعار
   - Rendering آمن
   - عدم إنشاء أي إشعارات وهمية
   ========================================================= */

(() => {
  "use strict";

  const CONFIG =
    window.APP_CONFIG || {};

  const APP =
    window.APP || {};

  const API_BASE =
    String(
      CONFIG.api?.baseURL ||
      "/api"
    ).replace(
      /\/+$/g,
      ""
    );

  const API_VERSION =
    String(
      CONFIG.api?.version ||
      "v1"
    ).replace(
      /^\/+|\/+$/g,
      ""
    );

  const ENDPOINT =
    `${API_BASE}/${API_VERSION}/notifications`;

  const state = {
    initialized: false,

    loading: false,
    markingAllRead: false,
    deletingAll: false,

    notifications: [],

    unreadCount: 0,

    pagination: {
      page: 1,
      limit: 30,
      hasMore: false
    }
  };

  /* =========================================================
     HTTP
     ========================================================= */

  function jsonHeaders() {
    return {
      "Accept":
        "application/json",

      "Content-Type":
        "application/json"
    };
  }

  async function request(
    url,
    options = {}
  ) {
    const requestConfig = {
      method:
        options.method ||
        "GET",

      credentials:
        CONFIG.api?.credentials ===
        "include"
          ? "include"
          : "same-origin",

      headers: {
        Accept:
          "application/json",

        ...(options.headers || {})
      }
    };

    if (
      options.body !==
      undefined
    ) {
      requestConfig.body =
        options.body;
    }

    const response =
      await fetch(
        url,
        requestConfig
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
      try {
        data =
          await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        const text =
          await response.text();

        data =
          text
            ? {
                message: text
              }
            : null;
      } catch {
        data = null;
      }
    }

    if (
      !response.ok
    ) {
      const error =
        new Error(
          data?.message ||
          data?.error ||
          `HTTP ${response.status}`
        );

      error.status =
        response.status;

      error.data =
        data;

      throw error;
    }

    return data;
  }

  /* =========================================================
     Helpers
     ========================================================= */

  function emit(
    event,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(
        `nova:notifications:${event}`,
        {
          detail
        }
      )
    );
  }

  function escapeHTML(
    value
  ) {
    return String(
      value ?? ""
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

  function safeURL(
    value
  ) {
    if (!value) {
      return "";
    }

    try {
      const url =
        new URL(
          value,
          window.location.origin
        );

      if (
        url.protocol ===
          "http:" ||
        url.protocol ===
          "https:"
      ) {
        return url.href;
      }

      return "";
    } catch {
      return "";
    }
  }

  function notificationId(
    notification
  ) {
    return (
      notification?.id ??
      notification?._id ??
      notification?.notificationId ??
      ""
    );
  }

  function isRead(
    notification
  ) {
    return (
      notification?.read === true ||
      notification?.isRead === true ||
      notification?.readAt != null
    );
  }

  function getNotificationType(
    notification
  ) {
    return String(
      notification?.type ||
      notification?.event ||
      "general"
    ).toLowerCase();
  }

  function getNotificationActor(
    notification
  ) {
    return (
      notification?.actor ||
      notification?.user ||
      notification?.sender ||
      null
    );
  }

  function getActorName(
    notification
  ) {
    const actor =
      getNotificationActor(
        notification
      );

    return (
      actor?.name ||
      actor?.displayName ||
      notification?.actorName ||
      notification?.userName ||
      ""
    );
  }

  function getActorAvatar(
    notification
  ) {
    const actor =
      getNotificationActor(
        notification
      );

    return safeURL(
      actor?.avatar ||
      actor?.avatarUrl ||
      actor?.photo ||
      notification?.actorAvatar ||
      ""
    );
  }

  function getNotificationTitle(
    notification
  ) {
    return (
      notification?.title ||
      ""
    );
  }

  function getNotificationMessage(
    notification
  ) {
    return (
      notification?.message ||
      notification?.body ||
      notification?.content ||
      ""
    );
  }

  function getCreatedAt(
    notification
  ) {
    return (
      notification?.createdAt ||
      notification?.created_at ||
      notification?.date ||
      null
    );
  }

  function getActionURL(
    notification
  ) {
    return safeURL(
      notification?.actionUrl ||
      notification?.url ||
      notification?.link ||
      ""
    );
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

    const difference =
      Math.max(
        0,
        Date.now() -
          date.getTime()
      );

    const minute =
      60 * 1000;

    const hour =
      60 * minute;

    const day =
      24 * hour;

    if (
      difference <
      minute
    ) {
      return "الآن";
    }

    if (
      difference <
      hour
    ) {
      const minutes =
        Math.floor(
          difference /
            minute
        );

      return `منذ ${minutes} دقيقة`;
    }

    if (
      difference <
      day
    ) {
      const hours =
        Math.floor(
          difference /
            hour
        );

      return `منذ ${hours} ساعة`;
    }

    return new Intl.DateTimeFormat(
      "ar-EG",
      {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
      }
    ).format(date);
  }

  function getTypeIcon(
    type
  ) {
    const icons = {
      message: "💬",
      reaction: "❤️",
      mention: "@",
      group: "👥",
      community: "◈",
      call: "📞",
      security: "🔐",
      contact: "👤",
      system: "ℹ",
      general: "•"
    };

    return (
      icons[type] ||
      icons.general
    );
  }

  /* =========================================================
     Normalize API Response
     ========================================================= */

  function normalizeNotifications(
    data
  ) {
    if (
      Array.isArray(data)
    ) {
      return data;
    }

    if (
      Array.isArray(
        data?.notifications
      )
    ) {
      return data.notifications;
    }

    if (
      Array.isArray(
        data?.data
      )
    ) {
      return data.data;
    }

    return [];
  }

  function readUnreadCount(
    data,
    notifications
  ) {
    const serverCount =
      data?.unreadCount ??
      data?.meta?.unreadCount ??
      data?.pagination?.unreadCount;

    if (
      Number.isFinite(
        Number(serverCount)
      )
    ) {
      return Math.max(
        0,
        Number(serverCount)
      );
    }

    /*
     * لو الخادم لم يرسل عدادًا،
     * نحسب فقط من الإشعارات التي استلمناها.
     *
     * لا ندّعي أن هذا هو العدد الكلي
     * إذا كانت الصفحة الحالية مجرد Pagination.
     */
    return notifications.filter(
      (notification) =>
        !isRead(notification)
    ).length;
  }

  /* =========================================================
     Fetch
     ========================================================= */

  async function fetchNotifications(
    options = {}
  ) {
    if (
      state.loading &&
      !options.force
    ) {
      return {
        success: false,
        notifications: []
      };
    }

    state.loading = true;

    const page =
      Number(
        options.page ||
        state.pagination.page
      );

    const limit =
      Number(
        options.limit ||
        state.pagination.limit
      );

    try {
      const params =
        new URLSearchParams();

      params.set(
        "page",
        String(page)
      );

      params.set(
        "limit",
        String(limit)
      );

      if (
        options.unreadOnly
      ) {
        params.set(
          "unread",
          "true"
        );
      }

      if (
        options.type
      ) {
        params.set(
          "type",
          String(
            options.type
          )
        );
      }

      const data =
        await request(
          `${ENDPOINT}?${params}`,
          {
            method: "GET"
          }
        );

      const notifications =
        normalizeNotifications(
          data
        );

      if (
        page === 1
      ) {
        state.notifications =
          notifications;
      } else {
        state.notifications =
          [
            ...state.notifications,
            ...notifications
          ];
      }

      state.unreadCount =
        readUnreadCount(
          data,
          state.notifications
        );

      state.pagination.page =
        page;

      state.pagination.hasMore =
        Boolean(
          data?.pagination?.hasMore ??
          data?.meta?.hasMore ??
          false
        );

      emit(
        "loaded",
        {
          notifications,
          unreadCount:
            state.unreadCount,
          page
        }
      );

      updateNotificationBadges();

      return {
        success: true,
        notifications,
        unreadCount:
          state.unreadCount,
        pagination:
          data?.pagination ||
          data?.meta ||
          null
      };

    } catch (error) {
      console.error(
        "[NOVA NOTIFICATIONS] Load failed:",
        error
      );

      emit(
        "error",
        {
          operation:
            "load",
          error
        }
      );

      return {
        success: false,
        notifications: [],
        error
      };

    } finally {
      state.loading =
        false;
    }
  }

  async function loadMore() {
    if (
      state.loading ||
      !state.pagination.hasMore
    ) {
      return {
        success: false
      };
    }

    return fetchNotifications({
      page:
        state.pagination.page +
        1
    });
  }

  /* =========================================================
     Unread Count
     ========================================================= */

  async function fetchUnreadCount() {
    try {
      const data =
        await request(
          `${ENDPOINT}/unread-count`,
          {
            method: "GET"
          }
        );

      const count =
        Number(
          data?.unreadCount ??
          data?.count ??
          data?.data?.unreadCount ??
          0
        );

      state.unreadCount =
        Number.isFinite(count)
          ? Math.max(
              0,
              count
            )
          : 0;

      updateNotificationBadges();

      emit(
        "countUpdated",
        {
          count:
            state.unreadCount
        }
      );

      return {
        success: true,
        count:
          state.unreadCount
      };

    } catch (error) {
      console.warn(
        "[NOVA NOTIFICATIONS] Count request failed:",
        error
      );

      return {
        success: false,
        count:
          state.unreadCount,
        error
      };
    }
  }

  function updateNotificationBadges() {
    const badges =
      document.querySelectorAll(
        "[data-notifications-count]"
      );

    badges.forEach(
      (badge) => {
        const count =
          state.unreadCount;

        if (
          count <= 0
        ) {
          badge.textContent =
            "";

          badge.hidden =
            true;

          badge.removeAttribute(
            "data-count"
          );

          return;
        }

        badge.hidden =
          false;

        badge.dataset.count =
          String(count);

        badge.textContent =
          count > 99
            ? "99+"
            : String(count);
      }
    );

    const ariaTargets =
      document.querySelectorAll(
        "[data-notifications-button]"
      );

    ariaTargets.forEach(
      (button) => {
        button.setAttribute(
          "aria-label",
          countAriaLabel()
        );
      }
    );
  }

  function countAriaLabel() {
    if (
      state.unreadCount <= 0
    ) {
      return "الإشعارات";
    }

    return `الإشعارات، ${state.unreadCount} غير مقروء`;
  }

  /* =========================================================
     Mark Read
     ========================================================= */

  async function markAsRead(
    id
  ) {
    if (!id) {
      throw new Error(
        "معرّف الإشعار غير موجود."
      );
    }

    const encodedId =
      encodeURIComponent(
        String(id)
      );

    const data =
      await request(
        `${ENDPOINT}/${encodedId}/read`,
        {
          method: "PATCH",
          headers:
            jsonHeaders(),
          body:
            JSON.stringify({
              read: true
            })
        }
      );

    const notification =
      state.notifications.find(
        (item) =>
          String(
            notificationId(
              item
            )
          ) ===
          String(id)
      );

    if (
      notification &&
      !isRead(notification)
    ) {
      notification.read =
        true;

      notification.isRead =
        true;

      if (
        state.unreadCount >
        0
      ) {
        state.unreadCount--;
      }
    }

    updateNotificationBadges();

    emit(
      "read",
      {
        id,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  async function markAllAsRead() {
    if (
      state.markingAllRead
    ) {
      return {
        success: false
      };
    }

    state.markingAllRead =
      true;

    try {
      const data =
        await request(
          `${ENDPOINT}/read-all`,
          {
            method: "PATCH",
            headers:
              jsonHeaders(),
            body:
              JSON.stringify({
                read: true
              })
          }
        );

      state.notifications =
        state.notifications.map(
          (
            notification
          ) => ({
            ...notification,
            read: true,
            isRead: true
          })
        );

      state.unreadCount =
        0;

      updateNotificationBadges();

      renderAll();

      emit(
        "allRead",
        {
          data
        }
      );

      return {
        success: true,
        data
      };

    } finally {
      state.markingAllRead =
        false;
    }
  }

  /* =========================================================
     Delete
     ========================================================= */

  async function deleteNotification(
    id
  ) {
    if (!id) {
      throw new Error(
        "معرّف الإشعار غير موجود."
      );
    }

    const encodedId =
      encodeURIComponent(
        String(id)
      );

    const existing =
      state.notifications.find(
        (item) =>
          String(
            notificationId(
              item
            )
          ) ===
          String(id)
      );

    const wasUnread =
      existing &&
      !isRead(existing);

    const data =
      await request(
        `${ENDPOINT}/${encodedId}`,
        {
          method: "DELETE"
        }
      );

    state.notifications =
      state.notifications.filter(
        (item) =>
          String(
            notificationId(
              item
            )
          ) !==
          String(id)
      );

    if (
      wasUnread &&
      state.unreadCount >
      0
    ) {
      state.unreadCount--;
    }

    updateNotificationBadges();
    renderAll();

    emit(
      "deleted",
      {
        id,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  async function deleteAllNotifications() {
    if (
      state.deletingAll
    ) {
      return {
        success: false
      };
    }

    const confirmed =
      window.confirm(
        "هل تريد حذف جميع الإشعارات؟"
      );

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }

    state.deletingAll =
      true;

    try {
      const data =
        await request(
          ENDPOINT,
          {
            method: "DELETE"
          }
        );

      state.notifications =
        [];

      state.unreadCount =
        0;

      updateNotificationBadges();
      renderAll();

      emit(
        "allDeleted",
        {
          data
        }
      );

      return {
        success: true,
        data
      };

    } finally {
      state.deletingAll =
        false;
    }
  }

  /* =========================================================
     Navigation
     ========================================================= */

  async function openNotification(
    notification
  ) {
    if (!notification) {
      return {
        success: false
      };
    }

    const id =
      notificationId(
        notification
      );

    if (
      id &&
      !isRead(notification)
    ) {
      try {
        await markAsRead(
          id
        );
      } catch (
        error
      ) {
        console.warn(
          "[NOVA NOTIFICATIONS] Could not mark as read:",
          error
        );
      }
    }

    const url =
      getActionURL(
        notification
      );

    emit(
      "opened",
      {
        notification,
        url
      }
    );

    if (!url) {
      return {
        success: true,
        notification
      };
    }

    /*
     * نسمح فقط بروابط http/https
     * بعد التحقق منها بواسطة safeURL.
     */
    window.location.href =
      url;

    return {
      success: true,
      notification,
      url
    };
  }

  /* =========================================================
     Rendering
     ========================================================= */

  function render(
    container,
    notifications =
      state.notifications
  ) {
    if (!container) {
      return;
    }

    if (
      !Array.isArray(
        notifications
      ) ||
      notifications.length ===
        0
    ) {
      container.innerHTML = `
        <div class="nova-notifications-empty">
          <div class="nova-notifications-empty-icon">
            ✓
          </div>

          <strong>
            لا توجد إشعارات
          </strong>

          <span>
            ستظهر هنا الإشعارات الجديدة عندما تصلك.
          </span>
        </div>
      `;

      return;
    }

    container.innerHTML =
      notifications
        .map(
          (
            notification
          ) =>
            renderItem(
              notification
            )
        )
        .join("");

    bindItems(
      container
    );
  }

  function renderItem(
    notification
  ) {
    const id =
      escapeHTML(
        notificationId(
          notification
        )
      );

    const type =
      escapeHTML(
        getNotificationType(
          notification
        )
      );

    const title =
      escapeHTML(
        getNotificationTitle(
          notification
        )
      );

    const message =
      escapeHTML(
        getNotificationMessage(
          notification
        )
      );

    const actorName =
      escapeHTML(
        getActorName(
          notification
        )
      );

    const actorAvatar =
      getActorAvatar(
        notification
      );

    const time =
      escapeHTML(
        formatTime(
          getCreatedAt(
            notification
          )
        )
      );

    const read =
      isRead(
        notification
      );

    const icon =
      escapeHTML(
        getTypeIcon(
          getNotificationType(
            notification
          )
        )
      );

    let avatarMarkup;

    if (
      actorAvatar
    ) {
      avatarMarkup = `
        <img
          class="nova-notification-avatar"
          src="${escapeHTML(
            actorAvatar
          )}"
          alt="${actorName}"
          loading="lazy"
        >
      `;
    } else {
      avatarMarkup = `
        <span
          class="nova-notification-avatar nova-notification-avatar-icon"
        >
          ${icon}
        </span>
      `;
    }

    return `
      <article
        class="
          nova-notification-item
          ${read ? "is-read" : "is-unread"}
        "
        data-notification-item
        data-notification-id="${id}"
        data-notification-type="${type}"
      >
        <button
          type="button"
          class="nova-notification-main"
          data-notification-open
          data-notification-id="${id}"
        >
          <span class="nova-notification-avatar-wrap">
            ${avatarMarkup}
          </span>

          <span class="nova-notification-body">

            ${
              title
                ? `
                  <strong>
                    ${title}
                  </strong>
                `
                : actorName
                  ? `
                    <strong>
                      ${actorName}
                    </strong>
                  `
                  : ""
            }

            ${
              message
                ? `
                  <span>
                    ${message}
                  </span>
                `
                : ""
            }

            <small>
              ${time}
            </small>
          </span>

          ${
            !read
              ? `
                <span
                  class="nova-notification-unread-dot"
                  aria-label="غير مقروء"
                ></span>
              `
              : ""
          }
        </button>

        <button
          type="button"
          class="nova-notification-delete"
          data-notification-delete
          data-notification-id="${id}"
          aria-label="حذف الإشعار"
          title="حذف"
        >
          ×
        </button>
      </article>
    `;
  }

  function bindItems(
    container
  ) {
    container
      .querySelectorAll(
        "[data-notification-open]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              const id =
                button.dataset
                  .notificationId;

              const notification =
                state.notifications.find(
                  (item) =>
                    String(
                      notificationId(
                        item
                      )
                    ) ===
                    String(id)
                );

              if (
                notification
              ) {
                await openNotification(
                  notification
                );

                renderAll();
              }
            }
          );
        }
      );

    container
      .querySelectorAll(
        "[data-notification-delete]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async (
              event
            ) => {
              event.preventDefault();
              event.stopPropagation();

              const id =
                button.dataset
                  .notificationId;

              try {
                await deleteNotification(
                  id
                );
              } catch (
                error
              ) {
                showError(
                  error.message ||
                  "تعذر حذف الإشعار."
                );
              }
            }
          );
        }
      );
  }

  function renderAll() {
    document
      .querySelectorAll(
        "[data-notifications-list]"
      )
      .forEach(
        (container) => {
          render(
            container,
            state.notifications
          );
        }
      );

    updateNotificationBadges();
  }

  /* =========================================================
     Controls
     ========================================================= */

  function bindControls() {
    document
      .querySelectorAll(
        "[data-notifications-read-all]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              try {
                await markAllAsRead();
              } catch (
                error
              ) {
                showError(
                  error.message ||
                  "تعذر تحديث الإشعارات."
                );
              }
            }
          );
        }
      );

    document
      .querySelectorAll(
        "[data-notifications-delete-all]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              try {
                await deleteAllNotifications();
              } catch (
                error
              ) {
                showError(
                  error.message ||
                  "تعذر حذف الإشعارات."
                );
              }
            }
          );
        }
      );

    document
      .querySelectorAll(
        "[data-notifications-load-more]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              try {
                const result =
                  await loadMore();

                if (
                  result.success
                ) {
                  renderAll();
                }
              } catch (
                error
              ) {
                showError(
                  error.message ||
                  "تعذر تحميل المزيد."
                );
              }
            }
          );
        }
      );
  }

  /* =========================================================
     Error
     ========================================================= */

  function showError(
    message
  ) {
    emit(
      "uiError",
      {
        message
      }
    );

    if (
      typeof window.NOVA_UI
        ?.toast ===
      "function"
    ) {
      window.NOVA_UI.toast(
        message,
        "error"
      );
      return;
    }

    if (
      typeof APP.toast ===
      "function"
    ) {
      APP.toast(
        message,
        "error"
      );
      return;
    }

    console.warn(
      "[NOVA NOTIFICATIONS]",
      message
    );
  }

  /* =========================================================
     Refresh
     ========================================================= */

  async function refresh() {
    const result =
      await fetchNotifications({
        force: true,
        page: 1
      });

    if (
      result.success
    ) {
      renderAll();
    }

    return result;
  }

  /* =========================================================
     Realtime Hook
     ========================================================= */

  /*
   * الـBackend/WebSocket يمكنه لاحقًا إطلاق:
   *
   * nova:realtime:notification
   *
   * بالـNotification الحقيقي القادم من السيرفر.
   *
   * لا ننشئ Notification من عندنا.
   */
  function bindRealtime() {
    document.addEventListener(
      "nova:realtime:notification",
      (
        event
      ) => {
        const notification =
          event.detail
            ?.notification ||
          event.detail
            ?.data ||
          null;

        if (!notification) {
          return;
        }

        const id =
          notificationId(
            notification
          );

        if (
          id &&
          state.notifications.some(
            (item) =>
              String(
                notificationId(
                  item
                )
              ) ===
              String(id)
          )
        ) {
          return;
        }

        state.notifications =
          [
            notification,
            ...state.notifications
          ];

        if (
          !isRead(
            notification
          )
        ) {
          state.unreadCount++;
        }

        renderAll();

        emit(
          "received",
          {
            notification
          }
        );
      }
    );
  }

  /* =========================================================
     Initialization
     ========================================================= */

  async function init(
    options = {}
  ) {
    if (
      state.initialized &&
      !options.force
    ) {
      return {
        success: true
      };
    }

    state.initialized =
      true;

    bindControls();
    bindRealtime();

    /*
     * Empty state مبدئي بدون Fake Notifications.
     */
    renderAll();

    try {
      const result =
        await fetchNotifications({
          force: true,
          page: 1
        });

      if (
        result.success
      ) {
        renderAll();
      }

      emit(
        "initialized",
        {
          notifications:
            state.notifications,
          unreadCount:
            state.unreadCount
        }
      );

      return {
        success:
          result.success,
        notifications:
          state.notifications,
        unreadCount:
          state.unreadCount
      };

    } catch (
      error
    ) {
      console.error(
        "[NOVA NOTIFICATIONS] Initialization failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* =========================================================
     Logout
     ========================================================= */

  document.addEventListener(
    "nova:auth:logout",
    () => {
      state.notifications =
        [];

      state.unreadCount =
        0;

      state.pagination = {
        page: 1,
        limit: 30,
        hasMore: false
      };

      renderAll();
    }
  );

  /* =========================================================
     Public API
     ========================================================= */

  window.NOVA_NOTIFICATIONS = {
    init,
    refresh,

    state,

    fetchNotifications,
    loadMore,
    fetchUnreadCount,

    markAsRead,
    markAllAsRead,

    deleteNotification,
    deleteAllNotifications,

    openNotification,

    render,
    renderAll,

    updateNotificationBadges
  };

  /* =========================================================
     Start
     ========================================================= */

  function start() {
    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          init();
        },
        {
          once: true
        }
      );

      return;
    }

    init();
  }

  start();

})();
