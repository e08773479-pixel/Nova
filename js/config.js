/* =========================================================
   NOVA — Global Configuration
   Version: 1.0.0
   ========================================================= */

(() => {
  "use strict";

  /*
   * =======================================================
   * Application Configuration
   * =======================================================
   */

  const CONFIG = {

    /* -------------------------------------------------------
       Application Identity
    ------------------------------------------------------- */

    app: {
      name: "NOVA",
      shortName: "NOVA",
      version: "1.0.0",

      description:
        "NOVA — منصة حديثة للمراسلة والتواصل والمكالمات والمجتمعات.",

      locale: "ar",
      direction: "rtl",
      timezone: "Africa/Cairo"
    },


    /* -------------------------------------------------------
       Brand
    ------------------------------------------------------- */

    brand: {

      name: "NOVA",

      /*
       * الرمز الحالي مؤقت.
       * الأيقونة النهائية ستكون SVG داخل assets/brand.
       */

      icon: "./assets/brand/logo.svg",
      favicon: "./assets/brand/favicon.svg",

      tagline: "تواصل ببساطة",

      colors: {
        primary: "#20D47B",
        primaryDark: "#12A85E",

        background: "#06110D",
        backgroundSecondary: "#081914",

        surface: "#0C1D17",
        surfaceElevated: "#10271F",

        border: "rgba(255,255,255,0.08)",

        text: "#F4FAF7",
        textSecondary: "#C7D4CE",
        muted: "#9CAFA8",

        success: "#20D47B",
        warning: "#F2C94C",
        danger: "#FF5C67",
        info: "#5AA9FF"
      }
    },


    /* -------------------------------------------------------
       Environment
    ------------------------------------------------------- */

    environment: "development",

    development: {

      debug: true,

      /*
       * مهم:
       * لا نستخدم بيانات وهمية باعتبارها بيانات حقيقية.
       */

      mockData: false,
      fakeUsers: false,
      fakeMessages: false,
      fakeGroups: false,
      fakeStatistics: false,
      fakeBalances: false,

      showDevelopmentTools: true
    },


    /* -------------------------------------------------------
       Base Path
       ------------------------------------------------------- */

    /*
     * يفضل تركه فارغًا عند تشغيل المشروع من جذر الموقع.
     *
     * مثال GitHub Pages:
     *
     * basePath: "/nova"
     *
     * ويتم تعديل القيمة حسب اسم Repository.
     */

    basePath: "",


    /* -------------------------------------------------------
       API
       ------------------------------------------------------- */

    api: {

      baseURL: "/api",

      version: "v1",

      timeout: 15000,

      credentials: "include",

      endpoints: {

        auth: "/auth",

        users: "/users",

        profiles: "/profiles",

        contacts: "/contacts",

        conversations: "/conversations",

        messages: "/messages",

        attachments: "/attachments",

        groups: "/groups",

        communities: "/communities",

        statuses: "/statuses",

        calls: "/calls",

        notifications: "/notifications",

        devices: "/devices",

        privacy: "/privacy",

        security: "/security",

        uploads: "/uploads"
      }
    },


    /* -------------------------------------------------------
       Routes
       ------------------------------------------------------- */

    routes: {

      home: "index.html",

      auth: {

        login: "auth/login.html",

        register: "auth/register.html",

        verify: "auth/verify.html",

        forgotPassword:
          "auth/forgot-password.html",

        resetPassword:
          "auth/reset-password.html"
      },


      pages: {

        chats:
          "pages/chats.html",

        chat:
          "pages/chat.html",

        calls:
          "pages/calls.html",

        status:
          "pages/status.html",

        contacts:
          "pages/contacts.html",

        communities:
          "pages/communities.html",

        profile:
          "pages/profile.html",

        settings:
          "pages/settings.html",

        privacy:
          "pages/privacy.html",

        security:
          "pages/security.html",

        devices:
          "pages/devices.html"
      },


      groups: {

        group:
          "groups/group.html",

        create:
          "groups/create.html",

        settings:
          "groups/settings.html"
      },


      calls: {

        voice:
          "calls/voice.html",

        video:
          "calls/video.html"
      }
    },


    /* -------------------------------------------------------
       Features
       ------------------------------------------------------- */

    features: {

      /* Authentication */

      authentication: true,

      phoneLogin: true,

      emailLogin: true,

      googleLogin: true,

      passwordReset: true,

      accountVerification: true,


      /* Messaging */

      messaging: true,

      privateMessaging: true,

      groupMessaging: true,

      mediaMessages: true,

      imageMessages: true,

      videoMessages: true,

      audioMessages: true,

      voiceMessages: true,

      documentMessages: true,

      locationSharing: true,

      contactSharing: true,


      /* Message Actions */

      reactions: true,

      replies: true,

      forwarding: true,

      messageEditing: true,

      messageDeletion: true,

      messagePinning: true,

      messageSearch: true,

      messageCopy: true,

      messageSelection: true,


      /* Calls */

      voiceCalls: true,

      videoCalls: true,

      callHistory: true,

      callNotifications: true,


      /* Status */

      status: true,

      statusText: true,

      statusMedia: true,

      statusViews: true,


      /* Groups */

      groups: true,

      groupAdmins: true,

      groupPermissions: true,

      groupInviteLinks: true,


      /* Communities */

      communities: true,

      communityChannels: true,

      communityAnnouncements: true,


      /* Contacts */

      contacts: true,

      contactSync: true,


      /* User */

      profile: true,

      profilePhoto: true,

      profileAbout: true,


      /* Notifications */

      notifications: true,

      pushNotifications: true,


      /* Privacy */

      privacy: true,

      lastSeenPrivacy: true,

      profilePhotoPrivacy: true,

      statusPrivacy: true,

      readReceipts: true,


      /* Security */

      security: true,

      twoStepVerification: true,

      linkedDevices: true,

      sessionManagement: true,


      /* Interface */

      darkMode: true,

      lightMode: true,

      responsiveLayout: true,

      accessibility: true
    },


    /* -------------------------------------------------------
       Storage
       ------------------------------------------------------- */

    storage: {

      prefix: "nova_",

      type: "localStorage",

      keys: {

        theme:
          "theme",

        language:
          "language",

        onboarding:
          "onboarding",

        uiPreferences:
          "ui_preferences",

        draftMessages:
          "draft_messages",

        sessionState:
          "session_state"
      }
    },


    /* -------------------------------------------------------
       UI
       ------------------------------------------------------- */

    ui: {

      defaultTheme: "dark",

      themes: [
        "dark",
        "light"
      ],

      direction: "rtl",

      animation: {

        enabled: true,

        duration: 250
      },

      breakpoints: {

        mobile: 576,

        tablet: 768,

        desktop: 1024,

        wide: 1440
      }
    },


    /* -------------------------------------------------------
       Uploads
       ------------------------------------------------------- */

    uploads: {

      maxImageSizeMB: 10,

      maxVideoSizeMB: 100,

      maxAudioSizeMB: 50,

      maxDocumentSizeMB: 50,


      allowedImages: [

        "image/jpeg",

        "image/png",

        "image/webp",

        "image/gif"
      ],


      allowedVideos: [

        "video/mp4",

        "video/webm",

        "video/quicktime"
      ],


      allowedAudio: [

        "audio/mpeg",

        "audio/mp4",

        "audio/wav",

        "audio/webm",

        "audio/ogg"
      ],


      allowedDocuments: [

        "application/pdf",

        "text/plain",

        "application/msword",

        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        "application/vnd.ms-excel",

        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ]
    },


    /* -------------------------------------------------------
       Messaging
       ------------------------------------------------------- */

    messaging: {

      maxMessageLength: 4096,

      typingIndicatorDelay: 500,

      draftAutoSave: true,


      pagination: {

        messagesPerPage: 50,

        conversationsPerPage: 30,

        contactsPerPage: 50
      },


      status: [

        "sending",

        "sent",

        "delivered",

        "read",

        "failed"
      ]
    },


    /* -------------------------------------------------------
       Realtime
       ------------------------------------------------------- */

    realtime: {

      enabled: false,

      websocketURL: "",

      reconnect: {

        enabled: true,

        maxAttempts: 10,

        delay: 2000,

        maxDelay: 30000
      }
    },


    /* -------------------------------------------------------
       Calls
       ------------------------------------------------------- */

    calls: {

      enabled: true,

      voice: true,

      video: true,

      maxParticipants: 50,

      signaling: {

        enabled: false
      },

      webrtc: {

        enabled: false
      }
    },


    /* -------------------------------------------------------
       Notifications
       ------------------------------------------------------- */

    notifications: {

      enabled: true,

      types: [

        "message",

        "reaction",

        "mention",

        "group",

        "community",

        "call",

        "security"
      ]
    },


    /* -------------------------------------------------------
       Security
       ------------------------------------------------------- */

    security: {

      requireHTTPSInProduction: true,

      session: {

        rememberMe: true,

        timeoutMinutes: 60
      },


      password: {

        minimumLength: 8,

        requireUppercase: false,

        requireNumber: true,

        requireSpecialCharacter: false
      },


      twoStepVerification: true,

      deviceManagement: true,

      sessionManagement: true
    }
  };


  /* =========================================================
     Deep Freeze
     ========================================================= */

  function deepFreeze(object) {

    if (
      !object ||
      typeof object !== "object"
    ) {
      return object;
    }


    Object.getOwnPropertyNames(object)
      .forEach((property) => {

        const value = object[property];

        if (
          value &&
          typeof value === "object" &&
          !Object.isFrozen(value)
        ) {

          deepFreeze(value);
        }
      });


    return Object.freeze(object);
  }


  /* =========================================================
     Freeze Configuration
     ========================================================= */

  window.APP_CONFIG = deepFreeze(CONFIG);


  /* =========================================================
     Global Application Helpers
     ========================================================= */

  window.APP = window.APP || {};


  /* ---------------------------------------------------------
     Build Application Path
     --------------------------------------------------------- */

  window.APP.getPath = function (path = "") {

    const basePath =
      window.APP_CONFIG.basePath
        .replace(/^\/+|\/+$/g, "");

    const cleanPath =
      String(path)
        .replace(/^\/+/, "");

    if (!basePath) {
      return `./${cleanPath}`;
    }

    return `/${basePath}/${cleanPath}`;
  };


  /* ---------------------------------------------------------
     Get Route
     --------------------------------------------------------- */

  window.APP.getRoute = function (path) {

    if (!path) {
      return window.APP.getPath(
        window.APP_CONFIG.routes.home
      );
    }


    const parts =
      String(path).split(".");


    let current =
      window.APP_CONFIG.routes;


    for (const part of parts) {

      if (
        !current ||
        !(part in current)
      ) {

        return window.APP.getPath(
          window.APP_CONFIG.routes.home
        );
      }


      current =
        current[part];
    }


    if (
      typeof current !== "string"
    ) {

      return window.APP.getPath(
        window.APP_CONFIG.routes.home
      );
    }


    return window.APP.getPath(current);
  };


  /* ---------------------------------------------------------
     Check Feature
     --------------------------------------------------------- */

  window.APP.isFeatureEnabled =
    function (feature) {

      const parts =
        String(feature).split(".");


      let current =
        window.APP_CONFIG.features;


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


      return current === true;
    };


  /* ---------------------------------------------------------
     API URL
     --------------------------------------------------------- */

  window.APP.getApiURL =
    function (endpoint = "") {

      const api =
        window.APP_CONFIG.api;


      const baseURL =
        String(api.baseURL)
          .replace(/\/+$/g, "");


      const version =
        String(api.version)
          .replace(/^\/+|\/+$/g, "");


      const cleanEndpoint =
        String(endpoint)
          .replace(/^\/+/g, "");


      return [
        baseURL,
        version,
        cleanEndpoint
      ]
        .filter(Boolean)
        .join("/");
    };


  /* ---------------------------------------------------------
     Storage Key
     --------------------------------------------------------- */

  window.APP.getStorageKey =
    function (key) {

      return (
        window.APP_CONFIG.storage.prefix +
        String(key)
      );
    };


  /* ---------------------------------------------------------
     Read Storage
     --------------------------------------------------------- */

  window.APP.storageGet =
    function (key) {

      try {

        return localStorage.getItem(
          window.APP.getStorageKey(key)
        );

      } catch (error) {

        if (
          window.APP_CONFIG.development.debug
        ) {

          console.warn(
            "[NOVA] Storage read failed:",
            error
          );
        }

        return null;
      }
    };


  /* ---------------------------------------------------------
     Write Storage
     --------------------------------------------------------- */

  window.APP.storageSet =
    function (key, value) {

      try {

        localStorage.setItem(
          window.APP.getStorageKey(key),
          value
        );

        return true;

      } catch (error) {

        if (
          window.APP_CONFIG.development.debug
        ) {

          console.warn(
            "[NOVA] Storage write failed:",
            error
          );
        }

        return false;
      }
    };


  /* ---------------------------------------------------------
     Remove Storage
     --------------------------------------------------------- */

  window.APP.storageRemove =
    function (key) {

      try {

        localStorage.removeItem(
          window.APP.getStorageKey(key)
        );

        return true;

      } catch (error) {

        if (
          window.APP_CONFIG.development.debug
        ) {

          console.warn(
            "[NOVA] Storage remove failed:",
            error
          );
        }

        return false;
      }
    };


  /* =========================================================
     HTML Dataset
     ========================================================= */

  document.documentElement.dataset.app =
    window.APP_CONFIG.app.name;

  document.documentElement.dataset.version =
    window.APP_CONFIG.app.version;

  document.documentElement.dataset.direction =
    window.APP_CONFIG.app.direction;


  /* =========================================================
     Development Information
     ========================================================= */

  if (
    window.APP_CONFIG.development.debug
  ) {

    console.info(
      `[NOVA] ${window.APP_CONFIG.app.name} v${window.APP_CONFIG.app.version}`
    );

    console.info(
      "[NOVA] Configuration initialized."
    );
  }

})();
