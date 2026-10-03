"use strict";

/* =========================================================
   NOVA — Storage Manager
   File: js/storage.js
   Version: 1.0.0

   المسؤوليات:
   - Local Storage
   - Session Storage
   - JSON serialization
   - Namespacing
   - Expiration
   - Safe read/write
   - Preferences
   - Drafts
   - UI state

   ملاحظة:
   هذا الملف لا ينشئ بيانات مستخدمين وهمية.
   ========================================================= */

(() => {

  /* =======================================================
     CONFIG
     ======================================================= */

  const CONFIG =
    window.APP_CONFIG || null;

  const APP =
    window.APP || null;


  if (!CONFIG || !APP) {

    console.error(
      "[NOVA Storage] APP_CONFIG أو APP غير متاح."
    );

    return;
  }


  /* =======================================================
     CONSTANTS
     ======================================================= */

  const STORAGE_TYPES = Object.freeze({
    LOCAL: "localStorage",
    SESSION: "sessionStorage"
  });


  const DEFAULT_OPTIONS = Object.freeze({
    storage:
      STORAGE_TYPES.LOCAL,

    json:
      true,

    expires:
      null
  });


  /* =======================================================
     INTERNAL HELPERS
     ======================================================= */

  function getStorage(type) {

    try {

      if (
        type === STORAGE_TYPES.SESSION
      ) {
        return window.sessionStorage;
      }

      return window.localStorage;

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Storage unavailable:",
          error
        );

      }

      return null;

    }

  }


  function normalizeKey(key) {

    const value =
      String(key || "")
        .trim();


    if (!value) {
      throw new Error(
        "Storage key cannot be empty."
      );
    }


    /*
     * إذا كان المفتاح يبدأ بالـprefix
     * لا نضيفه مرة ثانية.
     */

    const prefix =
      String(
        CONFIG.storage?.prefix || "nova_"
      );


    if (
      value.startsWith(prefix)
    ) {
      return value;
    }


    return `${prefix}${value}`;

  }


  function serialize(value) {

    try {

      return JSON.stringify(
        value
      );

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Serialization failed:",
          error
        );

      }

      return null;

    }

  }


  function deserialize(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }


    try {

      return JSON.parse(
        value
      );

    } catch {

      /*
       * يسمح بقراءة قيم نصية عادية
       * تم حفظها بدون JSON.
       */

      return value;

    }

  }


  function buildStoredValue(
    value,
    options
  ) {

    if (
      !options.expires
    ) {

      return value;

    }


    const expiresAt =
      Date.now() +
      Number(
        options.expires
      );


    return {
      __novaStorage: true,
      value,
      expiresAt
    };

  }


  function unwrapStoredValue(
    value,
    key,
    storage
  ) {

    if (
      !value ||
      typeof value !== "object" ||
      value.__novaStorage !== true
    ) {
      return value;
    }


    if (
      value.expiresAt &&
      Date.now() >=
        value.expiresAt
    ) {

      try {

        storage.removeItem(
          key
        );

      } catch {
        // Ignore cleanup errors.
      }


      return null;

    }


    return value.value;

  }


  function resolveOptions(
    options = {}
  ) {

    return {
      ...DEFAULT_OPTIONS,
      ...options
    };

  }


  /* =======================================================
     BASIC SET
     ======================================================= */

  function set(
    key,
    value,
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return false;
    }


    let finalValue =
      buildStoredValue(
        value,
        settings
      );


    if (
      settings.json
    ) {

      finalValue =
        serialize(
          finalValue
        );


      if (
        finalValue === null
      ) {
        return false;
      }

    } else {

      finalValue =
        String(
          finalValue
        );

    }


    try {

      storage.setItem(
        normalizeKey(key),
        finalValue
      );


      return true;

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Write failed:",
          error
        );

      }

      return false;

    }

  }


  /* =======================================================
     BASIC GET
     ======================================================= */

  function get(
    key,
    defaultValue = null,
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return defaultValue;
    }


    const normalizedKey =
      normalizeKey(key);


    let rawValue;


    try {

      rawValue =
        storage.getItem(
          normalizedKey
        );

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Read failed:",
          error
        );

      }

      return defaultValue;

    }


    if (
      rawValue === null
    ) {
      return defaultValue;
    }


    let value =
      rawValue;


    if (
      settings.json
    ) {

      value =
        deserialize(
          rawValue
        );

    }


    value =
      unwrapStoredValue(
        value,
        normalizedKey,
        storage
      );


    return value === null
      ? defaultValue
      : value;

  }


  /* =======================================================
     HAS
     ======================================================= */

  function has(
    key,
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return false;
    }


    try {

      const normalizedKey =
        normalizeKey(key);


      if (
        !storage.getItem(
          normalizedKey
        )
      ) {
        return false;
      }


      /*
       * get() يقوم أيضًا بتنظيف
       * العناصر المنتهية.
       */

      const value =
        get(
          key,
          null,
          settings
        );


      return value !== null;

    } catch {

      return false;

    }

  }


  /* =======================================================
     REMOVE
     ======================================================= */

  function remove(
    key,
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return false;
    }


    try {

      storage.removeItem(
        normalizeKey(key)
      );


      return true;

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Remove failed:",
          error
        );

      }

      return false;

    }

  }


  /* =======================================================
     CLEAR NOVA DATA ONLY
     ======================================================= */

  function clear(
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return false;
    }


    const prefix =
      String(
        CONFIG.storage?.prefix || "nova_"
      );


    const keys = [];


    try {

      for (
        let index = 0;
        index < storage.length;
        index++
      ) {

        const key =
          storage.key(index);


        if (
          key &&
          key.startsWith(prefix)
        ) {

          keys.push(
            key
          );

        }

      }


      keys.forEach(
        (key) => {
          storage.removeItem(
            key
          );
        }
      );


      return true;

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Clear failed:",
          error
        );

      }

      return false;

    }

  }


  /* =======================================================
     CLEAR EVERYTHING
     ======================================================= */

  function clearAll(
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return false;
    }


    try {

      storage.clear();

      return true;

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Full clear failed:",
          error
        );

      }

      return false;

    }

  }


  /* =======================================================
     KEYS
     ======================================================= */

  function keys(
    options = {}
  ) {

    const settings =
      resolveOptions(
        options
      );


    const storage =
      getStorage(
        settings.storage
      );


    if (!storage) {
      return [];
    }


    const prefix =
      String(
        CONFIG.storage?.prefix || "nova_"
      );


    const result = [];


    try {

      for (
        let index = 0;
        index < storage.length;
        index++
      ) {

        const key =
          storage.key(index);


        if (
          key &&
          key.startsWith(prefix)
        ) {

          result.push(
            key.slice(
              prefix.length
            )
          );

        }

      }

    } catch (error) {

      if (
        CONFIG.development?.debug
      ) {

        console.warn(
          "[NOVA Storage] Keys failed:",
          error
        );

      }

    }


    return result;

  }


  /* =======================================================
     UPDATE OBJECT
     ======================================================= */

  function update(
    key,
    updater,
    options = {}
  ) {

    if (
      typeof updater !==
      "function"
    ) {

      throw new TypeError(
        "updater must be a function."
      );

    }


    const current =
      get(
        key,
        {},
        options
      );


    const updated =
      updater(
        current
      );


    return set(
      key,
      updated,
      options
    );

  }


  /* =======================================================
     GET JSON
     ======================================================= */

  function getJSON(
    key,
    defaultValue = null,
    options = {}
  ) {

    return get(
      key,
      defaultValue,
      {
        ...options,
        json: true
      }
    );

  }


  /* =======================================================
     SET JSON
     ======================================================= */

  function setJSON(
    key,
    value,
    options = {}
  ) {

    return set(
      key,
      value,
      {
        ...options,
        json: true
      }
    );

  }


  /* =======================================================
     SESSION STORAGE HELPERS
     ======================================================= */

  const session = {

    set(
      key,
      value,
      options = {}
    ) {

      return set(
        key,
        value,
        {
          ...options,
          storage:
            STORAGE_TYPES.SESSION
        }
      );

    },


    get(
      key,
      defaultValue = null,
      options = {}
    ) {

      return get(
        key,
        defaultValue,
        {
          ...options,
          storage:
            STORAGE_TYPES.SESSION
        }
      );

    },


    has(
      key,
      options = {}
    ) {

      return has(
        key,
        {
          ...options,
          storage:
            STORAGE_TYPES.SESSION
        }
      );

    },


    remove(
      key
    ) {

      return remove(
        key,
        {
          storage:
            STORAGE_TYPES.SESSION
        }
      );

    },


    clear() {

      return clear({
        storage:
          STORAGE_TYPES.SESSION
      });

    },


    keys() {

      return keys({
        storage:
          STORAGE_TYPES.SESSION
      });

    }

  };


  /* =======================================================
     PREFERENCES
     ======================================================= */

  const preferences = {

    getTheme() {

      return get(
        CONFIG.storage.keys.theme,
        CONFIG.ui.defaultTheme
      );

    },


    setTheme(theme) {

      const allowedThemes =
        CONFIG.ui.themes || [];


      if (
        !allowedThemes.includes(
          theme
        )
      ) {

        return false;

      }


      return set(
        CONFIG.storage.keys.theme,
        theme
      );

    },


    getLanguage() {

      return get(
        CONFIG.storage.keys.language,
        CONFIG.app.locale
      );

    },


    setLanguage(language) {

      if (
        !language
      ) {
        return false;
      }


      return set(
        CONFIG.storage.keys.language,
        language
      );

    },


    getUI() {

      return get(
        CONFIG.storage.keys.uiPreferences,
        {}
      );

    },


    setUI(preferencesData) {

      if (
        !preferencesData ||
        typeof preferencesData !==
          "object"
      ) {

        return false;

      }


      return set(
        CONFIG.storage.keys.uiPreferences,
        preferencesData
      );

    },


    updateUI(updater) {

      return update(
        CONFIG.storage.keys.uiPreferences,
        updater
      );

    }

  };


  /* =======================================================
     DRAFT MESSAGES
     ======================================================= */

  const drafts = {

    getAll() {

      return get(
        CONFIG.storage.keys.draftMessages,
        {}
      );

    },


    get(
      conversationId
    ) {

      if (
        !conversationId
      ) {
        return null;
      }


      const all =
        this.getAll();


      return (
        all[
          String(
            conversationId
          )
        ] || null
      );

    },


    save(
      conversationId,
      message
    ) {

      if (
        !conversationId
      ) {
        return false;
      }


      const all =
        this.getAll();


      all[
        String(
          conversationId
        )
      ] = {
        value:
          String(
            message ?? ""
          ),

        updatedAt:
          new Date()
            .toISOString()
      };


      return set(
        CONFIG.storage.keys.draftMessages,
        all
      );

    },


    remove(
      conversationId
    ) {

      if (
        !conversationId
      ) {
        return false;
      }


      const all =
        this.getAll();


      delete all[
        String(
          conversationId
        )
      ];


      return set(
        CONFIG.storage.keys.draftMessages,
        all
      );

    },


    clear() {

      return remove(
        CONFIG.storage.keys.draftMessages
      );

    }

  };


  /* =======================================================
     ONBOARDING
     ======================================================= */

  const onboarding = {

    isCompleted() {

      return (
        get(
          CONFIG.storage.keys.onboarding,
          false
        ) === true
      );

    },


    complete() {

      return set(
        CONFIG.storage.keys.onboarding,
        true
      );

    },


    reset() {

      return remove(
        CONFIG.storage.keys.onboarding
      );

    }

  };


  /* =======================================================
     EXPIRATION
     ======================================================= */

  function setWithTTL(
    key,
    value,
    milliseconds,
    options = {}
  ) {

    const ttl =
      Number(
        milliseconds
      );


    if (
      !Number.isFinite(ttl) ||
      ttl <= 0
    ) {

      throw new Error(
        "TTL must be a positive number."
      );

    }


    return set(
      key,
      value,
      {
        ...options,
        expires: ttl
      }
    );

  }


  /* =======================================================
     EXPORT
     ======================================================= */

  window.NOVA_STORAGE =
    Object.freeze({

      types:
        STORAGE_TYPES,

      set,
      get,
      has,
      remove,
      clear,
      clearAll,
      keys,
      update,

      setJSON,
      getJSON,

      setWithTTL,

      session,

      preferences,

      drafts,

      onboarding

    });


  /* =======================================================
     COMPATIBILITY WITH APP
     ======================================================= */

  /*
   * config.js يحتوي بالفعل على:
   * APP.storageGet
   * APP.storageSet
   * APP.storageRemove
   *
   * لا نحذفها ولا نستبدلها.
   * نضيف فقط طبقة NOVA_STORAGE الأكثر تنظيمًا.
   */

  APP.storage =
    window.NOVA_STORAGE;


  /* =======================================================
     INIT LOG
     ======================================================= */

  if (
    CONFIG.development?.debug
  ) {

    console.info(
      "[NOVA Storage] Storage manager initialized."
    );

  }

})();
