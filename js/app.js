/* =========================================================
   NOVA — Application Core
   File: js/app.js
   Version: 1.0.0
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     Safety
     --------------------------------------------------------- */

  const APP = window.APP || {};
  const CONFIG = window.APP_CONFIG || {};

  const DEBUG =
    CONFIG.development?.debug === true;

  const log = (...args) => {
    if (DEBUG) {
      console.info("[NOVA]", ...args);
    }
  };

  const warn = (...args) => {
    if (DEBUG) {
      console.warn("[NOVA]", ...args);
    }
  };

  /* ---------------------------------------------------------
     Application State
     --------------------------------------------------------- */

  const state = {
    initialized: false,
    ready: false,
    currentPage: "",
    currentRoute: "",
    theme: "dark",
    language: "ar",
    authenticated: false,
    user: null,
    sessionChecked: false,
    navigationBound: false,
    themeBound: false
  };

  /* ---------------------------------------------------------
     Public Namespace
     --------------------------------------------------------- */

  window.NOVA_APP = window.NOVA_APP || {};

  window.NOVA_APP.state = state;

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

  function createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(
      ([key, value]) => {
        if (
          value === null ||
          value === undefined
        ) {
          return;
        }

        if (key === "class") {
          element.className = value;
          return;
        }

        if (key === "text") {
          element.textContent = value;
          return;
        }

        if (key === "html") {
          element.innerHTML = value;
          return;
        }

        if (key === "dataset") {
          Object.entries(value).forEach(
            ([dataKey, dataValue]) => {
              element.dataset[dataKey] =
                dataValue;
            }
          );
          return;
        }

        if (key in element) {
          try {
            element[key] = value;
            return;
          } catch (_) {}
        }

        element.setAttribute(
          key,
          String(value)
        );
      }
    );

    children.forEach((child) => {
      if (child instanceof Node) {
        element.appendChild(child);
      }
    });

    return element;
  }

  /* ---------------------------------------------------------
     Page Detection
     --------------------------------------------------------- */

  function getCurrentPage() {
    const path =
      window.location.pathname
        .replace(/\\/g, "/")
        .toLowerCase();

    const file =
      path.split("/").pop() || "index.html";

    if (
      file === "" ||
      file === "index" ||
      file === "index.html"
    ) {
      return "home";
    }

    if (file === "login.html") {
      return "login";
    }

    if (file === "register.html") {
      return "register";
    }

    if (file === "verify.html") {
      return "verify";
    }

    if (file === "forgot-password.html") {
      return "forgot-password";
    }

    if (file === "reset-password.html") {
      return "reset-password";
    }

    if (file === "chats.html") {
      return "chats";
    }

    if (file === "chat.html") {
      return "chat";
    }

    if (file === "calls.html") {
      return "calls";
    }

    if (file === "status.html") {
      return "status";
    }

    if (file === "contacts.html") {
      return "contacts";
    }

    if (file === "communities.html") {
      return "communities";
    }

    if (file === "profile.html") {
      return "profile";
    }

    if (file === "settings.html") {
      return "settings";
    }

    if (file === "privacy.html") {
      return "privacy";
    }

    if (file === "security.html") {
      return "security";
    }

    if (file === "devices.html") {
      return "devices";
    }

    if (file === "group.html") {
      return "group";
    }

    if (file === "create.html") {
      return "group-create";
    }

    if (file === "voice.html") {
      return "voice-call";
    }

    if (file === "video.html") {
      return "video-call";
    }

    return file.replace(".html", "");
  }

  function getCurrentRoute() {
    return window.location.pathname
      .replace(/\\/g, "/");
  }

  state.currentPage = getCurrentPage();
  state.currentRoute = getCurrentRoute();

  /* ---------------------------------------------------------
     Storage Access
     --------------------------------------------------------- */

  function getStorage() {
    if (
      window.NOVA_STORAGE &&
      typeof window.NOVA_STORAGE.get === "function"
    ) {
      return window.NOVA_STORAGE;
    }

    return null;
  }

  function storageGet(key, fallback = null) {
    const storage = getStorage();

    if (!storage) {
      return fallback;
    }

    try {
      const value = storage.get(key);

      return value === null ||
        value === undefined
        ? fallback
        : value;
    } catch (error) {
      warn("Storage read failed:", error);
      return fallback;
    }
  }

  function storageSet(key, value) {
    const storage = getStorage();

    if (!storage) {
      return false;
    }

    try {
      return storage.set(key, value);
    } catch (error) {
      warn("Storage write failed:", error);
      return false;
    }
  }

  function storageRemove(key) {
    const storage = getStorage();

    if (!storage) {
      return false;
    }

    try {
      return storage.remove(key);
    } catch (error) {
      warn("Storage remove failed:", error);
      return false;
    }
  }

  /* ---------------------------------------------------------
     Theme
     --------------------------------------------------------- */

  function getSavedTheme() {
    const storage = getStorage();

    if (
      storage &&
      storage.preferences &&
      typeof storage.preferences.get === "function"
    ) {
      try {
        const preferences =
          storage.preferences.get();

        if (
          preferences &&
          (
            preferences.theme === "dark" ||
            preferences.theme === "light"
          )
        ) {
          return preferences.theme;
        }
      } catch (error) {
        warn(
          "Could not read theme preference:",
          error
        );
      }
    }

    const saved =
      storageGet(
        CONFIG.storage?.keys?.theme ||
        "theme",
        null
      );

    if (
      saved === "dark" ||
      saved === "light"
    ) {
      return saved;
    }

    return (
      CONFIG.ui?.defaultTheme ||
      "dark"
    );
  }

  function applyTheme(theme, persist = true) {
    const normalized =
      theme === "light"
        ? "light"
        : "dark";

    state.theme = normalized;

    document.documentElement.dataset.theme =
      normalized;

    document.documentElement.classList.toggle(
      "theme-light",
      normalized === "light"
    );

    document.documentElement.classList.toggle(
      "theme-dark",
      normalized === "dark"
    );

    document.documentElement.style.colorScheme =
      normalized;

    $all(
      "[data-theme-toggle]"
    ).forEach((button) => {
      const isPressed =
        normalized === "light";

      button.setAttribute(
        "aria-pressed",
        String(isPressed)
      );

      button.dataset.active =
        String(isPressed);

      const label =
        normalized === "dark"
          ? "تفعيل الوضع الفاتح"
          : "تفعيل الوضع الداكن";

      button.setAttribute(
        "aria-label",
        label
      );

      button.title = label;
    });

    if (persist) {
      const storage =
        getStorage();

      if (
        storage &&
        storage.preferences &&
        typeof storage.preferences.update ===
          "function"
      ) {
        try {
          storage.preferences.update({
            theme: normalized
          });
        } catch (error) {
          warn(
            "Theme preference update failed:",
            error
          );
        }
      }

      storageSet(
        CONFIG.storage?.keys?.theme ||
        "theme",
        normalized
      );
    }

    document.dispatchEvent(
      new CustomEvent(
        "nova:themechange",
        {
          detail: {
            theme: normalized
          }
        }
      )
    );

    return normalized;
  }

  function toggleTheme() {
    return applyTheme(
      state.theme === "dark"
        ? "light"
        : "dark"
    );
  }

  function bindTheme() {
    if (state.themeBound) {
      return;
    }

    $all(
      "[data-theme-toggle]"
    ).forEach((button) => {
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          toggleTheme();
        }
      );
    });

    state.themeBound = true;
  }

  /* ---------------------------------------------------------
     Language
     --------------------------------------------------------- */

  function initializeLanguage() {
    const saved =
      storageGet(
        CONFIG.storage?.keys?.language ||
        "language",
        CONFIG.app?.locale || "ar"
      );

    state.language =
      saved === "ar"
        ? "ar"
        : "ar";

    document.documentElement.lang =
      state.language;

    document.documentElement.dir =
      CONFIG.app?.direction || "rtl";
  }

  /* ---------------------------------------------------------
     Authentication
     --------------------------------------------------------- */

  function getAuthModule() {
    return window.NOVA_AUTH || null;
  }

  async function validateSession() {
    const auth =
      getAuthModule();

    if (
      !auth ||
      typeof auth.validateSession !==
        "function"
    ) {
      state.sessionChecked = true;
      state.authenticated = false;
      state.user = null;

      return {
        authenticated: false,
        user: null
      };
    }

    try {
      const result =
        await auth.validateSession();

      state.sessionChecked = true;

      if (
        result &&
        (
          result.authenticated === true ||
          result.success === true
        )
      ) {
        state.authenticated = true;

        state.user =
          result.user ||
          result.data?.user ||
          null;

        return {
          authenticated: true,
          user: state.user
        };
      }

      state.authenticated = false;
      state.user = null;

      return {
        authenticated: false,
        user: null
      };
    } catch (error) {
      state.sessionChecked = true;
      state.authenticated = false;
      state.user = null;

      warn(
        "Session validation failed:",
        error
      );

      return {
        authenticated: false,
        user: null,
        error
      };
    }
  }

  function isAuthPage() {
    return [
      "login",
      "register",
      "verify",
      "forgot-password",
      "reset-password"
    ].includes(
      state.currentPage
    );
  }

  function isProtectedPage() {
    return !isAuthPage();
  }

  async function enforceAuthentication() {
    if (!isProtectedPage()) {
      return true;
    }

    const result =
      await validateSession();

    if (result.authenticated) {
      return true;
    }

    const loginRoute =
      APP.getRoute
        ? APP.getRoute("auth.login")
        : "./auth/login.html";

    const currentURL =
      window.location.href;

    try {
      sessionStorage.setItem(
        "nova_return_url",
        currentURL
      );
    } catch (_) {}

    window.location.replace(
      loginRoute
    );

    return false;
  }

  async function redirectAuthenticatedUsers() {
    if (!isAuthPage()) {
      return false;
    }

    const auth =
      getAuthModule();

    if (
      auth &&
      typeof auth.isAuthenticated ===
        "function"
    ) {
      try {
        if (auth.isAuthenticated()) {
          const home =
            APP.getRoute
              ? APP.getRoute("home")
              : "./index.html";

          window.location.replace(home);
          return true;
        }
      } catch (error) {
        warn(
          "Authentication check failed:",
          error
        );
      }
    }

    return false;
  }

  /* ---------------------------------------------------------
     Navigation
     --------------------------------------------------------- */

  function getRouteFromElement(element) {
    if (!element) {
      return null;
    }

    const route =
      element.dataset.route;

    if (route) {
      return route;
    }

    const href =
      element.getAttribute("href");

    if (
      !href ||
      href === "#" ||
      href.startsWith("javascript:")
    ) {
      return null;
    }

    return href;
  }

  function resolveNavigationTarget(route) {
    if (!route) {
      return null;
    }

    if (
      route.startsWith("/") ||
      route.startsWith("./") ||
      route.startsWith("../") ||
      route.startsWith("http://") ||
      route.startsWith("https://") ||
      route.startsWith("#")
    ) {
      return route;
    }

    if (
      APP.getRoute &&
      route.includes(".")
    ) {
      return APP.getRoute(route);
    }

    return route;
  }

  function bindNavigation() {
    if (state.navigationBound) {
      return;
    }

    $all(
      "[data-route], [data-nav], [data-page]"
    ).forEach((element) => {
      if (
        element.dataset.novaNavigationBound ===
        "true"
      ) {
        return;
      }

      element.addEventListener(
        "click",
        (event) => {
          const route =
            element.dataset.route ||
            element.dataset.nav ||
            element.dataset.page ||
            getRouteFromElement(element);

          if (!route) {
            return;
          }

          if (
            element.tagName === "A" &&
            element.getAttribute("href")
          ) {
            return;
          }

          event.preventDefault();

          navigate(route);
        }
      );

      element.dataset.novaNavigationBound =
        "true";
    });

    $all(
      "a[href]"
    ).forEach((link) => {
      if (
        link.dataset.novaLinkBound ===
        "true"
      ) {
        return;
      }

      const href =
        link.getAttribute("href");

      if (
        !href ||
        href === "#" ||
        href.startsWith("#") ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      link.dataset.novaLinkBound =
        "true";
    });

    state.navigationBound = true;
  }

  function navigate(route) {
    const target =
      resolveNavigationTarget(route);

    if (!target) {
      return false;
    }

    if (
      target.startsWith("#")
    ) {
      const targetElement =
        document.querySelector(target);

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        return true;
      }

      return false;
    }

    window.location.href =
      target;

    return true;
  }

  /* ---------------------------------------------------------
     Active Navigation State
     --------------------------------------------------------- */

  function normalizePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  function markActiveNavigation() {
    const current =
      normalizePath(
        window.location.pathname
      );

    $all(
      "[data-route], [data-nav]"
    ).forEach((element) => {
      const route =
        element.dataset.route ||
        element.dataset.nav;

      if (!route) {
        return;
      }

      const target =
        normalizePath(
          resolveNavigationTarget(route)
        );

      const active =
        target &&
        (
          current.endsWith(target) ||
          current === target
        );

      element.classList.toggle(
        "is-active",
        Boolean(active)
      );

      element.setAttribute(
        "aria-current",
        active
          ? "page"
          : "false"
      );
    });
  }

  /* ---------------------------------------------------------
     Feature Visibility
     --------------------------------------------------------- */

  function featureEnabled(feature) {
    if (
      typeof APP.isFeatureEnabled ===
      "function"
    ) {
      return APP.isFeatureEnabled(
        feature
      );
    }

    return false;
  }

  function applyFeatureVisibility() {
    $all(
      "[data-feature]"
    ).forEach((element) => {
      const feature =
        element.dataset.feature;

      if (!feature) {
        return;
      }

      const enabled =
        featureEnabled(feature);

      element.hidden =
        !enabled;

      element.setAttribute(
        "aria-hidden",
        String(!enabled)
      );
    });
  }

  /* ---------------------------------------------------------
     User UI
     --------------------------------------------------------- */

  function updateUserElements() {
    const user =
      state.user;

    $all(
      "[data-user-name]"
    ).forEach((element) => {
      if (!user) {
        element.textContent = "";
        return;
      }

      element.textContent =
        user.name ||
        user.displayName ||
        "";
    });

    $all(
      "[data-user-email]"
    ).forEach((element) => {
      element.textContent =
        user?.email || "";
    });

    $all(
      "[data-user-phone]"
    ).forEach((element) => {
      element.textContent =
        user?.phone || "";
    });

    $all(
      "[data-user-avatar]"
    ).forEach((element) => {
      const avatar =
        user?.avatar ||
        user?.photoURL ||
        user?.photo ||
        "";

      if (avatar) {
        element.src = avatar;
        element.removeAttribute(
          "data-empty"
        );
      } else {
        element.removeAttribute(
          "src"
        );
        element.dataset.empty =
          "true";
      }
    });
  }

  /* ---------------------------------------------------------
     Global Loading State
     --------------------------------------------------------- */

  function setAppLoading(
    loading,
    message = ""
  ) {
    document.documentElement.dataset.loading =
      String(Boolean(loading));

    const loader =
      $("#app-loader");

    if (!loader) {
      return;
    }

    loader.setAttribute(
      "aria-hidden",
      String(!loading)
    );

    loader.classList.toggle(
      "is-hidden",
      !loading
    );

    if (message) {
      const messageElement =
        $(
          "[data-loader-message]",
          loader
        );

      if (messageElement) {
        messageElement.textContent =
          message;
      }
    }
  }

  /* ---------------------------------------------------------
     Global Error Handling
     --------------------------------------------------------- */

  function showApplicationError(
    message
  ) {
    const existing =
      $("#nova-global-error");

    if (existing) {
      existing.remove();
    }

    const wrapper =
      createElement(
        "div",
        {
          id: "nova-global-error",
          class:
            "nova-global-error",
          role: "alert"
        }
      );

    const text =
      createElement(
        "span",
        {
          class:
            "nova-global-error__text",
          text:
            message ||
            "حدث خطأ غير متوقع."
        }
      );

    const close =
      createElement(
        "button",
        {
          type: "button",
          class:
            "nova-global-error__close",
          text: "×",
          "aria-label":
            "إغلاق"
        }
      );

    close.addEventListener(
      "click",
      () => {
        wrapper.remove();
      }
    );

    wrapper.append(
      text,
      close
    );

    document.body.appendChild(
      wrapper
    );

    window.setTimeout(() => {
      if (
        document.body.contains(
          wrapper
        )
      ) {
        wrapper.remove();
      }
    }, 6000);
  }

  function bindGlobalErrors() {
    window.addEventListener(
      "error",
      (event) => {
        warn(
          "Global error:",
          event.error ||
            event.message
        );
      }
    );

    window.addEventListener(
      "unhandledrejection",
      (event) => {
        warn(
          "Unhandled promise rejection:",
          event.reason
        );
      }
    );
  }

  /* ---------------------------------------------------------
     Online / Offline
     --------------------------------------------------------- */

  function updateConnectionState() {
    const online =
      navigator.onLine;

    document.documentElement.dataset.connection =
      online
        ? "online"
        : "offline";

    $all(
      "[data-connection-status]"
    ).forEach((element) => {
      element.textContent =
        online
          ? "متصل"
          : "غير متصل";

      element.dataset.status =
        online
          ? "online"
          : "offline";
    });

    document.dispatchEvent(
      new CustomEvent(
        "nova:connectionchange",
        {
          detail: {
            online
          }
        }
      )
    );
  }

  function bindConnectionEvents() {
    window.addEventListener(
      "online",
      updateConnectionState
    );

    window.addEventListener(
      "offline",
      updateConnectionState
    );

    updateConnectionState();
  }

  /* ---------------------------------------------------------
     Accessibility
     --------------------------------------------------------- */

  function initializeAccessibility() {
    document.documentElement.dataset.reducedMotion =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
        ? "true"
        : "false";

    if (
      window.matchMedia
    ) {
      const media =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        );

      const handler =
        (event) => {
          document.documentElement.dataset.reducedMotion =
            String(event.matches);
        };

      if (
        typeof media.addEventListener ===
        "function"
      ) {
        media.addEventListener(
          "change",
          handler
        );
      }
    }
  }

  /* ---------------------------------------------------------
     Dynamic Year
     --------------------------------------------------------- */

  function updateDynamicYear() {
    const year =
      new Date().getFullYear();

    $all(
      "[data-current-year]"
    ).forEach((element) => {
      element.textContent =
        String(year);
    });
  }

  /* ---------------------------------------------------------
     Page Metadata
     --------------------------------------------------------- */

  function initializePageMetadata() {
    document.documentElement.dataset.page =
      state.currentPage;

    document.documentElement.dataset.route =
      state.currentRoute;

    const body =
      document.body;

    if (body) {
      body.dataset.page =
        state.currentPage;
    }
  }

  /* ---------------------------------------------------------
     Logout Binding
     --------------------------------------------------------- */

  function bindLogout() {
    $all(
      "[data-logout]"
    ).forEach((button) => {
      if (
        button.dataset.novaLogoutBound ===
        "true"
      ) {
        return;
      }

      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();

          const auth =
            getAuthModule();

          if (
            !auth ||
            typeof auth.logout !==
              "function"
          ) {
            return;
          }

          button.disabled = true;

          try {
            await auth.logout();

            state.authenticated =
              false;

            state.user =
              null;

            const login =
              APP.getRoute
                ? APP.getRoute(
                    "auth.login"
                  )
                : "./auth/login.html";

            window.location.replace(
              login
            );
          } catch (error) {
            button.disabled = false;

            warn(
              "Logout failed:",
              error
            );

            showApplicationError(
              "تعذر تسجيل الخروج حاليًا."
            );
          }
        }
      );

      button.dataset.novaLogoutBound =
        "true";
    });
  }

  /* ---------------------------------------------------------
     Global Click Protection
     --------------------------------------------------------- */

  function bindButtonGuards() {
    $all(
      "button[type='button'][data-disabled]"
    ).forEach((button) => {
      if (
        button.dataset.disabled ===
        "true"
      ) {
        button.disabled = true;
      }
    });
  }

  /* ---------------------------------------------------------
     Application Events
     --------------------------------------------------------- */

  function dispatchReady() {
    document.dispatchEvent(
      new CustomEvent(
        "nova:ready",
        {
          detail: {
            state
          }
        }
      )
    );
  }

  function dispatchPageReady() {
    document.dispatchEvent(
      new CustomEvent(
        "nova:page-ready",
        {
          detail: {
            page:
              state.currentPage,
            route:
              state.currentRoute
          }
        }
      )
    );
  }

  /* ---------------------------------------------------------
     Module Hooks
     --------------------------------------------------------- */

  function initializeModules() {
    const modules = [
      "NOVA_CHAT",
      "NOVA_CALLS",
      "NOVA_STATUS",
      "NOVA_GROUPS",
      "NOVA_NOTIFICATIONS",
      "NOVA_PROFILE",
      "NOVA_SETTINGS"
    ];

    modules.forEach((name) => {
      const module =
        window[name];

      if (
        module &&
        typeof module.init ===
          "function"
      ) {
        try {
          const result =
            module.init();

          if (
            result &&
            typeof result.then ===
              "function"
          ) {
            result.catch(
              (error) => {
                warn(
                  `${name}.init failed:`,
                  error
                );
              }
            );
          }
        } catch (error) {
          warn(
            `${name}.init failed:`,
            error
          );
        }
      }
    });
  }

  /* ---------------------------------------------------------
     Application Initialization
     --------------------------------------------------------- */

  async function init() {
    if (state.initialized) {
      return window.NOVA_APP;
    }

    state.initialized = true;

    log("Initializing application...");

    try {
      initializePageMetadata();

      initializeLanguage();

      const initialTheme =
        getSavedTheme();

      applyTheme(
        initialTheme,
        false
      );

      bindTheme();

      bindNavigation();

      markActiveNavigation();

      applyFeatureVisibility();

      bindLogout();

      bindButtonGuards();

      bindConnectionEvents();

      initializeAccessibility();

      updateDynamicYear();

      bindGlobalErrors();

      /*
       * Authentication is checked only after
       * basic UI initialization so the page
       * never appears frozen while waiting
       * for a backend response.
       */

      if (isProtectedPage()) {
        await enforceAuthentication();
      } else {
        await redirectAuthenticatedUsers();

        /*
         * On auth pages we still validate the
         * session when possible so state remains
         * synchronized.
         */
        await validateSession();
      }

      updateUserElements();

      initializeModules();

      state.ready = true;

      dispatchReady();

      dispatchPageReady();

      log(
        `Application ready — page: ${state.currentPage}`
      );

      return window.NOVA_APP;
    } catch (error) {
      warn(
        "Application initialization failed:",
        error
      );

      state.ready = false;

      /*
       * Do not leave the application visually
       * blocked if one module fails.
       */
      setAppLoading(false);

      return window.NOVA_APP;
    }
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.NOVA_APP.init =
    init;

  window.NOVA_APP.navigate =
    navigate;

  window.NOVA_APP.getCurrentPage =
    () => state.currentPage;

  window.NOVA_APP.getCurrentRoute =
    () => state.currentRoute;

  window.NOVA_APP.getUser =
    () => state.user;

  window.NOVA_APP.isAuthenticated =
    () => state.authenticated;

  window.NOVA_APP.validateSession =
    validateSession;

  window.NOVA_APP.applyTheme =
    applyTheme;

  window.NOVA_APP.toggleTheme =
    toggleTheme;

  window.NOVA_APP.featureEnabled =
    featureEnabled;

  window.NOVA_APP.refreshUI =
    () => {
      state.currentPage =
        getCurrentPage();

      state.currentRoute =
        getCurrentRoute();

      initializePageMetadata();
      markActiveNavigation();
      applyFeatureVisibility();
      updateUserElements();
      updateDynamicYear();
    };

  /* ---------------------------------------------------------
     DOM Ready
     --------------------------------------------------------- */

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
  } else {
    init();
  }

})();
