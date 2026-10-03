/* =========================================================
   NOVA — Profile Engine
   File: js/profile.js
   Version: 1.0.0

   مسؤول عن:
   - الملف الشخصي الحالي
   - الملفات العامة للمستخدمين
   - تحديث بيانات الملف
   - الاسم / اسم المستخدم / النبذة
   - صورة الملف الشخصي
   - رفع الصور
   - حذف صورة الملف الشخصي
   - الخصوصية
   - عرض البيانات داخل صفحات NOVA
   - API-first بدون بيانات وهمية
   ========================================================= */

(() => {
  "use strict";

  const APP = window.APP || {};
  const CONFIG = window.APP_CONFIG || {};

  const API_BASE =
    typeof APP.getApiURL === "function"
      ? APP.getApiURL("")
      : "/api/v1";

  const ENDPOINTS = {
    me: `${API_BASE}/profiles/me`,
    publicProfile: (userId) =>
      `${API_BASE}/profiles/${encodeURIComponent(userId)}`,

    updateMe: `${API_BASE}/profiles/me`,

    upload: `${API_BASE}/uploads`,

    photo: `${API_BASE}/profiles/me/photo`,
    deletePhoto: `${API_BASE}/profiles/me/photo`,

    privacy: `${API_BASE}/profiles/me/privacy`
  };

  const state = {
    currentProfile: null,
    viewedProfile: null,
    loading: false,
    updating: false,
    uploadingPhoto: false,
    initialized: false
  };

  /* =========================================================
     Utilities
     ========================================================= */

  function log(...args) {
    if (CONFIG?.development?.debug) {
      console.info("[NOVA PROFILE]", ...args);
    }
  }

  function warn(...args) {
    if (CONFIG?.development?.debug) {
      console.warn("[NOVA PROFILE]", ...args);
    }
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function getElement(selector, root = document) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function getElements(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function getUserIdFromURL() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("id") ||
      params.get("user") ||
      params.get("userId") ||
      params.get("profile")
    );
  }

  function getCurrentUserId() {
    if (
      window.NOVA_AUTH &&
      typeof window.NOVA_AUTH.getCurrentUser === "function"
    ) {
      const user = window.NOVA_AUTH.getCurrentUser();

      if (user?.id) {
        return user.id;
      }
    }

    return null;
  }

  function getProfileId() {
    return getUserIdFromURL() || getCurrentUserId();
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(date);
    } catch {
      return date.toLocaleDateString("ar-EG");
    }
  }

  function normalizeProfile(payload) {
    if (!payload) {
      return null;
    }

    const data =
      payload.data ||
      payload.profile ||
      payload.user ||
      payload;

    if (!data || typeof data !== "object") {
      return null;
    }

    return {
      id: data.id || data.userId || null,

      name:
        data.name ||
        data.displayName ||
        data.fullName ||
        "",

      username:
        data.username ||
        data.handle ||
        "",

      about:
        data.about ||
        data.bio ||
        data.description ||
        "",

      avatar:
        data.avatar ||
        data.avatarUrl ||
        data.profilePhoto ||
        data.profilePhotoUrl ||
        data.photo ||
        "",

      cover:
        data.cover ||
        data.coverUrl ||
        data.coverPhoto ||
        "",

      phone:
        data.phone ||
        data.phoneNumber ||
        "",

      email:
        data.email ||
        "",

      verified:
        Boolean(
          data.verified ||
          data.isVerified ||
          data.accountVerified
        ),

      online:
        Boolean(
          data.online ||
          data.isOnline
        ),

      lastSeen:
        data.lastSeen ||
        data.lastSeenAt ||
        null,

      joinedAt:
        data.joinedAt ||
        data.createdAt ||
        null,

      privacy:
        data.privacy ||
        {},

      stats: {
        friends:
          data.stats?.friends ??
          data.friendsCount ??
          null,

        followers:
          data.stats?.followers ??
          data.followersCount ??
          null,

        following:
          data.stats?.following ??
          data.followingCount ??
          null
      },

      raw: data
    };
  }

  /* =========================================================
     API
     ========================================================= */

  async function request(
    url,
    options = {}
  ) {
    const controller = new AbortController();

    const timeout =
      Number(CONFIG?.api?.timeout) || 15000;

    const timer = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        method: options.method || "GET",

        credentials:
          options.credentials ||
          CONFIG?.api?.credentials ||
          "include",

        headers: {
          Accept: "application/json",
          ...(options.body instanceof FormData
            ? {}
            : {
                "Content-Type":
                  "application/json"
              }),
          ...(options.headers || {})
        },

        body:
          options.body instanceof FormData
            ? options.body
            : options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,

        signal: controller.signal
      });

      const contentType =
        response.headers.get("content-type") || "";

      let payload = null;

      if (contentType.includes("application/json")) {
        payload = await response.json();
      } else {
        const text = await response.text();

        payload = text
          ? { message: text }
          : null;
      }

      if (!response.ok) {
        const error = new Error(
          payload?.message ||
          payload?.error ||
          `HTTP ${response.status}`
        );

        error.status = response.status;
        error.payload = payload;

        throw error;
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  /* =========================================================
     Get Current Profile
     ========================================================= */

  async function getMyProfile({
    force = false,
    render = true
  } = {}) {
    if (
      state.currentProfile &&
      !force
    ) {
      if (render) {
        renderProfile(
          state.currentProfile
        );
      }

      return state.currentProfile;
    }

    state.loading = true;
    setLoadingState(true);

    try {
      const payload = await request(
        ENDPOINTS.me
      );

      const profile =
        normalizeProfile(payload);

      if (!profile) {
        throw new Error(
          "تعذر قراءة بيانات الملف الشخصي."
        );
      }

      state.currentProfile = profile;

      if (render) {
        renderProfile(profile);
      }

      dispatchEvent(
        "nova:profile:loaded",
        profile
      );

      return profile;
    } catch (error) {
      warn(
        "Failed to load current profile:",
        error
      );

      showProfileError(error);

      throw error;
    } finally {
      state.loading = false;
      setLoadingState(false);
    }
  }

  /* =========================================================
     Get Public Profile
     ========================================================= */

  async function getProfile(
    userId,
    {
      render = true
    } = {}
  ) {
    const id =
      normalizeText(userId) ||
      getUserIdFromURL();

    if (!id) {
      throw new Error(
        "لم يتم تحديد المستخدم المطلوب."
      );
    }

    state.loading = true;
    setLoadingState(true);

    try {
      const payload =
        await request(
          ENDPOINTS.publicProfile(id)
        );

      const profile =
        normalizeProfile(payload);

      if (!profile) {
        throw new Error(
          "تعذر تحميل الملف الشخصي."
        );
      }

      state.viewedProfile = profile;

      if (render) {
        renderProfile(profile);
      }

      dispatchEvent(
        "nova:profile:viewed",
        profile
      );

      return profile;
    } catch (error) {
      warn(
        "Failed to load profile:",
        error
      );

      showProfileError(error);

      throw error;
    } finally {
      state.loading = false;
      setLoadingState(false);
    }
  }

  /* =========================================================
     Update Profile
     ========================================================= */

  async function updateProfile(
    changes = {}
  ) {
    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new Error(
        "بيانات التحديث غير صحيحة."
      );
    }

    const payload = {};

    if ("name" in changes) {
      const name =
        normalizeText(changes.name);

      if (!name) {
        throw new Error(
          "الاسم لا يمكن أن يكون فارغًا."
        );
      }

      if (name.length > 80) {
        throw new Error(
          "الاسم يجب ألا يتجاوز 80 حرفًا."
        );
      }

      payload.name = name;
    }

    if ("username" in changes) {
      const username =
        normalizeText(
          changes.username
        ).replace(/^@/, "");

      if (username) {
        if (
          !/^[a-zA-Z0-9_.\u0600-\u06FF-]+$/.test(
            username
          )
        ) {
          throw new Error(
            "اسم المستخدم يحتوي على رموز غير مسموحة."
          );
        }

        if (username.length < 3) {
          throw new Error(
            "اسم المستخدم يجب أن يحتوي على 3 أحرف على الأقل."
          );
        }

        if (username.length > 30) {
          throw new Error(
            "اسم المستخدم يجب ألا يتجاوز 30 حرفًا."
          );
        }
      }

      payload.username = username;
    }

    if ("about" in changes) {
      const about =
        normalizeText(changes.about);

      if (about.length > 500) {
        throw new Error(
          "النبذة يجب ألا تتجاوز 500 حرف."
        );
      }

      payload.about = about;
    }

    if ("phone" in changes) {
      payload.phone =
        normalizeText(changes.phone);
    }

    if ("email" in changes) {
      payload.email =
        normalizeText(changes.email);
    }

    if (!Object.keys(payload).length) {
      throw new Error(
        "لا توجد بيانات لتحديثها."
      );
    }

    state.updating = true;

    try {
      const response =
        await request(
          ENDPOINTS.updateMe,
          {
            method: "PATCH",
            body: payload
          }
        );

      const profile =
        normalizeProfile(response);

      if (profile) {
        state.currentProfile =
          profile;

        if (
          state.viewedProfile?.id ===
          profile.id
        ) {
          state.viewedProfile =
            profile;
        }

        renderProfile(profile);
      }

      dispatchEvent(
        "nova:profile:updated",
        profile || response
      );

      showMessage(
        "تم تحديث الملف الشخصي بنجاح.",
        "success"
      );

      return profile || response;
    } catch (error) {
      warn(
        "Profile update failed:",
        error
      );

      showMessage(
        error.message ||
          "تعذر تحديث الملف الشخصي.",
        "error"
      );

      throw error;
    } finally {
      state.updating = false;
    }
  }

  /* =========================================================
     Profile Photo Upload
     ========================================================= */

  async function uploadProfilePhoto(
    file
  ) {
    if (!(file instanceof File)) {
      throw new Error(
        "الملف المحدد غير صالح."
      );
    }

    const allowed =
      CONFIG?.uploads?.allowedImages || [];

    if (
      allowed.length &&
      !allowed.includes(file.type)
    ) {
      throw new Error(
        "نوع الصورة غير مدعوم."
      );
    }

    const maxMB =
      Number(
        CONFIG?.uploads?.maxImageSizeMB
      ) || 10;

    const maxBytes =
      maxMB * 1024 * 1024;

    if (file.size > maxBytes) {
      throw new Error(
        `حجم الصورة يجب ألا يتجاوز ${maxMB}MB.`
      );
    }

    state.uploadingPhoto = true;

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      formData.append(
        "type",
        "profile"
      );

      const uploadResponse =
        await request(
          ENDPOINTS.upload,
          {
            method: "POST",
            body: formData
          }
        );

      const uploadedUrl =
        uploadResponse?.url ||
        uploadResponse?.data?.url ||
        uploadResponse?.file?.url ||
        uploadResponse?.data?.file?.url;

      if (!uploadedUrl) {
        throw new Error(
          "تم رفع الملف ولكن لم يتم استلام رابط الصورة."
        );
      }

      const response =
        await request(
          ENDPOINTS.photo,
          {
            method: "PATCH",
            body: {
              url: uploadedUrl
            }
          }
        );

      const profile =
        normalizeProfile(response);

      if (profile) {
        state.currentProfile =
          profile;

        renderProfile(profile);
      }

      dispatchEvent(
        "nova:profile:photo-updated",
        profile || response
      );

      showMessage(
        "تم تحديث صورة الملف الشخصي.",
        "success"
      );

      return profile || response;
    } catch (error) {
      warn(
        "Profile photo upload failed:",
        error
      );

      showMessage(
        error.message ||
          "تعذر تحديث صورة الملف الشخصي.",
        "error"
      );

      throw error;
    } finally {
      state.uploadingPhoto = false;
    }
  }

  /* =========================================================
     Delete Profile Photo
     ========================================================= */

  async function deleteProfilePhoto() {
    try {
      const response =
        await request(
          ENDPOINTS.deletePhoto,
          {
            method: "DELETE"
          }
        );

      const profile =
        normalizeProfile(response);

      if (profile) {
        state.currentProfile =
          profile;

        renderProfile(profile);
      }

      dispatchEvent(
        "nova:profile:photo-deleted",
        profile || response
      );

      showMessage(
        "تم حذف صورة الملف الشخصي.",
        "success"
      );

      return profile || response;
    } catch (error) {
      warn(
        "Delete profile photo failed:",
        error
      );

      showMessage(
        error.message ||
          "تعذر حذف الصورة.",
        "error"
      );

      throw error;
    }
  }

  /* =========================================================
     Privacy
     ========================================================= */

  async function getPrivacy() {
    const response =
      await request(
        ENDPOINTS.privacy
      );

    const privacy =
      response?.data ||
      response?.privacy ||
      response;

    dispatchEvent(
      "nova:profile:privacy-loaded",
      privacy
    );

    return privacy;
  }

  async function updatePrivacy(
    changes = {}
  ) {
    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new Error(
        "إعدادات الخصوصية غير صحيحة."
      );
    }

    const response =
      await request(
        ENDPOINTS.privacy,
        {
          method: "PATCH",
          body: changes
        }
      );

    const privacy =
      response?.data ||
      response?.privacy ||
      response;

    if (state.currentProfile) {
      state.currentProfile.privacy =
        privacy;
    }

    dispatchEvent(
      "nova:profile:privacy-updated",
      privacy
    );

    showMessage(
      "تم حفظ إعدادات الخصوصية.",
      "success"
    );

    return privacy;
  }

  /* =========================================================
     Rendering
     ========================================================= */

  function renderProfile(
    profile
  ) {
    if (!profile) {
      return;
    }

    renderText(
      "[data-profile-name]",
      profile.name
    );

    renderText(
      "[data-profile-username]",
      profile.username
        ? `@${profile.username.replace(/^@/, "")}`
        : ""
    );

    renderText(
      "[data-profile-about]",
      profile.about
    );

    renderText(
      "[data-profile-phone]",
      profile.phone
    );

    renderText(
      "[data-profile-email]",
      profile.email
    );

    renderText(
      "[data-profile-joined]",
      formatDate(profile.joinedAt)
    );

    renderAvatar(profile);
    renderCover(profile);
    renderVerification(profile);
    renderOnlineState(profile);
    renderStats(profile);

    document.documentElement.dataset.profileLoaded =
      "true";

    dispatchEvent(
      "nova:profile:rendered",
      profile
    );
  }

  function renderText(
    selector,
    value
  ) {
    getElements(selector)
      .forEach((element) => {
        element.textContent =
          value || "";
      });
  }

  function renderAvatar(
    profile
  ) {
    getElements(
      "[data-profile-avatar]"
    ).forEach((element) => {
      if (
        element.tagName === "IMG"
      ) {
        if (profile.avatar) {
          element.src =
            profile.avatar;

          element.alt =
            profile.name
              ? `صورة ${profile.name}`
              : "صورة الملف الشخصي";

          element.hidden = false;
        } else {
          element.removeAttribute(
            "src"
          );

          element.alt =
            "لا توجد صورة";

          element.hidden = true;
        }
      } else {
        element.style.backgroundImage =
          profile.avatar
            ? `url("${CSS.escape(profile.avatar)}")`
            : "";

        element.textContent =
          !profile.avatar &&
          profile.name
            ? profile.name
                .charAt(0)
                .toUpperCase()
            : "";
      }
    });
  }

  function renderCover(
    profile
  ) {
    getElements(
      "[data-profile-cover]"
    ).forEach((element) => {
      if (profile.cover) {
        element.style.backgroundImage =
          `url("${CSS.escape(profile.cover)}")`;
      } else {
        element.style.backgroundImage =
          "";
      }
    });
  }

  function renderVerification(
    profile
  ) {
    getElements(
      "[data-profile-verified]"
    ).forEach((element) => {
      element.hidden =
        !profile.verified;
    });
  }

  function renderOnlineState(
    profile
  ) {
    getElements(
      "[data-profile-online]"
    ).forEach((element) => {
      element.hidden =
        !profile.online;
    });
  }

  function renderStats(
    profile
  ) {
    const stats =
      profile.stats || {};

    renderStat(
      "friends",
      stats.friends
    );

    renderStat(
      "followers",
      stats.followers
    );

    renderStat(
      "following",
      stats.following
    );
  }

  function renderStat(
    name,
    value
  ) {
    getElements(
      `[data-profile-stat="${name}"]`
    ).forEach((element) => {
      /*
       لا نعرض رقمًا افتراضيًا.
       إذا لم يرسله الـAPI، يظل العنصر فارغًا.
      */
      element.textContent =
        value === null ||
        value === undefined
          ? ""
          : String(value);
    });
  }

  /* =========================================================
     Edit Form
     ========================================================= */

  function bindEditForm() {
    const forms =
      getElements(
        "[data-profile-edit-form]"
      );

    forms.forEach((form) => {
      if (
        form.dataset.profileBound ===
        "true"
      ) {
        return;
      }

      form.dataset.profileBound =
        "true";

      form.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const formData =
            new FormData(form);

          const changes = {
            name:
              formData.get("name") ??
              formData.get("displayName"),

            username:
              formData.get("username"),

            about:
              formData.get("about") ??
              formData.get("bio"),

            phone:
              formData.get("phone"),

            email:
              formData.get("email")
          };

          Object.keys(changes)
            .forEach((key) => {
              if (
                changes[key] === null
              ) {
                delete changes[key];
              }
            });

          try {
            await updateProfile(
              changes
            );
          } catch {
            // تم عرض الخطأ للمستخدم.
          }
        }
      );
    });
  }

  /* =========================================================
     Photo Input
     ========================================================= */

  function bindPhotoInput() {
    const inputs =
      getElements(
        "[data-profile-photo-input]"
      );

    inputs.forEach((input) => {
      if (
        input.dataset.profileBound ===
        "true"
      ) {
        return;
      }

      input.dataset.profileBound =
        "true";

      input.addEventListener(
        "change",
        async () => {
          const file =
            input.files?.[0];

          if (!file) {
            return;
          }

          try {
            await uploadProfilePhoto(
              file
            );
          } catch {
            // الخطأ تمت معالجته داخليًا.
          } finally {
            input.value = "";
          }
        }
      );
    });
  }

  /* =========================================================
     Photo Buttons
     ========================================================= */

  function bindPhotoButtons() {
    getElements(
      "[data-profile-photo-delete]"
    ).forEach((button) => {
      if (
        button.dataset.profileBound ===
        "true"
      ) {
        return;
      }

      button.dataset.profileBound =
        "true";

      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            window.confirm(
              "هل تريد حذف صورة الملف الشخصي؟"
            );

          if (!confirmed) {
            return;
          }

          try {
            await deleteProfilePhoto();
          } catch {
            // تمت معالجة الخطأ.
          }
        }
      );
    });
  }

  /* =========================================================
     Loading UI
     ========================================================= */

  function setLoadingState(
    loading
  ) {
    document.documentElement.dataset.profileLoading =
      loading
        ? "true"
        : "false";

    getElements(
      "[data-profile-loading]"
    ).forEach((element) => {
      element.hidden = !loading;
    });

    getElements(
      "[data-profile-content]"
    ).forEach((element) => {
      if (loading) {
        element.setAttribute(
          "aria-busy",
          "true"
        );
      } else {
        element.removeAttribute(
          "aria-busy"
        );
      }
    });
  }

  function showProfileError(
    error
  ) {
    const message =
      error?.status === 404
        ? "الملف الشخصي غير موجود."
        : error?.status === 401
          ? "يجب تسجيل الدخول للوصول إلى هذا الملف."
          : error?.message ||
            "تعذر تحميل الملف الشخصي.";

    getElements(
      "[data-profile-error]"
    ).forEach((element) => {
      element.textContent =
        message;

      element.hidden = false;
    });
  }

  /* =========================================================
     Messages
     ========================================================= */

  function showMessage(
    message,
    type = "info"
  ) {
    if (
      window.NOVA_UI &&
      typeof window.NOVA_UI.toast ===
        "function"
    ) {
      window.NOVA_UI.toast(
        message,
        type
      );

      return;
    }

    let container =
      document.querySelector(
        "[data-profile-toast]"
      );

    if (!container) {
      container =
        document.createElement(
          "div"
        );

      container.dataset.profileToast =
        "true";

      container.setAttribute(
        "role",
        "status"
      );

      Object.assign(
        container.style,
        {
          position: "fixed",
          bottom: "24px",
          left: "24px",
          zIndex: "99999",
          maxWidth: "360px",
          padding: "12px 16px",
          borderRadius: "14px",
          background:
            "rgba(12,29,23,.96)",
          color: "#F4FAF7",
          border:
            "1px solid rgba(255,255,255,.08)",
          boxShadow:
            "0 18px 45px rgba(0,0,0,.35)",
          opacity: "0",
          transform:
            "translateY(10px)",
          transition:
            "opacity .2s ease, transform .2s ease"
        }
      );

      document.body.appendChild(
        container
      );
    }

    container.textContent =
      message;

    container.dataset.type =
      type;

    requestAnimationFrame(() => {
      container.style.opacity =
        "1";

      container.style.transform =
        "translateY(0)";
    });

    clearTimeout(
      container._novaTimer
    );

    container._novaTimer =
      setTimeout(() => {
        container.style.opacity =
          "0";

        container.style.transform =
          "translateY(10px)";
      }, 3000);
  }

  /* =========================================================
     Events
     ========================================================= */

  function dispatchEvent(
    name,
    detail
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail
        })
      );
    } catch (error) {
      warn(
        "Event dispatch failed:",
        error
      );
    }
  }

  /* =========================================================
     Initialization
     ========================================================= */

  async function init() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    bindEditForm();
    bindPhotoInput();
    bindPhotoButtons();

    const requestedId =
      getUserIdFromURL();

    const currentUserId =
      getCurrentUserId();

    try {
      if (
        requestedId &&
        requestedId !== currentUserId
      ) {
        await getProfile(
          requestedId
        );
      } else {
        await getMyProfile();
      }
    } catch (error) {
      /*
       لا يتم إنشاء Profile وهمي عند فشل API.
       الصفحة تبقى في حالة خطأ واضحة.
      */

      warn(
        "Profile initialization failed:",
        error
      );
    }

    log(
      "Profile engine initialized."
    );

    dispatchEvent(
      "nova:profile:ready",
      state
    );
  }

  /* =========================================================
     Public API
     ========================================================= */

  window.NOVA_PROFILE = {
    state,

    init,

    getMyProfile,
    getProfile,

    updateProfile,

    uploadProfilePhoto,
    deleteProfilePhoto,

    getPrivacy,
    updatePrivacy,

    renderProfile,

    getCurrentProfile() {
      return (
        state.currentProfile
      );
    },

    getViewedProfile() {
      return (
        state.viewedProfile
      );
    },

    isLoading() {
      return state.loading;
    },

    isUpdating() {
      return state.updating;
    },

    isUploadingPhoto() {
      return state.uploadingPhoto;
    }
  };

  /* =========================================================
     Auto Start
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }

})();
