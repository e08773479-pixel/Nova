"use strict";

/* =========================================================
   NOVA — Authentication Module
   File: js/auth.js
   Version: 1.0.0

   المسؤوليات:
   - Login
   - Register
   - Google Login preparation
   - Verification
   - Forgot Password
   - Reset Password
   - Session state
   - Logout
   - API communication
   - حماية الواجهة من البيانات الوهمية

   ملاحظة:
   لا يتم إنشاء مستخدم أو OTP أو Session وهمية من هذا الملف.
   ========================================================= */

(() => {

  /* =======================================================
     CONFIGURATION
     ======================================================= */

  const APP = window.APP;
  const CONFIG = window.APP_CONFIG;

  if (!APP || !CONFIG) {
    console.error(
      "[NOVA Auth] APP_CONFIG / APP غير متاح."
    );
    return;
  }


  const AUTH_ENDPOINT =
    CONFIG.api.endpoints.auth;


  /* =======================================================
     INTERNAL STATE
     ======================================================= */

  const state = {
    initialized: false,
    loading: false,
    user: null,
    session: null
  };


  /* =======================================================
     EVENTS
     ======================================================= */

  const EVENTS = {
    LOGIN_SUCCESS: "nova:auth:login-success",
    LOGIN_FAILED: "nova:auth:login-failed",

    REGISTER_SUCCESS: "nova:auth:register-success",
    REGISTER_FAILED: "nova:auth:register-failed",

    VERIFY_SUCCESS: "nova:auth:verify-success",
    VERIFY_FAILED: "nova:auth:verify-failed",

    PASSWORD_RESET_REQUESTED:
      "nova:auth:password-reset-requested",

    PASSWORD_RESET_SUCCESS:
      "nova:auth:password-reset-success",

    LOGOUT: "nova:auth:logout",

    SESSION_CHANGED:
      "nova:auth:session-changed"
  };


  /* =======================================================
     HELPERS
     ======================================================= */

  function dispatch(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }


  function getAuthURL(path = "") {

    const cleanPath =
      String(path)
        .replace(/^\/+/g, "");

    return APP.getApiURL(
      `${AUTH_ENDPOINT}/${cleanPath}`
    );

  }


  function isValidEmail(value) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(String(value).trim());

  }


  function isValidPhone(value) {

    const phone =
      String(value)
        .replace(/\s+/g, "")
        .trim();

    return /^\+?[0-9]{8,15}$/.test(phone);

  }


  function normalizeIdentifier(value) {

    return String(value || "")
      .trim();

  }


  function getPasswordErrors(password) {

    const errors = [];

    if (
      typeof password !== "string" ||
      password.length <
        CONFIG.security.password.minimumLength
    ) {
      errors.push(
        `كلمة المرور يجب ألا تقل عن ${CONFIG.security.password.minimumLength} أحرف.`
      );
    }

    if (
      CONFIG.security.password.requireNumber &&
      !/[0-9]/.test(password)
    ) {
      errors.push(
        "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل."
      );
    }

    if (
      CONFIG.security.password.requireUppercase &&
      !/[A-Z]/.test(password)
    ) {
      errors.push(
        "يجب أن تحتوي كلمة المرور على حرف إنجليزي كبير."
      );
    }

    if (
      CONFIG.security.password.requireSpecialCharacter &&
      !/[^\w\s]/.test(password)
    ) {
      errors.push(
        "يجب أن تحتوي كلمة المرور على رمز خاص."
      );
    }

    return errors;
  }


  function validatePassword(password) {

    return getPasswordErrors(password).length === 0;

  }


  function extractErrorMessage(
    response,
    fallback = "حدث خطأ غير متوقع."
  ) {

    if (!response) {
      return fallback;
    }

    if (typeof response === "string") {
      return response;
    }

    return (
      response.message ||
      response.error ||
      response.detail ||
      response.errors?.[0]?.message ||
      fallback
    );

  }


  /* =======================================================
     API REQUEST
     ======================================================= */

  async function request(
    endpoint,
    options = {}
  ) {

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        () => controller.abort(),
        CONFIG.api.timeout
      );


    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };


    const hasBody =
      options.body !== undefined &&
      options.body !== null;


    if (
      hasBody &&
      !(options.body instanceof FormData)
    ) {
      headers["Content-Type"] =
        "application/json";
    }


    let body =
      options.body;


    if (
      hasBody &&
      typeof body === "object" &&
      !(body instanceof FormData)
    ) {
      body = JSON.stringify(body);
    }


    try {

      const response =
        await fetch(
          endpoint,
          {
            method:
              options.method || "GET",

            headers,

            body,

            credentials:
              CONFIG.api.credentials,

            signal:
              controller.signal,

            cache:
              options.cache || "no-store"
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
          text
            ? { message: text }
            : null;

      }


      if (!response.ok) {

        const error =
          new Error(
            extractErrorMessage(
              data,
              `فشل الطلب (${response.status}).`
            )
          );

        error.status =
          response.status;

        error.data =
          data;

        throw error;
      }


      return {
        ok: true,
        status:
          response.status,
        data
      };

    } catch (error) {

      if (
        error.name ===
        "AbortError"
      ) {

        const timeoutError =
          new Error(
            "انتهت مهلة الاتصال بالخادم."
          );

        timeoutError.code =
          "REQUEST_TIMEOUT";

        throw timeoutError;
      }

      throw error;

    } finally {

      window.clearTimeout(
        timeout
      );

    }

  }


  /* =======================================================
     SESSION STORAGE
     ======================================================= */

  function saveSession(session) {

    if (!session) {
      return false;
    }

    try {

      APP.storageSet(
        CONFIG.storage.keys.sessionState,
        JSON.stringify({
          authenticated: true,
          session,
          savedAt:
            new Date().toISOString()
        })
      );

      state.session =
        session;

      dispatch(
        EVENTS.SESSION_CHANGED,
        {
          authenticated: true,
          session
        }
      );

      return true;

    } catch (error) {

      if (
        CONFIG.development.debug
      ) {
        console.warn(
          "[NOVA Auth] Failed to save session:",
          error
        );
      }

      return false;
    }

  }


  function readStoredSession() {

    try {

      const raw =
        APP.storageGet(
          CONFIG.storage.keys.sessionState
        );

      if (!raw) {
        return null;
      }

      const parsed =
        JSON.parse(raw);

      if (
        !parsed ||
        parsed.authenticated !== true
      ) {
        return null;
      }

      return parsed;

    } catch (error) {

      if (
        CONFIG.development.debug
      ) {
        console.warn(
          "[NOVA Auth] Invalid stored session:",
          error
        );
      }

      return null;
    }

  }


  function clearSession() {

    APP.storageRemove(
      CONFIG.storage.keys.sessionState
    );

    state.session = null;
    state.user = null;

    dispatch(
      EVENTS.SESSION_CHANGED,
      {
        authenticated: false
      }
    );

  }


  /* =======================================================
     CURRENT SESSION
     ======================================================= */

  function getSession() {

    return (
      state.session ||
      readStoredSession()?.session ||
      null
    );

  }


  function getCurrentUser() {

    return (
      state.user ||
      getSession()?.user ||
      null
    );

  }


  function isAuthenticated() {

    const stored =
      readStoredSession();

    return Boolean(
      state.session ||
      (
        stored &&
        stored.authenticated === true
      )
    );

  }


  /* =======================================================
     LOGIN
     ======================================================= */

  async function login(options = {}) {

    if (state.loading) {
      throw new Error(
        "يوجد طلب مصادقة قيد التنفيذ بالفعل."
      );
    }


    const identifier =
      normalizeIdentifier(
        options.identifier
      );

    const password =
      String(
        options.password || ""
      );


    if (!identifier) {
      throw new Error(
        "أدخل البريد الإلكتروني أو رقم الهاتف."
      );
    }


    if (!password) {
      throw new Error(
        "أدخل كلمة المرور."
      );
    }


    if (
      !isValidEmail(identifier) &&
      !isValidPhone(identifier)
    ) {
      throw new Error(
        "أدخل بريدًا إلكترونيًا أو رقم هاتف صالحًا."
      );
    }


    const rememberMe =
      Boolean(
        options.rememberMe
      );


    state.loading = true;


    try {

      const response =
        await request(
          getAuthURL("login"),
          {
            method: "POST",

            body: {
              identifier,
              password,
              rememberMe
            }
          }
        );


      const data =
        response.data || {};


      const session =
        data.session ||
        data;


      saveSession(
        session
      );


      state.user =
        data.user ||
        session.user ||
        null;


      dispatch(
        EVENTS.LOGIN_SUCCESS,
        {
          user: state.user,
          session
        }
      );


      return {
        success: true,
        user: state.user,
        session,
        data
      };


    } catch (error) {

      dispatch(
        EVENTS.LOGIN_FAILED,
        {
          error
        }
      );

      throw error;

    } finally {

      state.loading = false;

    }

  }


  /* =======================================================
     REGISTER
     ======================================================= */

  async function register(options = {}) {

    if (state.loading) {
      throw new Error(
        "يوجد طلب قيد التنفيذ بالفعل."
      );
    }


    const name =
      String(
        options.name || ""
      ).trim();


    const email =
      String(
        options.email || ""
      ).trim();


    const phone =
      String(
        options.phone || ""
      ).trim();


    const password =
      String(
        options.password || ""
      );


    const passwordConfirmation =
      String(
        options.passwordConfirmation ||
        options.confirmPassword ||
        ""
      );


    if (name.length < 2) {
      throw new Error(
        "أدخل اسمًا صحيحًا."
      );
    }


    if (
      !email &&
      !phone
    ) {
      throw new Error(
        "أدخل البريد الإلكتروني أو رقم الهاتف."
      );
    }


    if (
      email &&
      !isValidEmail(email)
    ) {
      throw new Error(
        "البريد الإلكتروني غير صالح."
      );
    }


    if (
      phone &&
      !isValidPhone(phone)
    ) {
      throw new Error(
        "رقم الهاتف غير صالح."
      );
    }


    const passwordErrors =
      getPasswordErrors(
        password
      );


    if (
      passwordErrors.length
    ) {
      throw new Error(
        passwordErrors[0]
      );
    }


    if (
      password !==
      passwordConfirmation
    ) {
      throw new Error(
        "تأكيد كلمة المرور غير مطابق."
      );
    }


    state.loading = true;


    try {

      const payload = {
        name,
        password,
        passwordConfirmation
      };


      if (email) {
        payload.email =
          email;
      }


      if (phone) {
        payload.phone =
          phone;
      }


      const response =
        await request(
          getAuthURL("register"),
          {
            method: "POST",
            body: payload
          }
        );


      const data =
        response.data || {};


      /*
       * نخزن فقط سياق العملية التي أعاده
       * الخادم، ولا ننشئ OTP من عندنا.
       */

      const registrationContext = {

        registrationId:
          data.registrationId ||
          data.registration_id ||
          null,

        verificationRequired:
          data.verificationRequired !== false,

        email:
          data.email ||
          email ||
          null,

        phone:
          data.phone ||
          phone ||
          null,

        createdAt:
          new Date().toISOString()

      };


      APP.storageSet(
        "registration_context",
        JSON.stringify(
          registrationContext
        )
      );


      dispatch(
        EVENTS.REGISTER_SUCCESS,
        {
          data,
          registrationContext
        }
      );


      return {
        success: true,
        data,
        registrationContext
      };


    } catch (error) {

      dispatch(
        EVENTS.REGISTER_FAILED,
        {
          error
        }
      );

      throw error;

    } finally {

      state.loading = false;

    }

  }


  /* =======================================================
     VERIFY ACCOUNT
     ======================================================= */

  async function verifyAccount(
    options = {}
  ) {

    const code =
      String(
        options.code || ""
      )
        .replace(/\D/g, "")
        .trim();


    const registrationContext =
      options.registrationContext ||
      readRegistrationContext();


    if (
      !registrationContext
    ) {
      throw new Error(
        "بيانات عملية التسجيل غير متاحة."
      );
    }


    if (
      !code ||
      code.length < 4
    ) {
      throw new Error(
        "أدخل رمز التحقق الصحيح."
      );
    }


    const payload = {
      code
    };


    if (
      registrationContext.registrationId
    ) {
      payload.registrationId =
        registrationContext.registrationId;
    }


    if (
      registrationContext.email
    ) {
      payload.email =
        registrationContext.email;
    }


    if (
      registrationContext.phone
    ) {
      payload.phone =
        registrationContext.phone;
    }


    try {

      const response =
        await request(
          getAuthURL("verify"),
          {
            method: "POST",
            body: payload
          }
        );


      const data =
        response.data || {};


      if (data.session) {

        saveSession(
          data.session
        );

      }


      APP.storageRemove(
        "registration_context"
      );


      dispatch(
        EVENTS.VERIFY_SUCCESS,
        {
          data
        }
      );


      return {
        success: true,
        data
      };


    } catch (error) {

      dispatch(
        EVENTS.VERIFY_FAILED,
        {
          error
        }
      );

      throw error;

    }

  }


  function readRegistrationContext() {

    try {

      const raw =
        APP.storageGet(
          "registration_context"
        );

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);

    } catch {

      return null;

    }

  }


  /* =======================================================
     FORGOT PASSWORD
     ======================================================= */

  async function requestPasswordReset(
    identifier
  ) {

    const value =
      normalizeIdentifier(
        identifier
      );


    if (!value) {
      throw new Error(
        "أدخل البريد الإلكتروني أو رقم الهاتف."
      );
    }


    if (
      !isValidEmail(value) &&
      !isValidPhone(value)
    ) {
      throw new Error(
        "بيانات الحساب غير صالحة."
      );
    }


    const payload = {
      identifier: value
    };


    try {

      const response =
        await request(
          getAuthURL(
            "forgot-password"
          ),
          {
            method: "POST",
            body: payload
          }
        );


      const data =
        response.data || {};


      const resetContext = {

        resetId:
          data.resetId ||
          data.reset_id ||
          null,

        identifier:
          value,

        createdAt:
          new Date().toISOString()

      };


      APP.storageSet(
        "password_reset_context",
        JSON.stringify(
          resetContext
        )
      );


      dispatch(
        EVENTS.PASSWORD_RESET_REQUESTED,
        {
          data,
          resetContext
        }
      );


      return {
        success: true,
        data,
        resetContext
      };


    } catch (error) {

      throw error;

    }

  }


  /* =======================================================
     RESET PASSWORD
     ======================================================= */

  async function resetPassword(
    options = {}
  ) {

    const code =
      String(
        options.code || ""
      )
        .replace(/\D/g, "")
        .trim();


    const password =
      String(
        options.password || ""
      );


    const confirmation =
      String(
        options.passwordConfirmation ||
        options.confirmPassword ||
        ""
      );


    if (!code) {
      throw new Error(
        "أدخل رمز التحقق."
      );
    }


    const passwordErrors =
      getPasswordErrors(
        password
      );


    if (
      passwordErrors.length
    ) {
      throw new Error(
        passwordErrors[0]
      );
    }


    if (
      password !== confirmation
    ) {
      throw new Error(
        "تأكيد كلمة المرور غير مطابق."
      );
    }


    const context =
      readPasswordResetContext();


    const payload = {

      code,

      password,

      passwordConfirmation:
        confirmation

    };


    if (context?.resetId) {
      payload.resetId =
        context.resetId;
    }


    if (context?.identifier) {
      payload.identifier =
        context.identifier;
    }


    try {

      const response =
        await request(
          getAuthURL(
            "reset-password"
          ),
          {
            method: "POST",
            body: payload
          }
        );


      const data =
        response.data || {};


      APP.storageRemove(
        "password_reset_context"
      );


      dispatch(
        EVENTS.PASSWORD_RESET_SUCCESS,
        {
          data
        }
      );


      return {
        success: true,
        data
      };


    } catch (error) {

      throw error;

    }

  }


  function readPasswordResetContext() {

    try {

      const raw =
        APP.storageGet(
          "password_reset_context"
        );

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);

    } catch {

      return null;

    }

  }


  /* =======================================================
     GOOGLE LOGIN
     ======================================================= */

  function getGoogleLoginURL() {

    return getAuthURL(
      "google"
    );

  }


  function startGoogleLogin() {

    if (
      !CONFIG.features.googleLogin
    ) {
      throw new Error(
        "تسجيل الدخول باستخدام Google غير متاح."
      );
    }


    /*
     * لا ننشئ OAuth وهمي.
     * الخادم هو المسؤول عن بدء Google OAuth.
     */

    window.location.assign(
      getGoogleLoginURL()
    );

  }


  /* =======================================================
     LOGOUT
     ======================================================= */

  async function logout(
    options = {}
  ) {

    try {

      /*
       * إذا كانت هناك Session حقيقية،
       * نبلغ الخادم بتسجيل الخروج.
       */

      if (isAuthenticated()) {

        try {

          await request(
            getAuthURL("logout"),
            {
              method: "POST",
              body: {
                allDevices:
                  Boolean(
                    options.allDevices
                  )
              }
            }
          );

        } catch (error) {

          /*
           * لا نمنع المستخدم من الخروج محليًا
           * إذا فشل طلب الخادم.
           */

          if (
            CONFIG.development.debug
          ) {
            console.warn(
              "[NOVA Auth] Server logout failed:",
              error
            );
          }

        }

      }

    } finally {

      clearSession();

      dispatch(
        EVENTS.LOGOUT
      );

    }


    return {
      success: true
    };

  }


  /* =======================================================
     SESSION VALIDATION
     ======================================================= */

  async function validateSession() {

    if (!isAuthenticated()) {
      return {
        authenticated: false,
        user: null
      };
    }


    try {

      const response =
        await request(
          getAuthURL("session"),
          {
            method: "GET"
          }
        );


      const data =
        response.data || {};


      if (
        data.authenticated === false
      ) {

        clearSession();

        return {
          authenticated: false,
          user: null
        };

      }


      state.user =
        data.user ||
        getCurrentUser();


      if (data.session) {
        saveSession(
          data.session
        );
      }


      return {
        authenticated: true,
        user: state.user,
        session:
          data.session ||
          getSession()
      };


    } catch (error) {

      /*
       * في حالة عدم اتصال الـBackend،
       * لا نحول المستخدم إلى "حساب حقيقي".
       */

      if (
        CONFIG.development.debug
      ) {
        console.warn(
          "[NOVA Auth] Session validation failed:",
          error
        );
      }


      return {
        authenticated:
          isAuthenticated(),

        user:
          getCurrentUser(),

        error

      };

    }

  }


  /* =======================================================
     PROTECTED ROUTES
     ======================================================= */

  function requireAuth(
    redirect = true
  ) {

    if (isAuthenticated()) {
      return true;
    }


    if (redirect) {

      const loginRoute =
        APP.getRoute(
          "auth.login"
        );


      const currentURL =
        window.location.href;


      const separator =
        loginRoute.includes("?")
          ? "&"
          : "?";


      window.location.assign(
        `${loginRoute}${separator}returnUrl=${encodeURIComponent(currentURL)}`
      );

    }


    return false;

  }


  /* =======================================================
     AUTH PAGE REDIRECT
     ======================================================= */

  function redirectIfAuthenticated() {

    if (!isAuthenticated()) {
      return false;
    }


    const home =
      APP.getRoute(
        "home"
      );


    window.location.assign(
      home
    );


    return true;

  }


  /* =======================================================
     RETURN URL
     ======================================================= */

  function getReturnURL() {

    try {

      const params =
        new URLSearchParams(
          window.location.search
        );


      const returnURL =
        params.get(
          "returnUrl"
        );


      if (!returnURL) {
        return null;
      }


      /*
       * لا نسمح بإعادة التوجيه إلى
       * بروتوكولات خطرة.
       */

      const parsed =
        new URL(
          returnURL,
          window.location.origin
        );


      if (
        parsed.origin !==
        window.location.origin
      ) {
        return null;
      }


      return parsed.href;

    } catch {

      return null;

    }

  }


  function redirectAfterLogin() {

    const returnURL =
      getReturnURL();


    if (returnURL) {

      window.location.assign(
        returnURL
      );

      return;

    }


    window.location.assign(
      APP.getRoute("home")
    );

  }


  /* =======================================================
     FORM UTILITIES
     ======================================================= */

  function setLoading(
    form,
    loading,
    text = "جارٍ التنفيذ..."
  ) {

    if (!form) {
      return;
    }


    form.dataset.loading =
      loading
        ? "true"
        : "false";


    const submit =
      form.querySelector(
        '[type="submit"]'
      );


    if (!submit) {
      return;
    }


    if (
      loading
    ) {

      if (
        !submit.dataset.originalText
      ) {
        submit.dataset.originalText =
          submit.textContent;
      }


      submit.disabled =
        true;


      submit.setAttribute(
        "aria-busy",
        "true"
      );


      submit.textContent =
        text;

    } else {

      submit.disabled =
        false;


      submit.removeAttribute(
        "aria-busy"
      );


      if (
        submit.dataset.originalText
      ) {

        submit.textContent =
          submit.dataset.originalText;

      }

    }

  }


  function showFormError(
    form,
    message
  ) {

    if (!form) {
      return;
    }


    let box =
      form.querySelector(
        "[data-auth-error]"
      );


    if (!box) {

      box =
        document.createElement(
          "div"
        );

      box.dataset.authError =
        "true";

      box.setAttribute(
        "role",
        "alert"
      );

      form.prepend(
        box
      );

    }


    box.textContent =
      message;


    box.hidden =
      false;

  }


  function clearFormError(form) {

    if (!form) {
      return;
    }


    const box =
      form.querySelector(
        "[data-auth-error]"
      );


    if (box) {
      box.hidden = true;
      box.textContent = "";
    }

  }


  /* =======================================================
     AUTOMATIC FORM BINDING
     ======================================================= */

  function bindLoginForms() {

    const forms =
      document.querySelectorAll(
        '[data-auth-form="login"]'
      );


    forms.forEach(
      (form) => {

        if (
          form.dataset.authBound ===
          "true"
        ) {
          return;
        }


        form.dataset.authBound =
          "true";


        form.addEventListener(
          "submit",
          async (event) => {

            event.preventDefault();

            clearFormError(form);


            const formData =
              new FormData(form);


            const identifier =
              formData.get(
                "identifier"
              ) ||
              formData.get(
                "email"
              ) ||
              formData.get(
                "phone"
              );


            const password =
              formData.get(
                "password"
              );


            const remember =
              form.querySelector(
                '[name="rememberMe"]'
              );


            setLoading(
              form,
              true,
              "جارٍ تسجيل الدخول..."
            );


            try {

              await login({

                identifier,

                password,

                rememberMe:
                  Boolean(
                    remember?.checked
                  )

              });


              redirectAfterLogin();


            } catch (error) {

              showFormError(
                form,
                error.message
              );

            } finally {

              setLoading(
                form,
                false
              );

            }

          }
        );

      }
    );

  }


  function bindRegisterForms() {

    const forms =
      document.querySelectorAll(
        '[data-auth-form="register"]'
      );


    forms.forEach(
      (form) => {

        if (
          form.dataset.authBound ===
          "true"
        ) {
          return;
        }


        form.dataset.authBound =
          "true";


        form.addEventListener(
          "submit",
          async (event) => {

            event.preventDefault();

            clearFormError(form);


            const formData =
              new FormData(form);


            setLoading(
              form,
              true,
              "جارٍ إنشاء الحساب..."
            );


            try {

              const result =
                await register({

                  name:
                    formData.get(
                      "name"
                    ),

                  email:
                    formData.get(
                      "email"
                    ),

                  phone:
                    formData.get(
                      "phone"
                    ),

                  password:
                    formData.get(
                      "password"
                    ),

                  passwordConfirmation:
                    formData.get(
                      "passwordConfirmation"
                    ) ||
                    formData.get(
                      "confirmPassword"
                    )

                });


              if (
                result
                  .registrationContext
                  .verificationRequired
              ) {

                window.location.assign(
                  APP.getRoute(
                    "auth.verify"
                  )
                );

              } else {

                redirectAfterLogin();

              }


            } catch (error) {

              showFormError(
                form,
                error.message
              );

            } finally {

              setLoading(
                form,
                false
              );

            }

          }
        );

      }
    );

  }


  function bindGoogleButtons() {

    const buttons =
      document.querySelectorAll(
        '[data-auth-google]'
      );


    buttons.forEach(
      (button) => {

        if (
          button.dataset.googleBound ===
          "true"
        ) {
          return;
        }


        button.dataset.googleBound =
          "true";


        button.addEventListener(
          "click",
          (event) => {

            event.preventDefault();


            try {

              startGoogleLogin();

            } catch (error) {

              console.error(
                "[NOVA Auth]",
                error
              );

            }

          }
        );

      }
    );

  }


  function bindLogoutButtons() {

    const buttons =
      document.querySelectorAll(
        '[data-auth-logout]'
      );


    buttons.forEach(
      (button) => {

        if (
          button.dataset.logoutBound ===
          "true"
        ) {
          return;
        }


        button.dataset.logoutBound =
          "true";


        button.addEventListener(
          "click",
          async (event) => {

            event.preventDefault();


            const allDevices =
              button.dataset.logoutAllDevices ===
              "true";


            await logout({
              allDevices
            });


            window.location.assign(
              APP.getRoute(
                "auth.login"
              )
            );

          }
        );

      }
    );

  }


  /* =======================================================
     INITIALIZATION
     ======================================================= */

  function init() {

    if (state.initialized) {
      return;
    }


    state.initialized =
      true;


    bindLoginForms();
    bindRegisterForms();
    bindGoogleButtons();
    bindLogoutButtons();


    if (
      CONFIG.development.debug
    ) {

      console.info(
        "[NOVA Auth] Authentication module initialized."
      );

    }

  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.NOVA_AUTH = Object.freeze({

    login,

    register,

    verifyAccount,

    requestPasswordReset,

    resetPassword,

    startGoogleLogin,

    getGoogleLoginURL,

    logout,

    validateSession,

    requireAuth,

    redirectIfAuthenticated,

    redirectAfterLogin,

    getSession,

    getCurrentUser,

    isAuthenticated,

    readRegistrationContext,

    readPasswordResetContext,

    validatePassword,

    getPasswordErrors,

    isValidEmail,

    isValidPhone,

    setLoading,

    showFormError,

    clearFormError,

    init,

    events: EVENTS

  });


  /* =======================================================
     AUTO INIT
     ======================================================= */

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
