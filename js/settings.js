/* =========================================================
   NOVA — Settings Engine
   File: js/settings.js
   Version: 1.0.0

   مسؤول عن:
   - إعدادات الحساب
   - اللغة والاتجاه
   - المظهر Dark / Light
   - الإشعارات
   - الخصوصية
   - إعدادات المحادثات
   - إعدادات المكالمات
   - حفظ تفضيلات الواجهة
   - ربط الإعدادات بالـAPI
   - بدون بيانات وهمية
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
    settings: `${API_BASE}/settings`,
    preferences: `${API_BASE}/settings/preferences`,
    notifications: `${API_BASE}/settings/notifications`,
    privacy: `${API_BASE}/privacy`,
    security: `${API_BASE}/security`
  };

  const state = {
    settings: null,
    loading: false,
    saving: false,
    initialized: false
  };

  /* =========================================================
     Helpers
     ========================================================= */

  function log(...args) {
    if (CONFIG?.development?.debug) {
      console.info("[NOVA SETTINGS]", ...args);
    }
  }

  function warn(...args) {
    if (CONFIG?.development?.debug) {
      console.warn("[NOVA SETTINGS]", ...args);
    }
  }

  function getElements(selector, root = document) {
    try {
      return Array.from(
        root.querySelectorAll(selector)
      );
    } catch {
      return [];
    }
  }

  function getElement(selector, root = document) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function normalizeValue(value) {
    if (typeof value === "string") {
      return value.trim();
    }

    return value;
  }

  /* =========================================================
     API
     ========================================================= */

  async function request(url, options = {}) {
    const controller =
      new AbortController();

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
        response.headers.get(
          "content-type"
        ) || "";

      let data = null;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data = await response.json();
      } else {
        const text =
          await response.text();

        data = text
          ? { message: text }
          : null;
      }

      if (!response.ok) {
        const error = new Error(
          data?.message ||
          data?.error ||
          `HTTP ${response.status}`
        );

        error.status =
          response.status;

        error.payload = data;

        throw error;
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* =========================================================
     Load Settings
     ========================================================= */

  async function loadSettings({
    force = false,
    render = true
  } = {}) {
    if (
      state.settings &&
      !force
    ) {
      if (render) {
        renderSettings(
          state.settings
        );
      }

      return state.settings;
    }

    state.loading = true;

    setLoadingState(true);

    try {
      const response =
        await request(
          ENDPOINTS.settings
        );

      const settings =
        response?.data ||
        response?.settings ||
        response;

      if (
        !settings ||
        typeof settings !== "object"
      ) {
        throw new Error(
          "تعذر قراءة إعدادات الحساب."
        );
      }

      state.settings =
        settings;

      if (render) {
        renderSettings(
          settings
        );
      }

      dispatchEvent(
        "nova:settings:loaded",
        settings
      );

      return settings;
    } catch (error) {
      warn(
        "Settings loading failed:",
        error
      );

      showMessage(
        error.message ||
          "تعذر تحميل الإعدادات.",
        "error"
      );

      throw error;
    } finally {
      state.loading = false;

      setLoadingState(false);
    }
  }

  /* =========================================================
     Update General Settings
     ========================================================= */

  async function updateSettings(
    changes = {}
  ) {
    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new Error(
        "بيانات الإعدادات غير صحيحة."
      );
    }

    if (
      !Object.keys(changes).length
    ) {
      throw new Error(
        "لا توجد إعدادات لتحديثها."
      );
    }

    state.saving = true;

    try {
      const response =
        await request(
          ENDPOINTS.settings,
          {
            method: "PATCH",
            body: changes
          }
        );

      const updated =
        response?.data ||
        response?.settings ||
        response;

      state.settings =
        updated;

      renderSettings(
        updated
      );

      dispatchEvent(
        "nova:settings:updated",
        updated
      );

      showMessage(
        "تم حفظ الإعدادات.",
        "success"
      );

      return updated;
    } catch (error) {
      warn(
        "Settings update failed:",
        error
      );

      showMessage(
        error.message ||
          "تعذر حفظ الإعدادات.",
        "error"
      );

      throw error;
    } finally {
      state.saving = false;
    }
  }

  /* =========================================================
     Preferences
     ========================================================= */

  async function getPreferences() {
    const response =
      await request(
        ENDPOINTS.preferences
      );

    const preferences =
      response?.data ||
      response?.preferences ||
      response;

    if (state.settings) {
      state.settings.preferences =
        preferences;
    }

    renderPreferences(
      preferences
    );

    return preferences;
  }

  async function updatePreferences(
    changes = {}
  ) {
    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new Error(
        "بيانات التفضيلات غير صحيحة."
      );
    }

    const response =
      await request(
        ENDPOINTS.preferences,
        {
          method: "PATCH",
          body: changes
        }
      );

    const preferences =
      response?.data ||
      response?.preferences ||
      response;

    if (state.settings) {
      state.settings.preferences =
        preferences;
    }

    renderPreferences(
      preferences
    );

    applyLocalPreferences(
      preferences
    );

    dispatchEvent(
      "nova:settings:preferences-updated",
      preferences
    );

    showMessage(
      "تم حفظ التفضيلات.",
      "success"
    );

    return preferences;
  }

  /* =========================================================
     Notification Settings
     ========================================================= */

  async function getNotificationSettings() {
    const response =
      await request(
        ENDPOINTS.notifications
      );

    const notifications =
      response?.data ||
      response?.notifications ||
      response;

    renderNotificationSettings(
      notifications
    );

    return notifications;
  }

  async function updateNotificationSettings(
    changes = {}
  ) {
    const response =
      await request(
        ENDPOINTS.notifications,
        {
          method: "PATCH",
          body: changes
        }
      );

    const notifications =
      response?.data ||
      response?.notifications ||
      response;

    renderNotificationSettings(
      notifications
    );

    dispatchEvent(
      "nova:settings:notifications-updated",
      notifications
    );

    showMessage(
      "تم تحديث إعدادات الإشعارات.",
      "success"
    );

    return notifications;
  }

  /* =========================================================
     Privacy
     ========================================================= */

  async function getPrivacySettings() {
    const response =
      await request(
        ENDPOINTS.privacy
      );

    const privacy =
      response?.data ||
      response?.privacy ||
      response;

    renderPrivacySettings(
      privacy
    );

    return privacy;
  }

  async function updatePrivacySettings(
    changes = {}
  ) {
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

    renderPrivacySettings(
      privacy
    );

    dispatchEvent(
      "nova:settings:privacy-updated",
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

  function renderSettings(
    settings
  ) {
    if (!settings) {
      return;
    }

    renderPreferences(
      settings.preferences ||
      {}
    );

    renderNotificationSettings(
      settings.notifications ||
      {}
    );

    renderPrivacySettings(
      settings.privacy ||
      {}
    );

    renderGenericSettings(
      settings
    );

    document.documentElement.dataset.settingsLoaded =
      "true";
  }

  function renderGenericSettings(
    settings
  ) {
    getElements(
      "[data-setting-value]"
    ).forEach((element) => {
      const key =
        element.dataset.settingValue;

      if (!key) {
        return;
      }

      const value =
        readNestedValue(
          settings,
          key
        );

      if (
        value !== undefined &&
        value !== null
      ) {
        element.textContent =
          String(value);
      }
    });
  }

  function renderPreferences(
    preferences
  ) {
    if (!preferences) {
      return;
    }

    applyCheckboxValues(
      preferences
    );

    applySelectValues(
      preferences
    );
  }

  function renderNotificationSettings(
    settings
  ) {
    if (!settings) {
      return;
    }

    applyCheckboxValues(
      settings,
      "notification"
    );
  }

  function renderPrivacySettings(
    settings
  ) {
    if (!settings) {
      return;
    }

    applyCheckboxValues(
      settings,
      "privacy"
    );

    applySelectValues(
      settings,
      "privacy"
    );
  }

  /* =========================================================
     Form Binding
     ========================================================= */

  function bindForms() {
    getElements(
      "[data-settings-form]"
    ).forEach((form) => {
      if (
        form.dataset.settingsBound ===
        "true"
      ) {
        return;
      }

      form.dataset.settingsBound =
        "true";

      form.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const formData =
            new FormData(form);

          const data = {};

          formData.forEach(
            (value, key) => {
              data[key] =
                normalizeValue(value);
            }
          );

          const section =
            form.dataset.settingsSection;

          try {
            if (
              section ===
              "preferences"
            ) {
              await updatePreferences(
                data
              );
            } else if (
              section ===
              "notifications"
            ) {
              await updateNotificationSettings(
                data
              );
            } else if (
              section ===
              "privacy"
            ) {
              await updatePrivacySettings(
                data
              );
            } else {
              await updateSettings(
                data
              );
            }
          } catch {
            // تمت معالجة الخطأ للمستخدم.
          }
        }
      );
    });
  }

  /* =========================================================
     Toggle Binding
     ========================================================= */

  function bindToggles() {
    getElements(
      "[data-setting-toggle]"
    ).forEach((input) => {
      if (
        input.dataset.settingsBound ===
        "true"
      ) {
        return;
      }

      input.dataset.settingsBound =
        "true";

      input.addEventListener(
        "change",
        async () => {
          const key =
            input.dataset.settingToggle;

          if (!key) {
            return;
          }

          const value =
            Boolean(input.checked);

          const section =
            input.dataset.settingsSection ||
            "preferences";

          try {
            if (
              section ===
              "notifications"
            ) {
              await updateNotificationSettings(
                {
                  [key]: value
                }
              );
            } else if (
              section ===
              "privacy"
            ) {
              await updatePrivacySettings(
                {
                  [key]: value
                }
              );
            } else {
              await updatePreferences(
                {
                  [key]: value
                }
              );
            }
          } catch {
            /*
             * إعادة الحالة السابقة
             * إذا فشل الحفظ في الخادم.
             */
            input.checked =
              !value;
          }
        }
      );
    });
  }

  /* =========================================================
     Select Binding
     ========================================================= */

  function bindSelects() {
    getElements(
      "[data-setting-select]"
    ).forEach((select) => {
      if (
        select.dataset.settingsBound ===
        "true"
      ) {
        return;
      }

      select.dataset.settingsBound =
        "true";

      select.addEventListener(
        "change",
        async () => {
          const key =
            select.dataset.settingSelect;

          if (!key) {
            return;
          }

          const value =
            select.value;

          const section =
            select.dataset.settingsSection ||
            "preferences";

          try {
            if (
              section ===
              "privacy"
            ) {
              await updatePrivacySettings(
                {
                  [key]: value
                }
              );
            } else {
              await updatePreferences(
                {
                  [key]: value
                }
              );
            }
          } catch {
            // تمت معالجة الخطأ.
          }
        }
      );
    });
  }

  /* =========================================================
     Theme
     ========================================================= */

  async function setTheme(
    theme
  ) {
    const allowedThemes =
      CONFIG?.ui?.themes || [
        "dark",
        "light"
      ];

    if (
      !allowedThemes.includes(
        theme
      )
    ) {
      throw new Error(
        "المظهر المطلوب غير مدعوم."
      );
    }

    applyTheme(theme);

    try {
      await updatePreferences({
        theme
      });
    } catch (error) {
      /*
       * لا نترك الواجهة في حالة مختلفة
       * عن الخادم عند فشل الحفظ.
       */
      await restoreThemeFromStorage();
      throw error;
    }

    return theme;
  }

  function applyTheme(
    theme
  ) {
    document.documentElement.dataset.theme =
      theme;

    document.documentElement.classList.toggle(
      "theme-dark",
      theme === "dark"
    );

    document.documentElement.classList.toggle(
      "theme-light",
      theme === "light"
    );

    try {
      if (
        window.NOVA_STORAGE &&
        typeof window.NOVA_STORAGE.set ===
          "function"
      ) {
        window.NOVA_STORAGE.set(
          "theme",
          theme
        );
      } else {
        localStorage.setItem(
          "nova_theme",
          theme
        );
      }
    } catch (error) {
      warn(
        "Theme local save failed:",
        error
      );
    }

    dispatchEvent(
      "nova:theme:changed",
      theme
    );
  }

  async function restoreThemeFromStorage() {
    let theme = null;

    try {
      if (
        window.NOVA_STORAGE &&
        typeof window.NOVA_STORAGE.get ===
          "function"
      ) {
        theme =
          window.NOVA_STORAGE.get(
            "theme"
          );
      } else {
        theme =
          localStorage.getItem(
            "nova_theme"
          );
      }
    } catch {
      theme = null;
    }

    if (
      !theme ||
      !(
        CONFIG?.ui?.themes ||
        ["dark", "light"]
      ).includes(theme)
    ) {
      theme =
        CONFIG?.ui?.defaultTheme ||
        "dark";
    }

    applyTheme(theme);
  }

  /* =========================================================
     Language
     ========================================================= */

  async function setLanguage(
    language
  ) {
    if (
      language !== "ar" &&
      language !== "en"
    ) {
      throw new Error(
        "اللغة المطلوبة غير مدعومة."
      );
    }

    try {
      await updatePreferences({
        language
      });

      applyLanguage(
        language
      );
    } catch (error) {
      throw error;
    }
  }

  function applyLanguage(
    language
  ) {
    document.documentElement.lang =
      language;

    document.documentElement.dir =
      language === "ar"
        ? "rtl"
        : "ltr";

    document.documentElement.dataset.language =
      language;

    try {
      if (
        window.NOVA_STORAGE &&
        typeof window.NOVA_STORAGE.set ===
          "function"
      ) {
        window.NOVA_STORAGE.set(
          "language",
          language
        );
      }
    } catch {
      // التخزين المحلي اختياري.
    }

    dispatchEvent(
      "nova:language:changed",
      language
    );
  }

  /* =========================================================
     Local Preferences
     ========================================================= */

  function applyLocalPreferences(
    preferences
  ) {
    if (!preferences) {
      return;
    }

    if (
      preferences.theme
    ) {
      applyTheme(
        preferences.theme
      );
    }

    if (
      preferences.language
    ) {
      applyLanguage(
        preferences.language
      );
    }
  }

  /* =========================================================
     Input Rendering
     ========================================================= */

  function applyCheckboxValues(
    values,
    prefix = ""
  ) {
    if (!values) {
      return;
    }

    getElements(
      "[data-setting-toggle]"
    ).forEach((input) => {
      const key =
        input.dataset.settingToggle;

      const section =
        input.dataset.settingsSection ||
        "preferences";

      if (
        prefix === "notification" &&
        section !== "notifications"
      ) {
        return;
      }

      if (
        prefix === "privacy" &&
        section !== "privacy"
      ) {
        return;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          values,
          key
        )
      ) {
        input.checked =
          Boolean(values[key]);
      }
    });
  }

  function applySelectValues(
    values,
    prefix = ""
  ) {
    if (!values) {
      return;
    }

    getElements(
      "[data-setting-select]"
    ).forEach((select) => {
      const key =
        select.dataset.settingSelect;

      const section =
        select.dataset.settingsSection ||
        "preferences";

      if (
        prefix === "privacy" &&
        section !== "privacy"
      ) {
        return;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          values,
          key
        )
      ) {
        const value =
          String(values[key]);

        if (
          Array.from(
            select.options
          ).some(
            (option) =>
              option.value ===
              value
          )
        ) {
          select.value =
            value;
        }
      }
    });
  }

  /* =========================================================
     Nested Object Reader
     ========================================================= */

  function readNestedValue(
    object,
    path
  ) {
    return String(path)
      .split(".")
      .reduce(
        (current, key) => {
          if (
            current === null ||
            current === undefined
          ) {
            return undefined;
          }

          return current[key];
        },
        object
      );
  }

  /* =========================================================
     Loading State
     ========================================================= */

  function setLoadingState(
    loading
  ) {
    document.documentElement.dataset.settingsLoading =
      loading
        ? "true"
        : "false";

    getElements(
      "[data-settings-loading]"
    ).forEach((element) => {
      element.hidden =
        !loading;
    });

    getElements(
      "[data-settings-content]"
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

  /* =========================================================
     Message
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

    let toast =
      getElement(
        "[data-settings-toast]"
      );

    if (!toast) {
      toast =
        document.createElement(
          "div"
        );

      toast.dataset.settingsToast =
        "true";

      toast.setAttribute(
        "role",
        "status"
      );

      Object.assign(
        toast.style,
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
        toast
      );
    }

    toast.textContent =
      message;

    toast.dataset.type =
      type;

    requestAnimationFrame(() => {
      toast.style.opacity =
        "1";

      toast.style.transform =
        "translateY(0)";
    });

    clearTimeout(
      toast._novaTimer
    );

    toast._novaTimer =
      setTimeout(() => {
        toast.style.opacity =
          "0";

        toast.style.transform =
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

    state.initialized =
      true;

    bindForms();
    bindToggles();
    bindSelects();

    await restoreThemeFromStorage();

    try {
      await loadSettings();
    } catch {
      /*
       * لا يتم إنشاء إعدادات وهمية.
       * الصفحة تستمر بدون اختلاق حالة
       * غير موجودة على الخادم.
       */
    }

    log(
      "Settings engine initialized."
    );

    dispatchEvent(
      "nova:settings:ready",
      state
    );
  }

  /* =========================================================
     Public API
     ========================================================= */

  window.NOVA_SETTINGS = {
    state,

    init,

    loadSettings,
    updateSettings,

    getPreferences,
    updatePreferences,

    getNotificationSettings,
    updateNotificationSettings,

    getPrivacySettings,
    updatePrivacySettings,

    setTheme,
    applyTheme,

    setLanguage,
    applyLanguage,

    getState() {
      return state;
    },

    isLoading() {
      return state.loading;
    },

    isSaving() {
      return state.saving;
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
