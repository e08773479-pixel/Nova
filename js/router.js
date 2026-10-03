/* =========================================================
   NOVA — Application Router
   File: js/router.js
   Version: 1.0.0
   ========================================================= */

(() => {
  "use strict";

  const APP =
    window.APP || {};

  const CONFIG =
    window.APP_CONFIG || {};

  const DEBUG =
    CONFIG.development?.debug === true;

  const log = (...args) => {
    if (DEBUG) {
      console.info(
        "[NOVA ROUTER]",
        ...args
      );
    }
  };

  const warn = (...args) => {
    if (DEBUG) {
      console.warn(
        "[NOVA ROUTER]",
        ...args
      );
    }
  };

  /* ---------------------------------------------------------
     Router State
     --------------------------------------------------------- */

  const state = {
    initialized: false,
    navigating: false,
    currentPath: "",
    currentRoute: "",
    previousPath: "",
    history: [],
    guards: [],
    listeners: []
  };

  window.NOVA_ROUTER =
    window.NOVA_ROUTER || {};

  window.NOVA_ROUTER.state =
    state;

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function normalizePath(path = "") {
    return String(path)
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  function getCurrentPath() {
    return normalizePath(
      window.location.pathname
    );
  }

  function getCurrentFile() {
    const path =
      getCurrentPath();

    const parts =
      path.split("/");

    return (
      parts.pop() ||
      "index.html"
    );
  }

  function isExternalURL(url) {
    return (
      /^https?:\/\//i.test(url) ||
      /^mailto:/i.test(url) ||
      /^tel:/i.test(url)
    );
  }

  function isHashURL(url) {
    return String(url)
      .startsWith("#");
  }

  function isSameOrigin(url) {
    try {
      const parsed =
        new URL(
          url,
          window.location.href
        );

      return (
        parsed.origin ===
        window.location.origin
      );
    } catch (_) {
      return false;
    }
  }

  function resolveRoute(route) {
    if (!route) {
      return null;
    }

    const value =
      String(route).trim();

    if (!value) {
      return null;
    }

    if (
      isExternalURL(value) ||
      isHashURL(value)
    ) {
      return value;
    }

    /*
     * Named route:
     *
     * auth.login
     * pages.chat
     * calls.video
     */
    if (
      value.includes(".") &&
      APP.getRoute
    ) {
      const resolved =
        APP.getRoute(value);

      if (resolved) {
        return resolved;
      }
    }

    /*
     * Already a relative path.
     */
    if (
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("/")
    ) {
      return value;
    }

    /*
     * Plain filename.
     */
    return `./${value}`;
  }

  function getAbsoluteURL(target) {
    try {
      return new URL(
        target,
        window.location.href
      );
    } catch (_) {
      return null;
    }
  }

  /* ---------------------------------------------------------
     Route Matching
     --------------------------------------------------------- */

  function getRouteNameFromPath(path) {
    const normalized =
      normalizePath(path);

    const routes =
      CONFIG.routes || {};

    function walk(
      object,
      prefix = ""
    ) {
      for (
        const [key, value]
        of Object.entries(object)
      ) {
        const routeName =
          prefix
            ? `${prefix}.${key}`
            : key;

        if (
          typeof value ===
          "string"
        ) {
          const resolved =
            resolveRoute(value);

          const absolute =
            getAbsoluteURL(
              resolved
            );

          if (!absolute) {
            continue;
          }

          if (
            normalizePath(
              absolute.pathname
            ) === normalized
          ) {
            return routeName;
          }
        }

        if (
          value &&
          typeof value ===
            "object"
        ) {
          const result =
            walk(
              value,
              routeName
            );

          if (result) {
            return result;
          }
        }
      }

      return null;
    }

    return walk(routes);
  }

  function routeExists(route) {
    if (!route) {
      return false;
    }

    if (
      !CONFIG.routes ||
      !APP.getRoute
    ) {
      return false;
    }

    const parts =
      String(route)
        .split(".");

    let current =
      CONFIG.routes;

    for (const part of parts) {
      if (
        !current ||
        !(part in current)
      ) {
        return false;
      }

      current =
        current[part];
    }

    return typeof current ===
      "string";
  }

  /* ---------------------------------------------------------
     Authentication
     --------------------------------------------------------- */

  function getAuth() {
    return (
      window.NOVA_AUTH ||
      null
    );
  }

  function isAuthPage(path) {
    const route =
      getRouteNameFromPath(
        path
      );

    return [
      "auth.login",
      "auth.register",
      "auth.verify",
      "auth.forgotPassword",
      "auth.resetPassword"
    ].includes(route);
  }

  function isPublicRoute(path) {
    return isAuthPage(path);
  }

  function isAuthenticated() {
    const auth =
      getAuth();

    if (
      auth &&
      typeof auth.isAuthenticated ===
        "function"
    ) {
      try {
        return Boolean(
          auth.isAuthenticated()
        );
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
     Route Guards
     --------------------------------------------------------- */

  function addGuard(
    guard
  ) {
    if (
      typeof guard !==
      "function"
    ) {
      return () => {};
    }

    state.guards.push(
      guard
    );

    return () => {
      const index =
        state.guards.indexOf(
          guard
        );

      if (index >= 0) {
        state.guards.splice(
          index,
          1
        );
      }
    };
  }

  async function runGuards(
    target,
    options = {}
  ) {
    for (
      const guard
      of state.guards
    ) {
      try {
        const result =
          await guard(
            target,
            options
          );

        if (
          result === false
        ) {
          return false;
        }
      } catch (error) {
        warn(
          "Route guard failed:",
          error
        );

        return false;
      }
    }

    return true;
  }

  async function authenticationGuard(
    target
  ) {
    const absolute =
      getAbsoluteURL(
        target
      );

    if (!absolute) {
      return false;
    }

    const path =
      absolute.pathname;

    /*
     * Public authentication pages
     * do not require an active session.
     */
    if (
      isPublicRoute(path)
    ) {
      return true;
    }

    const auth =
      getAuth();

    if (!auth) {
      return true;
    }

    if (
      typeof auth.validateSession !==
      "function"
    ) {
      return true;
    }

    try {
      const result =
        await auth.validateSession();

      const authenticated =
        Boolean(
          result?.authenticated ||
          result?.success
        );

      if (
        !authenticated
      ) {
        const login =
          APP.getRoute
            ? APP.getRoute(
                "auth.login"
              )
            : "./auth/login.html";

        /*
         * Save destination so
         * login can return the user.
         */
        try {
          sessionStorage.setItem(
            "nova_return_url",
            window.location.href
          );
        } catch (_) {}

        window.location.replace(
          login
        );

        return false;
      }

      return true;
    } catch (error) {
      warn(
        "Session validation failed:",
        error
      );

      /*
       * We do not manufacture
       * a session or user here.
       */
      return false;
    }
  }

  /* ---------------------------------------------------------
     Navigation
     --------------------------------------------------------- */

  async function navigate(
    route,
    options = {}
  ) {
    if (
      state.navigating
    ) {
      return false;
    }

    const target =
      resolveRoute(route);

    if (!target) {
      warn(
        "Invalid route:",
        route
      );

      return false;
    }

    if (
      isExternalURL(target)
    ) {
      window.location.href =
        target;

      return true;
    }

    if (
      isHashURL(target)
    ) {
      const element =
        document.querySelector(
          target
        );

      if (element) {
        element.scrollIntoView({
          behavior:
            options.instant
              ? "auto"
              : "smooth",
          block: "start"
        });

        return true;
      }

      return false;
    }

    const absolute =
      getAbsoluteURL(
        target
      );

    if (
      !absolute ||
      !isSameOrigin(target)
    ) {
      window.location.href =
        target;

      return true;
    }

    const allowed =
      await runGuards(
        absolute.href,
        options
      );

    if (!allowed) {
      return false;
    }

    state.navigating =
      true;

    state.previousPath =
      state.currentPath;

    state.currentPath =
      normalizePath(
        absolute.pathname
      );

    state.currentRoute =
      getRouteNameFromPath(
        state.currentPath
      ) || "";

    state.history.push({
      from:
        state.previousPath,
      to:
        state.currentPath,
      route:
        state.currentRoute,
      timestamp:
        Date.now()
    });

    const eventDetail = {
      from:
        state.previousPath,
      to:
        state.currentPath,
      route:
        state.currentRoute,
      url:
        absolute.href
    };

    document.dispatchEvent(
      new CustomEvent(
        "nova:navigation-start",
        {
          detail:
            eventDetail
        }
      )
    );

    try {
      if (
        options.replace
      ) {
        window.location.replace(
          absolute.href
        );
      } else {
        window.location.href =
          absolute.href;
      }

      return true;
    } finally {
      window.setTimeout(
        () => {
          state.navigating =
            false;
        },
        1000
      );
    }
  }

  /* ---------------------------------------------------------
     Link Binding
     --------------------------------------------------------- */

  function bindLinks(
    root = document
  ) {
    const links =
      Array.from(
        root.querySelectorAll(
          "a[href], [data-route], [data-nav]"
        )
      );

    links.forEach(
      (element) => {
        if (
          element.dataset
            .novaRouterBound ===
          "true"
        ) {
          return;
        }

        element.addEventListener(
          "click",
          async (event) => {
            /*
             * Allow browser defaults for:
             * Ctrl + click
             * Cmd + click
             * middle click
             */
            if (
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }

            const route =
              element.dataset.route ||
              element.dataset.nav ||
              element.getAttribute(
                "href"
              );

            if (!route) {
              return;
            }

            if (
              route === "#" ||
              route.startsWith(
                "javascript:"
              ) ||
              isExternalURL(route) ||
              isHashURL(route)
            ) {
              return;
            }

            event.preventDefault();

            await navigate(
              route
            );
          }
        );

        element.dataset
          .novaRouterBound =
          "true";
      }
    );
  }

  /* ---------------------------------------------------------
     Active Link
     --------------------------------------------------------- */

  function updateActiveLinks() {
    const current =
      normalizePath(
        window.location.pathname
      );

    const elements =
      Array.from(
        document.querySelectorAll(
          "[data-route], [data-nav], a[href]"
        )
      );

    elements.forEach(
      (element) => {
        const route =
          element.dataset.route ||
          element.dataset.nav ||
          element.getAttribute(
            "href"
          );

        if (!route) {
          return;
        }

        if (
          route === "#" ||
          isExternalURL(route) ||
          isHashURL(route)
        ) {
          return;
        }

        const target =
          resolveRoute(route);

        const absolute =
          getAbsoluteURL(
            target
          );

        if (!absolute) {
          return;
        }

        const targetPath =
          normalizePath(
            absolute.pathname
          );

        const active =
          current === targetPath;

        element.classList.toggle(
          "is-active",
          active
        );

        if (active) {
          element.setAttribute(
            "aria-current",
            "page"
          );
        } else {
          element.removeAttribute(
            "aria-current"
          );
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Browser History
     --------------------------------------------------------- */

  function handlePopState() {
    state.previousPath =
      state.currentPath;

    state.currentPath =
      getCurrentPath();

    state.currentRoute =
      getRouteNameFromPath(
        state.currentPath
      ) || "";

    updateActiveLinks();

    document.dispatchEvent(
      new CustomEvent(
        "nova:navigation-change",
        {
          detail: {
            from:
              state.previousPath,
            to:
              state.currentPath,
            route:
              state.currentRoute
          }
        }
      )
    );
  }

  /* ---------------------------------------------------------
     Route Utilities
     --------------------------------------------------------- */

  function getRoute(
    name
  ) {
    if (
      !routeExists(name)
    ) {
      return null;
    }

    return resolveRoute(
      name
    );
  }

  function getRouteInfo(
    route
  ) {
    const target =
      resolveRoute(route);

    if (!target) {
      return null;
    }

    const absolute =
      getAbsoluteURL(
        target
      );

    if (!absolute) {
      return null;
    }

    return {
      name:
        getRouteNameFromPath(
          absolute.pathname
        ),
      path:
        normalizePath(
          absolute.pathname
        ),
      url:
        absolute.href,
      public:
        isPublicRoute(
          absolute.pathname
        )
    };
  }

  function goBack(
    fallback = "home"
  ) {
    if (
      window.history.length > 1
    ) {
      window.history.back();
      return true;
    }

    return navigate(
      fallback
    );
  }

  /* ---------------------------------------------------------
     Prefetch
     --------------------------------------------------------- */

  function prefetch(
    route
  ) {
    const target =
      resolveRoute(route);

    if (
      !target ||
      isExternalURL(target) ||
      isHashURL(target)
    ) {
      return false;
    }

    const absolute =
      getAbsoluteURL(
        target
      );

    if (!absolute) {
      return false;
    }

    /*
     * Prefetch only same-origin
     * documents. No API/database
     * request is generated here.
     */
    if (
      absolute.origin !==
      window.location.origin
    ) {
      return false;
    }

    const existing =
      document.querySelector(
        `link[rel="prefetch"][href="${absolute.href}"]`
      );

    if (existing) {
      return true;
    }

    const link =
      document.createElement(
        "link"
      );

    link.rel =
      "prefetch";

    link.href =
      absolute.href;

    document.head.appendChild(
      link
    );

    return true;
  }

  function bindPrefetch() {
    document.addEventListener(
      "mouseover",
      (event) => {
        const link =
          event.target.closest(
            "a[href], [data-route]"
          );

        if (!link) {
          return;
        }

        const route =
          link.dataset.route ||
          link.getAttribute(
            "href"
          );

        if (route) {
          prefetch(route);
        }
      },
      {
        passive: true
      }
    );
  }

  /* ---------------------------------------------------------
     Initialize
     --------------------------------------------------------- */

  function init() {
    if (
      state.initialized
    ) {
      return;
    }

    state.initialized =
      true;

    state.currentPath =
      getCurrentPath();

    state.currentRoute =
      getRouteNameFromPath(
        state.currentPath
      ) || "";

    /*
     * Authentication guard is
     * registered once.
     */
    addGuard(
      authenticationGuard
    );

    bindLinks();

    updateActiveLinks();

    bindPrefetch();

    window.addEventListener(
      "popstate",
      handlePopState
    );

    document.dispatchEvent(
      new CustomEvent(
        "nova:router-ready",
        {
          detail: {
            path:
              state.currentPath,
            route:
              state.currentRoute
          }
        }
      )
    );

    log(
      "Router initialized:",
      state.currentRoute ||
        state.currentPath
    );
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.NOVA_ROUTER.init =
    init;

  window.NOVA_ROUTER.navigate =
    navigate;

  window.NOVA_ROUTER.goBack =
    goBack;

  window.NOVA_ROUTER.getRoute =
    getRoute;

  window.NOVA_ROUTER.getRouteInfo =
    getRouteInfo;

  window.NOVA_ROUTER.routeExists =
    routeExists;

  window.NOVA_ROUTER.resolveRoute =
    resolveRoute;

  window.NOVA_ROUTER.addGuard =
    addGuard;

  window.NOVA_ROUTER.prefetch =
    prefetch;

  window.NOVA_ROUTER.bindLinks =
    bindLinks;

  window.NOVA_ROUTER.updateActiveLinks =
    updateActiveLinks;

  window.NOVA_ROUTER.getCurrentPath =
    getCurrentPath;

  window.NOVA_ROUTER.getCurrentRoute =
    () =>
      state.currentRoute;

  /* ---------------------------------------------------------
     Start
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
