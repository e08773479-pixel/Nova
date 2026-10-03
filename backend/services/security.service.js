"use strict";

/**
 * NOVA — Security Service
 *
 * طبقة مركزية لعمليات أمان الحساب.
 *
 * المسؤوليات:
 * - تسجيل الأحداث الأمنية
 * - إعدادات الأمان
 * - إدارة الجلسات عند توفر Session Service
 * - تسجيل محاولات الدخول
 * - مراجعة النشاط الأمني
 *
 * لا يحتوي على أسرار حقيقية أو كلمات مرور أو Tokens ثابتة.
 */

const SECURITY_EVENT_TYPES = Object.freeze({
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILED: "login_failed",
  LOGOUT: "logout",
  PASSWORD_CHANGED: "password_changed",
  PASSWORD_RESET: "password_reset",
  DEVICE_ADDED: "device_added",
  DEVICE_REVOKED: "device_revoked",
  SESSION_REVOKED: "session_revoked",
  TWO_FACTOR_ENABLED: "two_factor_enabled",
  TWO_FACTOR_DISABLED: "two_factor_disabled",
  SECURITY_SETTING_CHANGED: "security_setting_changed"
});

const SECURITY_SETTING_DEFAULTS = Object.freeze({
  twoFactorEnabled: false,
  loginAlertsEnabled: true,
  newDeviceAlertsEnabled: true
});

class SecurityServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "SecurityServiceError";
    this.code = code;
    this.details = details;
  }
}

function createSecurityService({
  securityRepository,
  userRepository = null,
  deviceService = null,
  sessionService = null,
  passwordService = null,
  realtimeService = null,
  clock = () => new Date()
} = {}) {
  if (!securityRepository) {
    throw new SecurityServiceError(
      "SECURITY_REPOSITORY_REQUIRED",
      "Security repository is required."
    );
  }

  const now = () => clock();

  function requireUserId(userId) {
    if (!userId) {
      throw new SecurityServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return userId;
  }

  async function getSettings(userId) {
    requireUserId(userId);

    const existing =
      await securityRepository.findOne({
        where: {
          userId
        }
      });

    if (existing) {
      return existing;
    }

    /*
     * لا يتم إنشاء إعدادات تلقائيًا ببيانات مستخدم مزيفة.
     * القيم الافتراضية هنا إعدادات منطقية فقط عند إنشاء
     * سجل الإعدادات لأول مرة.
     */

    return securityRepository.create({
      userId,
      ...SECURITY_SETTING_DEFAULTS,
      createdAt: now(),
      updatedAt: now()
    });
  }

  async function updateSettings(
    userId,
    changes
  ) {
    requireUserId(userId);

    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new SecurityServiceError(
        "INVALID_SECURITY_SETTINGS",
        "إعدادات الأمان غير صالحة."
      );
    }

    const current =
      await getSettings(userId);

    const allowed = [
      "twoFactorEnabled",
      "loginAlertsEnabled",
      "newDeviceAlertsEnabled"
    ];

    const payload = {};

    for (const key of allowed) {
      if (
        Object.prototype.hasOwnProperty.call(
          changes,
          key
        )
      ) {
        if (
          typeof changes[key] !== "boolean"
        ) {
          throw new SecurityServiceError(
            "INVALID_SECURITY_SETTING_VALUE",
            "قيمة إعداد الأمان غير صالحة."
          );
        }

        payload[key] = changes[key];
      }
    }

    if (!Object.keys(payload).length) {
      return current;
    }

    payload.updatedAt = now();

    const updated =
      await securityRepository.update(
        current.id,
        payload
      );

    await recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.SECURITY_SETTING_CHANGED,
      data: payload
    });

    if (
      payload.twoFactorEnabled === true &&
      current.twoFactorEnabled !== true
    ) {
      await recordEvent({
        userId,
        type:
          SECURITY_EVENT_TYPES.TWO_FACTOR_ENABLED
      });
    }

    if (
      payload.twoFactorEnabled === false &&
      current.twoFactorEnabled === true
    ) {
      await recordEvent({
        userId,
        type:
          SECURITY_EVENT_TYPES.TWO_FACTOR_DISABLED
      });
    }

    return updated;
  }

  async function recordEvent({
    userId,
    type,
    ipAddress = null,
    userAgent = null,
    deviceId = null,
    sessionId = null,
    data = null
  } = {}) {
    requireUserId(userId);

    if (
      !Object.values(
        SECURITY_EVENT_TYPES
      ).includes(type)
    ) {
      throw new SecurityServiceError(
        "INVALID_SECURITY_EVENT",
        "نوع الحدث الأمني غير صالح."
      );
    }

    return securityRepository.query(
      "createSecurityEvent",
      {
        userId,
        type,
        ipAddress,
        userAgent,
        deviceId,
        sessionId,
        data,
        createdAt: now()
      }
    );
  }

  async function recordLoginSuccess({
    userId,
    ipAddress = null,
    userAgent = null,
    deviceId = null,
    sessionId = null
  } = {}) {
    return recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.LOGIN_SUCCESS,
      ipAddress,
      userAgent,
      deviceId,
      sessionId
    });
  }

  async function recordLoginFailure({
    userId = null,
    identifier = null,
    ipAddress = null,
    userAgent = null,
    data = null
  } = {}) {
    if (!userId && !identifier) {
      throw new SecurityServiceError(
        "SECURITY_SUBJECT_REQUIRED",
        "معرّف المستخدم أو بيانات التعريف مطلوبة."
      );
    }

    return securityRepository.query(
      "createSecurityEvent",
      {
        userId,
        type:
          SECURITY_EVENT_TYPES.LOGIN_FAILED,
        ipAddress,
        userAgent,
        data: {
          identifier,
          ...data
        },
        createdAt: now()
      }
    );
  }

  async function listEvents(
    userId,
    {
      limit = 50,
      offset = 0,
      type = null
    } = {}
  ) {
    requireUserId(userId);

    const where = {
      userId
    };

    if (type) {
      where.type = type;
    }

    return securityRepository.findMany({
      where,
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function changePassword({
    userId,
    currentPassword,
    newPassword
  } = {}) {
    requireUserId(userId);

    if (!passwordService) {
      throw new SecurityServiceError(
        "PASSWORD_SERVICE_REQUIRED",
        "Password service is not configured."
      );
    }

    if (!currentPassword) {
      throw new SecurityServiceError(
        "CURRENT_PASSWORD_REQUIRED",
        "كلمة المرور الحالية مطلوبة."
      );
    }

    if (!newPassword) {
      throw new SecurityServiceError(
        "NEW_PASSWORD_REQUIRED",
        "كلمة المرور الجديدة مطلوبة."
      );
    }

    if (!userRepository) {
      throw new SecurityServiceError(
        "USER_REPOSITORY_REQUIRED",
        "User repository is not configured."
      );
    }

    const user =
      await userRepository.findOne({
        where: {
          id: userId
        }
      });

    if (!user) {
      throw new SecurityServiceError(
        "USER_NOT_FOUND",
        "المستخدم غير موجود."
      );
    }

    const valid =
      await passwordService.verify(
        currentPassword,
        user.passwordHash
      );

    if (!valid) {
      throw new SecurityServiceError(
        "CURRENT_PASSWORD_INVALID",
        "كلمة المرور الحالية غير صحيحة."
      );
    }

    const passwordHash =
      await passwordService.hash(
        newPassword
      );

    await userRepository.update(
      userId,
      {
        passwordHash,
        passwordChangedAt: now(),
        updatedAt: now()
      }
    );

    await recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.PASSWORD_CHANGED
    });

    if (
      sessionService?.revokeOtherSessions
    ) {
      await sessionService.revokeOtherSessions(
        userId
      );
    }

    return {
      changed: true
    };
  }

  async function revokeSession(
    userId,
    sessionId
  ) {
    requireUserId(userId);

    if (!sessionService) {
      throw new SecurityServiceError(
        "SESSION_SERVICE_REQUIRED",
        "Session service is not configured."
      );
    }

    if (!sessionId) {
      throw new SecurityServiceError(
        "SESSION_ID_REQUIRED",
        "معرّف الجلسة مطلوب."
      );
    }

    const result =
      await sessionService.revokeSession(
        sessionId,
        userId
      );

    await recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.SESSION_REVOKED,
      sessionId
    });

    return result;
  }

  async function revokeAllOtherSessions(
    userId,
    currentSessionId = null
  ) {
    requireUserId(userId);

    if (!sessionService) {
      throw new SecurityServiceError(
        "SESSION_SERVICE_REQUIRED",
        "Session service is not configured."
      );
    }

    const result =
      await sessionService.revokeOtherSessions(
        userId,
        currentSessionId
      );

    await recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.SESSION_REVOKED,
      data: {
        allOtherSessions: true
      }
    });

    return result;
  }

  async function revokeDevice(
    userId,
    deviceId
  ) {
    requireUserId(userId);

    if (!deviceService) {
      throw new SecurityServiceError(
        "DEVICE_SERVICE_REQUIRED",
        "Device service is not configured."
      );
    }

    if (!deviceId) {
      throw new SecurityServiceError(
        "DEVICE_ID_REQUIRED",
        "معرّف الجهاز مطلوب."
      );
    }

    const result =
      await deviceService.revoke(
        deviceId,
        userId
      );

    await recordEvent({
      userId,
      type:
        SECURITY_EVENT_TYPES.DEVICE_REVOKED,
      deviceId
    });

    return result;
  }

  return Object.freeze({
    getSettings,
    updateSettings,
    recordEvent,
    recordLoginSuccess,
    recordLoginFailure,
    listEvents,
    changePassword,
    revokeSession,
    revokeAllOtherSessions,
    revokeDevice,
    constants: {
      SECURITY_EVENT_TYPES,
      SECURITY_SETTING_DEFAULTS
    }
  });
}

module.exports = {
  createSecurityService,
  SecurityServiceError,
  SECURITY_EVENT_TYPES,
  SECURITY_SETTING_DEFAULTS
};
