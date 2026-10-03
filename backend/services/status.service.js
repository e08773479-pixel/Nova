"use strict";

/**
 * NOVA — Status Service
 *
 * مسؤول عن حالات المستخدم:
 * - إنشاء الحالة
 * - قراءة الحالات
 * - تحديثها
 * - حذفها
 * - تسجيل المشاهدات
 * - انتهاء صلاحية الحالة
 */

const STATUS_TYPES = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video"
});

const STATUS_STATE = Object.freeze({
  ACTIVE: "active",
  EXPIRED: "expired",
  DELETED: "deleted"
});

class StatusServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "StatusServiceError";
    this.code = code;
    this.details = details;
  }
}

function createStatusService({
  statusRepository,
  viewerRepository = null,
  userRepository = null,
  contactService = null,
  realtimeService = null,
  clock = () => new Date(),
  defaultLifetimeMs = 24 * 60 * 60 * 1000
} = {}) {
  if (!statusRepository) {
    throw new StatusServiceError(
      "STATUS_REPOSITORY_REQUIRED",
      "Status repository is required."
    );
  }

  const now = () => clock();

  function requireUserId(userId) {
    if (!userId) {
      throw new StatusServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return userId;
  }

  async function getById(statusId) {
    if (!statusId) {
      throw new StatusServiceError(
        "STATUS_ID_REQUIRED",
        "معرّف الحالة مطلوب."
      );
    }

    const status = await statusRepository.findOne({
      where: { id: statusId }
    });

    if (!status) {
      throw new StatusServiceError(
        "STATUS_NOT_FOUND",
        "الحالة غير موجودة."
      );
    }

    return status;
  }

  function isExpired(status) {
    if (!status.expiresAt) {
      return false;
    }

    return new Date(status.expiresAt).getTime() <=
      now().getTime();
  }

  async function create({
    userId,
    type = STATUS_TYPES.TEXT,
    text = null,
    mediaUrl = null,
    privacy = "contacts",
    lifetimeMs = defaultLifetimeMs,
    metadata = null
  } = {}) {
    requireUserId(userId);

    if (!Object.values(STATUS_TYPES).includes(type)) {
      throw new StatusServiceError(
        "INVALID_STATUS_TYPE",
        "نوع الحالة غير صالح."
      );
    }

    if (
      type === STATUS_TYPES.TEXT &&
      !String(text || "").trim()
    ) {
      throw new StatusServiceError(
        "STATUS_CONTENT_REQUIRED",
        "محتوى الحالة مطلوب."
      );
    }

    if (
      type !== STATUS_TYPES.TEXT &&
      !mediaUrl
    ) {
      throw new StatusServiceError(
        "STATUS_MEDIA_REQUIRED",
        "ملف الحالة مطلوب."
      );
    }

    if (userRepository) {
      const user = await userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        throw new StatusServiceError(
          "USER_NOT_FOUND",
          "المستخدم غير موجود."
        );
      }
    }

    const createdAt = now();

    const status =
      await statusRepository.create({
        userId,
        type,
        text:
          typeof text === "string"
            ? text.trim()
            : null,
        mediaUrl,
        privacy,
        state: STATUS_STATE.ACTIVE,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(
          createdAt.getTime() + lifetimeMs
        ),
        metadata
      });

    if (realtimeService?.statusCreated) {
      await realtimeService.statusCreated(
        status
      );
    }

    return status;
  }

  async function listUserStatuses(
    userId
  ) {
    requireUserId(userId);

    return statusRepository.findMany({
      where: {
        userId,
        state: STATUS_STATE.ACTIVE
      },
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function listVisibleStatuses(
    userId,
    {
      limit = 50,
      offset = 0
    } = {}
  ) {
    requireUserId(userId);

    if (!contactService) {
      throw new StatusServiceError(
        "CONTACT_SERVICE_REQUIRED",
        "Contact service is required to resolve status visibility."
      );
    }

    return statusRepository.findMany({
      where: {
        visibleTo: userId,
        state: STATUS_STATE.ACTIVE
      },
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function remove(
    statusId,
    userId
  ) {
    requireUserId(userId);

    const status = await getById(statusId);

    if (status.userId !== userId) {
      throw new StatusServiceError(
        "STATUS_OWNER_REQUIRED",
        "يمكن لصاحب الحالة فقط حذفها."
      );
    }

    const updated =
      await statusRepository.update(
        statusId,
        {
          state: STATUS_STATE.DELETED,
          deletedAt: now(),
          updatedAt: now()
        }
      );

    if (realtimeService?.statusDeleted) {
      await realtimeService.statusDeleted(
        updated
      );
    }

    return updated;
  }

  async function markExpired(statusId) {
    const status = await getById(statusId);

    if (!isExpired(status)) {
      return status;
    }

    return statusRepository.update(
      statusId,
      {
        state: STATUS_STATE.EXPIRED,
        updatedAt: now()
      }
    );
  }

  async function markViewed(
    statusId,
    viewerId
  ) {
    requireUserId(viewerId);

    const status = await getById(statusId);

    if (status.state !== STATUS_STATE.ACTIVE) {
      throw new StatusServiceError(
        "STATUS_NOT_ACTIVE",
        "الحالة لم تعد متاحة."
      );
    }

    if (isExpired(status)) {
      await markExpired(statusId);

      throw new StatusServiceError(
        "STATUS_EXPIRED",
        "انتهت صلاحية الحالة."
      );
    }

    if (!viewerRepository) {
      throw new StatusServiceError(
        "VIEWER_REPOSITORY_REQUIRED",
        "Status viewer repository is not configured."
      );
    }

    const existing =
      await viewerRepository.findOne({
        where: {
          statusId,
          viewerId
        }
      });

    if (existing) {
      return existing;
    }

    const view =
      await viewerRepository.create({
        statusId,
        viewerId,
        viewedAt: now()
      });

    if (realtimeService?.statusViewed) {
      await realtimeService.statusViewed(
        status,
        view
      );
    }

    return view;
  }

  async function listViewers(
    statusId,
    ownerId,
    {
      limit = 100,
      offset = 0
    } = {}
  ) {
    const status = await getById(statusId);

    if (status.userId !== ownerId) {
      throw new StatusServiceError(
        "STATUS_OWNER_REQUIRED",
        "يمكن لصاحب الحالة فقط رؤية المشاهدين."
      );
    }

    if (!viewerRepository) {
      throw new StatusServiceError(
        "VIEWER_REPOSITORY_REQUIRED",
        "Status viewer repository is not configured."
      );
    }

    return viewerRepository.findMany({
      where: {
        statusId
      },
      limit,
      offset,
      sort: {
        viewedAt: "desc"
      }
    });
  }

  async function update(
    statusId,
    userId,
    changes
  ) {
    requireUserId(userId);

    const status = await getById(statusId);

    if (status.userId !== userId) {
      throw new StatusServiceError(
        "STATUS_OWNER_REQUIRED",
        "يمكن لصاحب الحالة فقط تعديلها."
      );
    }

    const allowed = [
      "text",
      "mediaUrl",
      "privacy",
      "metadata"
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

    if (!Object.keys(payload).length) {
      throw new StatusServiceError(
        "NO_CHANGES",
        "لا توجد بيانات لتحديثها."
      );
    }

    payload.updatedAt = now();

    return statusRepository.update(
      statusId,
      payload
    );
  }

  return Object.freeze({
    create,
    getById,
    update,
    remove,
    markExpired,
    listUserStatuses,
    listVisibleStatuses,
    markViewed,
    listViewers,
    isExpired,
    constants: {
      STATUS_TYPES,
      STATUS_STATE
    }
  });
}

module.exports = {
  createStatusService,
  StatusServiceError,
  STATUS_TYPES,
  STATUS_STATE
};
