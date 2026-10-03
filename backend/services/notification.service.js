"use strict";

/**
 * NOVA — Notification Service
 *
 * مسؤول عن:
 * - إنشاء الإشعارات
 * - جلب إشعارات المستخدم
 * - تعليم الإشعار كمقروء
 * - تعليم الكل كمقروء
 * - حذف الإشعارات
 * - عداد غير المقروء
 */

const NOTIFICATION_TYPES = Object.freeze({
  MESSAGE: "message",
  FRIEND_REQUEST: "friend_request",
  FRIEND_ACCEPTED: "friend_accepted",
  GROUP: "group",
  COMMUNITY: "community",
  CALL: "call",
  SYSTEM: "system",
  SECURITY: "security"
});

const NOTIFICATION_STATUS = Object.freeze({
  UNREAD: "unread",
  READ: "read"
});

class NotificationServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "NotificationServiceError";
    this.code = code;
    this.details = details;
  }
}

function createNotificationService({
  notificationRepository,
  realtimeService = null,
  clock = () => new Date()
} = {}) {
  if (!notificationRepository) {
    throw new NotificationServiceError(
      "NOTIFICATION_REPOSITORY_REQUIRED",
      "Notification repository is required."
    );
  }

  const now = () => clock();

  async function create({
    userId,
    type,
    title,
    body = null,
    actorId = null,
    entityType = null,
    entityId = null,
    data = null
  } = {}) {
    if (!userId) {
      throw new NotificationServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
      throw new NotificationServiceError(
        "INVALID_NOTIFICATION_TYPE",
        "نوع الإشعار غير صالح."
      );
    }

    if (!title) {
      throw new NotificationServiceError(
        "NOTIFICATION_TITLE_REQUIRED",
        "عنوان الإشعار مطلوب."
      );
    }

    const notification =
      await notificationRepository.create({
        userId,
        type,
        title: String(title).trim(),
        body:
          body === null
            ? null
            : String(body).trim(),
        actorId,
        entityType,
        entityId,
        data,
        status: NOTIFICATION_STATUS.UNREAD,
        createdAt: now(),
        updatedAt: now()
      });

    if (realtimeService?.notificationCreated) {
      await realtimeService.notificationCreated(
        notification
      );
    }

    return notification;
  }

  async function getById(notificationId) {
    const notification =
      await notificationRepository.findOne({
        where: { id: notificationId }
      });

    if (!notification) {
      throw new NotificationServiceError(
        "NOTIFICATION_NOT_FOUND",
        "الإشعار غير موجود."
      );
    }

    return notification;
  }

  async function list(
    userId,
    {
      limit = 30,
      offset = 0,
      unreadOnly = false
    } = {}
  ) {
    if (!userId) {
      throw new NotificationServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    const where = {
      userId
    };

    if (unreadOnly) {
      where.status = NOTIFICATION_STATUS.UNREAD;
    }

    return notificationRepository.findMany({
      where,
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function markRead(
    notificationId,
    userId
  ) {
    const notification =
      await getById(notificationId);

    if (notification.userId !== userId) {
      throw new NotificationServiceError(
        "NOTIFICATION_ACCESS_DENIED",
        "لا يمكنك تعديل هذا الإشعار."
      );
    }

    if (
      notification.status ===
      NOTIFICATION_STATUS.READ
    ) {
      return notification;
    }

    const updated =
      await notificationRepository.update(
        notificationId,
        {
          status: NOTIFICATION_STATUS.READ,
          readAt: now(),
          updatedAt: now()
        }
      );

    if (realtimeService?.notificationRead) {
      await realtimeService.notificationRead(
        updated
      );
    }

    return updated;
  }

  async function markAllRead(userId) {
    if (!userId) {
      throw new NotificationServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return notificationRepository.query(
      "markAllRead",
      {
        userId,
        status: NOTIFICATION_STATUS.READ,
        readAt: now(),
        updatedAt: now()
      }
    );
  }

  async function unreadCount(userId) {
    if (!userId) {
      throw new NotificationServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    const result =
      await notificationRepository.query(
        "countUnread",
        {
          userId,
          status: NOTIFICATION_STATUS.UNREAD
        }
      );

    return Number(
      result?.count ??
      result ??
      0
    );
  }

  async function remove(
    notificationId,
    userId
  ) {
    const notification =
      await getById(notificationId);

    if (notification.userId !== userId) {
      throw new NotificationServiceError(
        "NOTIFICATION_ACCESS_DENIED",
        "لا يمكنك حذف هذا الإشعار."
      );
    }

    return notificationRepository.delete(
      notificationId
    );
  }

  async function removeAll(userId) {
    if (!userId) {
      throw new NotificationServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return notificationRepository.query(
      "deleteUserNotifications",
      {
        userId
      }
    );
  }

  return Object.freeze({
    create,
    getById,
    list,
    markRead,
    markAllRead,
    unreadCount,
    remove,
    removeAll,
    constants: {
      NOTIFICATION_TYPES,
      NOTIFICATION_STATUS
    }
  });
}

module.exports = {
  createNotificationService,
  NotificationServiceError,
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUS
};
