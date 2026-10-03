/* =========================================================
   NOVA — Status Engine
   File: js/status.js
   Version: 1.0.0

   مسؤول عن:
   - تحميل الحالات من API
   - إنشاء حالة نصية
   - إنشاء حالة Media
   - معاينة الصور والفيديو قبل الإرسال
   - تسجيل مشاهدة الحالة
   - حذف حالة المستخدم
   - دعم خصوصية الحالة
   - التعامل مع انتهاء الحالة اعتمادًا على بيانات الخادم
   - Rendering آمن بدون Fake Data
   ========================================================= */

(() => {
  "use strict";

  const APP = window.APP || {};
  const CONFIG = window.APP_CONFIG || {};

  const API_BASE =
    String(CONFIG.api?.baseURL || "/api")
      .replace(/\/+$/g, "");

  const API_VERSION =
    String(CONFIG.api?.version || "v1")
      .replace(/^\/+|\/+$/g, "");

  const STATUS_ENDPOINT =
    `${API_BASE}/${API_VERSION}/statuses`;

  const UPLOAD_ENDPOINT =
    `${API_BASE}/${API_VERSION}/uploads`;

  const STATUS_DURATION_HOURS = 24;

  const state = {
    initialized: false,
    loading: false,
    creating: false,

    statuses: [],
    myStatuses: [],

    activeStatus: null,

    selectedFile: null,
    selectedMediaURL: null,

    privacy: "contacts",

    currentRequest: null
  };

  /* =========================================================
     Utilities
     ========================================================= */

  function getJSONHeaders() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
  }

  function getAuthHeaders() {
    const headers = {
      "Accept": "application/json"
    };

    /*
     * لا نضع Token وهمي.
     *
     * إذا كان المشروع يستخدم Authorization مستقبلًا:
     * يمكن إضافة التوكن هنا من نظام المصادقة المركزي.
     *
     * حاليًا يعتمد النظام على credentials: include
     * والـSession / Cookie الخاصة بالـBackend.
     */

    return headers;
  }

  async function apiRequest(
    url,
    options = {}
  ) {
    const requestOptions = {
      method: options.method || "GET",
      credentials:
        CONFIG.api?.credentials === "include"
          ? "include"
          : "same-origin",
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {})
      }
    };

    if (options.body !== undefined) {
      requestOptions.body = options.body;
    }

    const response =
      await fetch(url, requestOptions);

    const contentType =
      response.headers.get("content-type") || "";

    let data = null;

    if (
      contentType.includes("application/json")
    ) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        const text =
          await response.text();

        data = text
          ? { message: text }
          : null;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const error =
        new Error(
          data?.message ||
          data?.error ||
          `HTTP ${response.status}`
        );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }

  function emit(
    eventName,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(
        `nova:status:${eventName}`,
        {
          detail
        }
      )
    );
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeURL(value) {
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
        url.protocol === "http:" ||
        url.protocol === "https:" ||
        url.protocol === "blob:"
      ) {
        return url.href;
      }

      return "";
    } catch {
      return "";
    }
  }

  function getStatusId(status) {
    return (
      status?.id ??
      status?._id ??
      status?.statusId ??
      ""
    );
  }

  function getStatusText(status) {
    return (
      status?.text ??
      status?.content ??
      status?.body ??
      ""
    );
  }

  function getStatusType(status) {
    const type =
      String(
        status?.type ||
        status?.mediaType ||
        ""
      ).toLowerCase();

    if (
      type === "image" ||
      type === "photo"
    ) {
      return "image";
    }

    if (
      type === "video"
    ) {
      return "video";
    }

    if (
      type === "text"
    ) {
      return "text";
    }

    if (
      status?.media?.mimeType
    ) {
      if (
        String(status.media.mimeType)
          .startsWith("image/")
      ) {
        return "image";
      }

      if (
        String(status.media.mimeType)
          .startsWith("video/")
      ) {
        return "video";
      }
    }

    if (
      status?.mimeType
    ) {
      if (
        String(status.mimeType)
          .startsWith("image/")
      ) {
        return "image";
      }

      if (
        String(status.mimeType)
          .startsWith("video/")
      ) {
        return "video";
      }
    }

    return "text";
  }

  function getStatusMediaURL(status) {
    return safeURL(
      status?.media?.url ||
      status?.mediaUrl ||
      status?.file?.url ||
      status?.url ||
      ""
    );
  }

  function getStatusUser(status) {
    return (
      status?.user ||
      status?.author ||
      status?.owner ||
      null
    );
  }

  function getUserName(status) {
    const user =
      getStatusUser(status);

    return (
      user?.name ||
      user?.displayName ||
      status?.userName ||
      status?.authorName ||
      "مستخدم"
    );
  }

  function getUserAvatar(status) {
    const user =
      getStatusUser(status);

    return safeURL(
      user?.avatar ||
      user?.avatarUrl ||
      user?.photo ||
      status?.avatar ||
      ""
    );
  }

  function getCreatedAt(status) {
    return (
      status?.createdAt ||
      status?.created_at ||
      status?.publishedAt ||
      status?.date ||
      null
    );
  }

  function getExpiresAt(status) {
    return (
      status?.expiresAt ||
      status?.expires_at ||
      null
    );
  }

  function isExpired(status) {
    const expiresAt =
      getExpiresAt(status);

    if (!expiresAt) {
      return false;
    }

    const timestamp =
      new Date(expiresAt).getTime();

    if (
      Number.isNaN(timestamp)
    ) {
      return false;
    }

    return Date.now() >= timestamp;
  }

  function formatTime(value) {
    if (!value) {
      return "";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    const now = Date.now();
    const difference =
      Math.max(
        0,
        now - date.getTime()
      );

    const minute =
      60 * 1000;

    const hour =
      60 * minute;

    const day =
      24 * hour;

    if (difference < minute) {
      return "الآن";
    }

    if (difference < hour) {
      const minutes =
        Math.floor(
          difference / minute
        );

      return `منذ ${minutes} دقيقة`;
    }

    if (difference < day) {
      const hours =
        Math.floor(
          difference / hour
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

  /* =========================================================
     Current User
     ========================================================= */

  function getCurrentUser() {
    try {
      if (
        typeof window.NOVA_AUTH
          ?.getCurrentUser === "function"
      ) {
        return window.NOVA_AUTH.getCurrentUser();
      }

      if (
        typeof window.APP?.getCurrentUser ===
        "function"
      ) {
        return window.APP.getCurrentUser();
      }
    } catch {
      // لا نكسر نظام الحالات.
    }

    return null;
  }

  function getCurrentUserId() {
    const user =
      getCurrentUser();

    return (
      user?.id ??
      user?._id ??
      user?.userId ??
      null
    );
  }

  /* =========================================================
     API — Statuses
     ========================================================= */

  async function fetchStatuses(
    options = {}
  ) {
    const {
      mine = false,
      force = false
    } = options;

    if (
      state.loading &&
      !force
    ) {
      return {
        success: false,
        statuses: []
      };
    }

    state.loading = true;

    try {
      const endpoint =
        mine
          ? `${STATUS_ENDPOINT}/mine`
          : STATUS_ENDPOINT;

      const data =
        await apiRequest(
          endpoint,
          {
            method: "GET"
          }
        );

      const statuses =
        Array.isArray(data)
          ? data
          : (
              Array.isArray(data?.statuses)
                ? data.statuses
                : (
                    Array.isArray(data?.data)
                      ? data.data
                      : []
                  )
            );

      if (mine) {
        state.myStatuses =
          statuses.filter(
            (status) =>
              !isExpired(status)
          );
      } else {
        state.statuses =
          statuses.filter(
            (status) =>
              !isExpired(status)
          );
      }

      emit(
        "loaded",
        {
          mine,
          statuses
        }
      );

      return {
        success: true,
        statuses
      };
    } catch (error) {
      console.error(
        "[NOVA STATUS] Failed to load statuses:",
        error
      );

      emit(
        "error",
        {
          operation: "load",
          error
        }
      );

      return {
        success: false,
        statuses: [],
        error
      };
    } finally {
      state.loading = false;
    }
  }

  async function fetchMyStatuses(
    options = {}
  ) {
    return fetchStatuses({
      ...options,
      mine: true
    });
  }

  /* =========================================================
     Upload
     ========================================================= */

  function validateMediaFile(file) {
    if (!file) {
      return {
        valid: false,
        message: "اختر صورة أو فيديو أولًا."
      };
    }

    const type =
      String(file.type || "");

    const isImage =
      CONFIG.uploads?.allowedImages
        ?.includes(type);

    const isVideo =
      CONFIG.uploads?.allowedVideos
        ?.includes(type);

    if (
      !isImage &&
      !isVideo
    ) {
      return {
        valid: false,
        message:
          "نوع الملف غير مدعوم. اختر صورة أو فيديو."
      };
    }

    const maxMB =
      isVideo
        ? (
            Number(
              CONFIG.uploads
                ?.maxVideoSizeMB
            ) || 100
          )
        : (
            Number(
              CONFIG.uploads
                ?.maxImageSizeMB
            ) || 10
          );

    const maxBytes =
      maxMB * 1024 * 1024;

    if (
      file.size > maxBytes
    ) {
      return {
        valid: false,
        message:
          `حجم الملف يتجاوز الحد المسموح (${maxMB}MB).`
      };
    }

    return {
      valid: true,
      type: isVideo
        ? "video"
        : "image"
    };
  }

  async function uploadMedia(file) {
    const validation =
      validateMediaFile(file);

    if (!validation.valid) {
      throw new Error(
        validation.message
      );
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "purpose",
      "status"
    );

    const data =
      await apiRequest(
        UPLOAD_ENDPOINT,
        {
          method: "POST",
          body: formData
        }
      );

    return {
      ...data,
      mediaType:
        validation.type
    };
  }

  /* =========================================================
     Create Status
     ========================================================= */

  async function createTextStatus(
    text,
    options = {}
  ) {
    const content =
      String(text ?? "")
        .trim();

    if (!content) {
      throw new Error(
        "اكتب محتوى الحالة أولًا."
      );
    }

    const maxLength =
      Number(
        CONFIG.messaging
          ?.maxMessageLength
      ) || 4096;

    if (
      content.length >
      maxLength
    ) {
      throw new Error(
        `الحالة طويلة جدًا. الحد الأقصى ${maxLength} حرف.`
      );
    }

    return createStatus({
      type: "text",
      text: content,
      privacy:
        options.privacy ||
        state.privacy
    });
  }

  async function createMediaStatus(
    file,
    options = {}
  ) {
    const validation =
      validateMediaFile(file);

    if (!validation.valid) {
      throw new Error(
        validation.message
      );
    }

    state.creating = true;

    try {
      const uploaded =
        await uploadMedia(file);

      const media =
        uploaded?.media ||
        uploaded?.file ||
        uploaded?.data ||
        uploaded;

      return await createStatus({
        type: validation.type,
        mediaId:
          media?.id ??
          media?._id ??
          uploaded?.mediaId ??
          null,
        mediaUrl:
          media?.url ??
          uploaded?.url ??
          null,
        mimeType:
          file.type,
        privacy:
          options.privacy ||
          state.privacy
      });
    } finally {
      state.creating = false;
    }
  }

  async function createStatus(
    payload
  ) {
    if (!payload) {
      throw new Error(
        "بيانات الحالة غير صحيحة."
      );
    }

    state.creating = true;

    try {
      const body = {
        type:
          payload.type || "text",

        privacy:
          payload.privacy ||
          state.privacy
      };

      if (payload.text) {
        body.text =
          payload.text;
      }

      if (payload.mediaId) {
        body.mediaId =
          payload.mediaId;
      }

      if (payload.mediaUrl) {
        body.mediaUrl =
          payload.mediaUrl;
      }

      if (payload.mimeType) {
        body.mimeType =
          payload.mimeType;
      }

      const data =
        await apiRequest(
          STATUS_ENDPOINT,
          {
            method: "POST",
            headers:
              getJSONHeaders(),
            body:
              JSON.stringify(body)
          }
        );

      const created =
        data?.status ||
        data?.data ||
        data;

      if (created) {
        state.myStatuses =
          [
            created,
            ...state.myStatuses
          ].filter(
            (status) =>
              !isExpired(status)
          );
      }

      emit(
        "created",
        {
          status: created
        }
      );

      clearSelectedMedia();

      return {
        success: true,
        status: created
      };
    } catch (error) {
      emit(
        "error",
        {
          operation: "create",
          error
        }
      );

      throw error;
    } finally {
      state.creating = false;
    }
  }

  /* =========================================================
     View Status
     ========================================================= */

  async function viewStatus(
    statusId
  ) {
    if (!statusId) {
      return {
        success: false
      };
    }

    const id =
      encodeURIComponent(
        String(statusId)
      );

    try {
      const data =
        await apiRequest(
          `${STATUS_ENDPOINT}/${id}/view`,
          {
            method: "POST",
            headers:
              getJSONHeaders(),
            body:
              JSON.stringify({})
          }
        );

      const status =
        findStatusById(
          statusId
        );

      if (status) {
        status.viewed = true;
      }

      emit(
        "viewed",
        {
          statusId,
          data
        }
      );

      return {
        success: true,
        data
      };
    } catch (error) {
      /*
       * عدم تسجيل المشاهدة لا يمنع المستخدم
       * من رؤية الحالة.
       */
      console.warn(
        "[NOVA STATUS] View registration failed:",
        error
      );

      emit(
        "error",
        {
          operation: "view",
          statusId,
          error
        }
      );

      return {
        success: false,
        error
      };
    }
  }

  /* =========================================================
     Delete Status
     ========================================================= */

  async function deleteStatus(
    statusId
  ) {
    if (!statusId) {
      throw new Error(
        "معرّف الحالة غير موجود."
      );
    }

    const id =
      encodeURIComponent(
        String(statusId)
      );

    const data =
      await apiRequest(
        `${STATUS_ENDPOINT}/${id}`,
        {
          method: "DELETE"
        }
      );

    state.myStatuses =
      state.myStatuses.filter(
        (status) =>
          String(
            getStatusId(status)
          ) !==
          String(statusId)
      );

    state.statuses =
      state.statuses.filter(
        (status) =>
          String(
            getStatusId(status)
          ) !==
          String(statusId)
      );

    if (
      state.activeStatus &&
      String(
        getStatusId(
          state.activeStatus
        )
      ) ===
      String(statusId)
    ) {
      state.activeStatus = null;
    }

    emit(
      "deleted",
      {
        statusId,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  /* =========================================================
     Privacy
     ========================================================= */

  function setPrivacy(
    privacy
  ) {
    const allowed = [
      "contacts",
      "contacts_except",
      "only_share_with"
    ];

    if (
      !allowed.includes(
        privacy
      )
    ) {
      throw new Error(
        "إعداد خصوصية غير صالح."
      );
    }

    state.privacy =
      privacy;

    emit(
      "privacyChanged",
      {
        privacy
      }
    );

    return privacy;
  }

  function getPrivacy() {
    return state.privacy;
  }

  async function savePrivacy(
    privacy
  ) {
    setPrivacy(privacy);

    const data =
      await apiRequest(
        `${STATUS_ENDPOINT}/privacy`,
        {
          method: "PATCH",
          headers:
            getJSONHeaders(),
          body:
            JSON.stringify({
              privacy
            })
        }
      );

    emit(
      "privacySaved",
      {
        privacy,
        data
      }
    );

    return {
      success: true,
      data
    };
  }

  /* =========================================================
     Find Status
     ========================================================= */

  function findStatusById(
    statusId
  ) {
    const all =
      [
        ...state.statuses,
        ...state.myStatuses
      ];

    return (
      all.find(
        (status) =>
          String(
            getStatusId(status)
          ) ===
          String(statusId)
      ) || null
    );
  }

  /* =========================================================
     Media Preview
     ========================================================= */

  function selectMedia(
    file
  ) {
    const validation =
      validateMediaFile(file);

    if (!validation.valid) {
      clearSelectedMedia();

      throw new Error(
        validation.message
      );
    }

    clearSelectedMedia();

    state.selectedFile =
      file;

    state.selectedMediaURL =
      URL.createObjectURL(
        file
      );

    renderMediaPreview();

    emit(
      "mediaSelected",
      {
        file,
        type:
          validation.type,
        preview:
          state.selectedMediaURL
      }
    );

    return {
      success: true,
      file,
      type:
        validation.type,
      preview:
        state.selectedMediaURL
    };
  }

  function clearSelectedMedia() {
    if (
      state.selectedMediaURL
    ) {
      try {
        URL.revokeObjectURL(
          state.selectedMediaURL
        );
      } catch {
        // Ignore
      }
    }

    state.selectedFile = null;
    state.selectedMediaURL = null;

    const preview =
      document.querySelector(
        "[data-status-media-preview]"
      );

    if (preview) {
      preview.innerHTML = "";
      preview.hidden = true;
    }
  }

  function renderMediaPreview() {
    const container =
      document.querySelector(
        "[data-status-media-preview]"
      );

    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (
      !state.selectedFile ||
      !state.selectedMediaURL
    ) {
      container.hidden = true;
      return;
    }

    const validation =
      validateMediaFile(
        state.selectedFile
      );

    if (!validation.valid) {
      container.hidden = true;
      return;
    }

    let media;

    if (
      validation.type ===
      "video"
    ) {
      media =
        document.createElement(
          "video"
        );

      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media =
        document.createElement(
          "img"
        );

      media.alt =
        "معاينة الحالة";
    }

    media.src =
      state.selectedMediaURL;

    media.className =
      "nova-status-media-preview";

    container.appendChild(
      media
    );

    container.hidden = false;
  }

  /* =========================================================
     Rendering
     ========================================================= */

  function renderStatuses(
    container,
    statuses = state.statuses
  ) {
    if (!container) {
      return;
    }

    const validStatuses =
      Array.isArray(statuses)
        ? statuses.filter(
            (status) =>
              !isExpired(status)
          )
        : [];

    if (
      validStatuses.length === 0
    ) {
      container.innerHTML = `
        <div class="nova-status-empty">
          <div class="nova-status-empty-icon">
            ◌
          </div>

          <strong>
            لا توجد حالات متاحة الآن
          </strong>

          <span>
            عندما ينشر الأشخاص حالات جديدة ستظهر هنا.
          </span>
        </div>
      `;

      return;
    }

    container.innerHTML =
      validStatuses
        .map(
          (status) =>
            renderStatusItem(
              status
            )
        )
        .join("");

    bindStatusItems(
      container
    );
  }

  function renderMyStatuses(
    container,
    statuses = state.myStatuses
  ) {
    if (!container) {
      return;
    }

    const validStatuses =
      Array.isArray(statuses)
        ? statuses.filter(
            (status) =>
              !isExpired(status)
          )
        : [];

    if (
      validStatuses.length === 0
    ) {
      container.innerHTML = `
        <div class="nova-status-my-empty">
          <div>
            <span class="nova-status-plus">
              +
            </span>

            <strong>
              أضف حالة
            </strong>
          </div>

          <small>
            شارك ما تريد مع الأشخاص الذين تسمح لهم إعدادات الخصوصية.
          </small>
        </div>
      `;

      return;
    }

    container.innerHTML =
      validStatuses
        .map(
          (status) =>
            renderStatusItem(
              status,
              {
                mine: true
              }
            )
        )
        .join("");

    bindStatusItems(
      container
    );
  }

  function renderStatusItem(
    status,
    options = {}
  ) {
    const id =
      escapeHTML(
        getStatusId(status)
      );

    const name =
      escapeHTML(
        getUserName(status)
      );

    const avatar =
      getUserAvatar(status);

    const text =
      escapeHTML(
        getStatusText(status)
      );

    const type =
      getStatusType(status);

    const mediaURL =
      getStatusMediaURL(status);

    const createdAt =
      getCreatedAt(status);

    const viewed =
      status?.viewed === true;

    const mine =
      options.mine === true;

    let mediaMarkup = "";

    if (
      type === "image" &&
      mediaURL
    ) {
      mediaMarkup = `
        <img
          class="nova-status-thumb"
          src="${escapeHTML(mediaURL)}"
          alt=""
          loading="lazy"
        >
      `;
    }

    if (
      type === "video" &&
      mediaURL
    ) {
      mediaMarkup = `
        <video
          class="nova-status-thumb"
          src="${escapeHTML(mediaURL)}"
          muted
          playsinline
          preload="metadata"
        ></video>
      `;
    }

    const avatarMarkup =
      avatar
        ? `
          <img
            class="nova-status-avatar"
            src="${escapeHTML(avatar)}"
            alt="${name}"
            loading="lazy"
          >
        `
        : `
          <span class="nova-status-avatar nova-status-avatar-placeholder">
            ${escapeHTML(
              name.charAt(0)
            )}
          </span>
        `;

    return `
      <article
        class="nova-status-item ${
          viewed
            ? "is-viewed"
            : "is-new"
        }"
        data-status-item
        data-status-id="${id}"
        data-status-type="${escapeHTML(type)}"
      >
        <button
          type="button"
          class="nova-status-open"
          data-status-open
          data-status-id="${id}"
          aria-label="فتح حالة ${name}"
        >
          <span class="nova-status-avatar-wrap">
            ${avatarMarkup}
          </span>

          <span class="nova-status-info">
            <strong>
              ${name}
            </strong>

            <small>
              ${escapeHTML(
                formatTime(
                  createdAt
                )
              )}
            </small>
          </span>

          ${
            mediaMarkup ||
            (
              text
                ? `
                  <span class="nova-status-text-preview">
                    ${text.slice(0, 60)}
                  </span>
                `
                : ""
            )
          }
        </button>

        ${
          mine
            ? `
              <button
                type="button"
                class="nova-status-delete"
                data-status-delete
                data-status-id="${id}"
                aria-label="حذف الحالة"
                title="حذف الحالة"
              >
                ×
              </button>
            `
            : ""
        }
      </article>
    `;
  }

  function bindStatusItems(
    container
  ) {
    container
      .querySelectorAll(
        "[data-status-open]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async () => {
              const id =
                button.dataset
                  .statusId;

              await openStatus(
                id
              );
            }
          );
        }
      );

    container
      .querySelectorAll(
        "[data-status-delete]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            async (event) => {
              event.preventDefault();
              event.stopPropagation();

              const id =
                button.dataset
                  .statusId;

              await handleDelete(
                id
              );
            }
          );
        }
      );
  }

  /* =========================================================
     Status Viewer
     ========================================================= */

  async function openStatus(
    statusId
  ) {
    const status =
      findStatusById(
        statusId
      );

    if (!status) {
      emit(
        "error",
        {
          operation: "open",
          statusId,
          error:
            new Error(
              "الحالة غير موجودة في البيانات الحالية."
            )
        }
      );

      return {
        success: false
      };
    }

    if (
      isExpired(status)
    ) {
      return {
        success: false,
        expired: true
      };
    }

    state.activeStatus =
      status;

    /*
     * تسجيل المشاهدة على الخادم.
     * لا نرفع عدادًا محليًا ولا نخترع رقم مشاهدات.
     */
    if (
      getStatusId(status)
    ) {
      await viewStatus(
        getStatusId(status)
      );
    }

    renderViewer(
      status
    );

    emit(
      "opened",
      {
        status
      }
    );

    return {
      success: true,
      status
    };
  }

  function renderViewer(
    status
  ) {
    const viewer =
      document.querySelector(
        "[data-status-viewer]"
      );

    if (!viewer) {
      return;
    }

    const type =
      getStatusType(status);

    const mediaURL =
      getStatusMediaURL(status);

    const text =
      escapeHTML(
        getStatusText(status)
      );

    const name =
      escapeHTML(
        getUserName(status)
      );

    const avatar =
      getUserAvatar(status);

    const avatarMarkup =
      avatar
        ? `
          <img
            src="${escapeHTML(avatar)}"
            alt="${name}"
          >
        `
        : `
          <span>
            ${escapeHTML(
              name.charAt(0)
            )}
          </span>
        `;

    let content = "";

    if (
      type === "image" &&
      mediaURL
    ) {
      content = `
        <img
          class="nova-status-viewer-image"
          src="${escapeHTML(mediaURL)}"
          alt=""
        >
      `;
    } else if (
      type === "video" &&
      mediaURL
    ) {
      content = `
        <video
          class="nova-status-viewer-video"
          src="${escapeHTML(mediaURL)}"
          controls
          autoplay
          playsinline
        ></video>
      `;
    } else {
      content = `
        <div class="nova-status-viewer-text">
          ${text}
        </div>
      `;
    }

    viewer.innerHTML = `
      <div
        class="nova-status-viewer-backdrop"
        data-status-viewer-close
      ></div>

      <section
        class="nova-status-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="عرض الحالة"
      >
        <header class="nova-status-viewer-header">
          <div class="nova-status-viewer-user">
            <span class="nova-status-viewer-avatar">
              ${avatarMarkup}
            </span>

            <span>
              <strong>
                ${name}
              </strong>

              <small>
                ${escapeHTML(
                  formatTime(
                    getCreatedAt(status)
                  )
                )}
              </small>
            </span>
          </div>

          <button
            type="button"
            data-status-viewer-close
            aria-label="إغلاق"
          >
            ×
          </button>
        </header>

        <div class="nova-status-viewer-content">
          ${content}
        </div>

        ${
          getExpiresAt(status)
            ? `
              <footer class="nova-status-viewer-footer">
                تنتهي هذه الحالة تلقائيًا وفق وقت الانتهاء المرسل من الخادم.
              </footer>
            `
            : ""
        }
      </section>
    `;

    viewer.hidden = false;

    viewer
      .querySelectorAll(
        "[data-status-viewer-close]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            closeViewer
          );
        }
      );

    document.body.classList.add(
      "nova-status-viewer-open"
    );
  }

  function closeViewer() {
    const viewer =
      document.querySelector(
        "[data-status-viewer]"
      );

    if (viewer) {
      viewer.innerHTML = "";
      viewer.hidden = true;
    }

    document.body.classList.remove(
      "nova-status-viewer-open"
    );

    state.activeStatus =
      null;

    emit("closed");
  }

  /* =========================================================
     UI Actions
     ========================================================= */

  async function handleDelete(
    statusId
  ) {
    if (!statusId) {
      return;
    }

    const confirmed =
      window.confirm(
        "هل تريد حذف هذه الحالة؟"
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteStatus(
        statusId
      );

      refreshStatusUI();

    } catch (error) {
      console.error(
        "[NOVA STATUS] Delete failed:",
        error
      );

      showError(
        error.message ||
        "تعذر حذف الحالة."
      );
    }
  }

  function showError(
    message
  ) {
    emit(
      "uiError",
      {
        message
      }
    );

    /*
     * إذا كان التطبيق الرئيسي لديه Toast system
     * نستخدمه بدل إنشاء نظام إشعارات جديد.
     */
    if (
      typeof window.NOVA_UI
        ?.toast === "function"
    ) {
      window.NOVA_UI.toast(
        message,
        "error"
      );

      return;
    }

    if (
      typeof window.APP?.toast ===
      "function"
    ) {
      window.APP.toast(
        message,
        "error"
      );

      return;
    }

    console.warn(
      "[NOVA STATUS]",
      message
    );
  }

  function refreshStatusUI() {
    const statusContainer =
      document.querySelector(
        "[data-status-list]"
      );

    if (statusContainer) {
      renderStatuses(
        statusContainer,
        state.statuses
      );
    }

    const myContainer =
      document.querySelector(
        "[data-my-status-list]"
      );

    if (myContainer) {
      renderMyStatuses(
        myContainer,
        state.myStatuses
      );
    }
  }

  /* =========================================================
     Form Binding
     ========================================================= */

  function bindCreateForm() {
    const form =
      document.querySelector(
        "[data-status-form]"
      );

    if (!form) {
      return;
    }

    const textInput =
      form.querySelector(
        "[data-status-text]"
      );

    const fileInput =
      form.querySelector(
        "[data-status-file]"
      );

    const privacyInput =
      form.querySelector(
        "[data-status-privacy]"
      );

    if (privacyInput) {
      privacyInput.value =
        state.privacy;

      privacyInput.addEventListener(
        "change",
        () => {
          try {
            setPrivacy(
              privacyInput.value
            );
          } catch (error) {
            showError(
              error.message
            );
          }
        }
      );
    }

    if (fileInput) {
      fileInput.addEventListener(
        "change",
        () => {
          const file =
            fileInput.files?.[0];

          if (!file) {
            clearSelectedMedia();
            return;
          }

          try {
            selectMedia(file);
          } catch (error) {
            fileInput.value = "";
            showError(
              error.message
            );
          }
        }
      );
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (
          state.creating
        ) {
          return;
        }

        try {
          const privacy =
            privacyInput?.value ||
            state.privacy;

          setPrivacy(
            privacy
          );

          let result;

          if (
            state.selectedFile
          ) {
            result =
              await createMediaStatus(
                state.selectedFile,
                {
                  privacy
                }
              );
          } else {
            result =
              await createTextStatus(
                textInput?.value ||
                "",
                {
                  privacy
                }
              );
          }

          if (
            result?.success
          ) {
            if (textInput) {
              textInput.value =
                "";
            }

            if (fileInput) {
              fileInput.value =
                "";
            }

            clearSelectedMedia();

            refreshStatusUI();
          }

        } catch (error) {
          console.error(
            "[NOVA STATUS] Create failed:",
            error
          );

          showError(
            error.message ||
            "تعذر نشر الحالة."
          );
        }
      }
    );
  }

  function bindPrivacyControls() {
    document
      .querySelectorAll(
        "[data-status-privacy]"
      )
      .forEach(
        (control) => {
          control.value =
            state.privacy;

          control.addEventListener(
            "change",
            () => {
              try {
                setPrivacy(
                  control.value
                );
              } catch (error) {
                showError(
                  error.message
                );
              }
            }
          );
        }
      );
  }

  function bindGlobalEvents() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          const viewer =
            document.querySelector(
              "[data-status-viewer]"
            );

          if (
            viewer &&
            !viewer.hidden
          ) {
            closeViewer();
          }
        }
      }
    );

    document.addEventListener(
      "nova:auth:logout",
      () => {
        state.statuses = [];
        state.myStatuses = [];
        state.activeStatus = null;

        refreshStatusUI();
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

    state.initialized = true;

    bindCreateForm();
    bindPrivacyControls();
    bindGlobalEvents();

    const statusContainer =
      document.querySelector(
        "[data-status-list]"
      );

    const myContainer =
      document.querySelector(
        "[data-my-status-list]"
      );

    /*
     * نعرض Empty State أولًا.
     * لا يتم إنشاء أي بيانات تجريبية.
     */
    if (statusContainer) {
      renderStatuses(
        statusContainer,
        []
      );
    }

    if (myContainer) {
      renderMyStatuses(
        myContainer,
        []
      );
    }

    /*
     * إذا كانت الصفحة تحتوي على نظام Auth
     * نطلب البيانات الحقيقية فقط.
     */
    try {
      const [statusesResult, myResult] =
        await Promise.all([
          fetchStatuses({
            force: true
          }),
          fetchMyStatuses({
            force: true
          })
        ]);

      if (
        statusesResult.success
      ) {
        renderStatuses(
          statusContainer,
          state.statuses
        );
      }

      if (
        myResult.success
      ) {
        renderMyStatuses(
          myContainer,
          state.myStatuses
        );
      }

      emit(
        "initialized",
        {
          statuses:
            state.statuses,
          myStatuses:
            state.myStatuses
        }
      );

      return {
        success: true,
        statuses:
          state.statuses,
        myStatuses:
          state.myStatuses
      };

    } catch (error) {
      console.error(
        "[NOVA STATUS] Initialization failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* =========================================================
     Public API
     ========================================================= */

  window.NOVA_STATUS = {
    init,

    state,

    fetchStatuses,
    fetchMyStatuses,

    createStatus,
    createTextStatus,
    createMediaStatus,

    uploadMedia,

    viewStatus,
    openStatus,
    closeViewer,

    deleteStatus,

    setPrivacy,
    getPrivacy,
    savePrivacy,

    selectMedia,
    clearSelectedMedia,

    renderStatuses,
    renderMyStatuses,

    findStatusById,

    isExpired,

    refreshStatusUI
  };

  /* =========================================================
     Auto Start
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
