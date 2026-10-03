"use strict";

/**
 * NOVA — Device Service
 *
 * مسؤول عن الأجهزة المرتبطة بالحساب:
 * - تسجيل جهاز
 * - تحديث بيانات الجهاز
 * - عرض الأجهزة
 * - تحديد الجهاز الحالي
 * - إلغاء تسجيل جهاز
 * - إدارة Push Token
 */

const DEVICE_STATUS = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked"
});

class DeviceServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "DeviceServiceError";
    this.code = code;
    this.details = details;
  }
}

function createDeviceService({
  deviceRepository,
  sessionService = null,
  realtimeService = null,
  clock = () => new Date()
} = {}) {
  if (!deviceRepository) {
    throw new DeviceServiceError(
      "DEVICE_REPOSITORY_REQUIRED",
      "Device repository is required."
    );
  }

  const now = () => clock();

  function requireUserId(userId) {
    if (!userId) {
      throw new DeviceServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return userId;
  }

  async function register({
    userId,
    deviceId,
    platform,
    name = null,
    model = null,
    appVersion = null,
    pushToken = null,
    ipAddress = null,
    userAgent = null
  } = {}) {
    requireUserId(userId);

    if (!deviceId) {
      throw new DeviceServiceError(
        "DEVICE_ID_REQUIRED",
        "معرّف الجهاز مطلوب."
      );
    }

    if (!platform) {
      throw new DeviceServiceError(
        "DEVICE_PLATFORM_REQUIRED",
        "نوع الجهاز مطلوب."
      );
    }

    const existing =
      await deviceRepository.findOne({
        where: {
          userId,
          deviceId
        }
      });

    if (existing) {
      return deviceRepository.update(
        existing.id,
        {
          platform,
          name,
          model,
          appVersion,
          pushToken,
          ipAddress,
          userAgent,
          status: DEVICE_STATUS.ACTIVE,
          lastSeenAt: now(),
          updatedAt: now()
        }
      );
    }

    const device =
      await deviceRepository.create({
        userId,
        deviceId,
        platform,
        name,
        model,
        appVersion,
        pushToken,
        ipAddress,
        userAgent,
        status: DEVICE_STATUS.ACTIVE,
        firstSeenAt: now(),
        lastSeenAt: now(),
        createdAt: now(),
        updatedAt: now()
      });

    if (realtimeService?.deviceRegistered) {
      await realtimeService.deviceRegistered(
        device
      );
    }

    return device;
  }

  async function getById(deviceId) {
    if (!deviceId) {
      throw new DeviceServiceError(
        "DEVICE_ID_REQUIRED",
        "معرّف الجهاز مطلوب."
      );
    }

    const device =
      await deviceRepository.findOne({
        where: { id: deviceId }
      });

    if (!device) {
      throw new DeviceServiceError(
        "DEVICE_NOT_FOUND",
        "الجهاز غير موجود."
      );
    }

    return device;
  }

  async function list(userId) {
    requireUserId(userId);

    return deviceRepository.findMany({
      where: {
        userId,
        status: DEVICE_STATUS.ACTIVE
      },
      sort: {
        lastSeenAt: "desc"
      }
    });
  }

  async function update(
    deviceId,
    userId,
    changes
  ) {
    requireUserId(userId);

    const device = await getById(deviceId);

    if (device.userId !== userId) {
      throw new DeviceServiceError(
        "DEVICE_ACCESS_DENIED",
        "لا يمكنك تعديل هذا الجهاز."
      );
    }

    const allowed = [
      "name",
      "model",
      "appVersion",
      "pushToken",
      "ipAddress",
      "userAgent"
    ];

    const payload = {};

    for (const key of allowed) {
      if (
        Object.prototype.hasOwnProperty.call(
          changes || {},
          key
        )
      ) {
        payload[key] = changes[key];
      }
    }

    payload.lastSeenAt = now();
    payload.updatedAt = now();

    return deviceRepository.update(
      deviceId,
      payload
    );
  }

  async function touch(
    deviceId,
    userId
  ) {
    requireUserId(userId);

    const device = await getById(deviceId);

    if (device.userId !== userId) {
      throw new DeviceServiceError(
        "DEVICE_ACCESS_DENIED",
        "لا يمكنك تحديث هذا الجهاز."
      );
    }

    return deviceRepository.update(
      deviceId,
      {
        lastSeenAt: now(),
        updatedAt: now()
      }
    );
  }

  async function revoke(
    deviceId,
    userId
  ) {
    requireUserId(userId);

    const device = await getById(deviceId);

    if (device.userId !== userId) {
      throw new DeviceServiceError(
        "DEVICE_ACCESS_DENIED",
        "لا يمكنك إلغاء هذا الجهاز."
      );
    }

    const revoked =
      await deviceRepository.update(
        deviceId,
        {
          status: DEVICE_STATUS.REVOKED,
          revokedAt: now(),
          updatedAt: now()
        }
      );

    if (
      sessionService?.revokeDeviceSessions
    ) {
      await sessionService.revokeDeviceSessions(
        userId,
        deviceId
      );
    }

    if (realtimeService?.deviceRevoked) {
      await realtimeService.deviceRevoked(
        revoked
      );
    }

    return revoked;
  }

  async function revokeAllExcept(
    userId,
    currentDeviceId
  ) {
    requireUserId(userId);

    return deviceRepository.query(
      "revokeAllExcept",
      {
        userId,
        currentDeviceId,
        status: DEVICE_STATUS.REVOKED,
        revokedAt: now(),
        updatedAt: now()
      }
    );
  }

  async function setPushToken(
    deviceId,
    userId,
    pushToken
  ) {
    requireUserId(userId);

    if (!pushToken) {
      throw new DeviceServiceError(
        "PUSH_TOKEN_REQUIRED",
        "رمز الإشعارات مطلوب."
      );
    }

    const device = await getById(deviceId);

    if (device.userId !== userId) {
      throw new DeviceServiceError(
        "DEVICE_ACCESS_DENIED",
        "لا يمكنك تعديل هذا الجهاز."
      );
    }

    return deviceRepository.update(
      deviceId,
      {
        pushToken,
        lastSeenAt: now(),
        updatedAt: now()
      }
    );
  }

  async function findByDeviceIdentifier(
    userId,
    deviceIdentifier
  ) {
    requireUserId(userId);

    if (!deviceIdentifier) {
      return null;
    }

    return deviceRepository.findOne({
      where: {
        userId,
        deviceId: deviceIdentifier
      }
    });
  }

  return Object.freeze({
    register,
    getById,
    list,
    update,
    touch,
    revoke,
    revokeAllExcept,
    setPushToken,
    findByDeviceIdentifier,
    constants: {
      DEVICE_STATUS
    }
  });
}

module.exports = {
  createDeviceService,
  DeviceServiceError,
  DEVICE_STATUS
};
