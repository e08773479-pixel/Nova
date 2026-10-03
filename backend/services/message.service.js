"use strict";

/**
 * NOVA — Message Service
 *
 * مسؤول عن دورة حياة الرسائل:
 * - إنشاء الرسائل
 * - قراءتها
 * - تعديلها
 * - حذفها
 * - الرد عليها
 * - الرسائل المقروءة
 * - البحث
 *
 * لا يوجد اتصال مباشر بقاعدة البيانات.
 */

const MESSAGE_TYPES = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  FILE: "file",
  SYSTEM: "system"
});

const MESSAGE_STATUS = Object.freeze({
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  DELETED: "deleted"
});

class MessageServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "MessageServiceError";
    this.code = code;
    this.details = details;
  }
}

function createMessageService({
  messageRepository,
  conversationService = null,
  attachmentService = null,
  userRepository = null,
  realtimeService = null,
  clock = () => new Date()
} = {}) {
  if (!messageRepository) {
    throw new MessageServiceError(
      "MESSAGE_REPOSITORY_REQUIRED",
      "Message repository is required."
    );
  }

  const now = () => clock();

  function requireValue(value, code, message) {
    if (!value) {
      throw new MessageServiceError(code, message);
    }

    return value;
  }

  async function ensureConversationAccess(conversationId, userId) {
    requireValue(
      conversationId,
      "CONVERSATION_ID_REQUIRED",
      "معرّف المحادثة مطلوب."
    );

    requireValue(
      userId,
      "USER_ID_REQUIRED",
      "معرّف المستخدم مطلوب."
    );

    if (!conversationService) {
      throw new MessageServiceError(
        "CONVERSATION_SERVICE_REQUIRED",
        "Conversation service is not configured."
      );
    }

    await conversationService.getMembership(
      conversationId,
      userId
    );
  }

  async function getById(messageId) {
    requireValue(
      messageId,
      "MESSAGE_ID_REQUIRED",
      "معرّف الرسالة مطلوب."
    );

    const message = await messageRepository.findOne({
      where: { id: messageId }
    });

    if (!message) {
      throw new MessageServiceError(
        "MESSAGE_NOT_FOUND",
        "الرسالة غير موجودة."
      );
    }

    return message;
  }

  async function create({
    conversationId,
    senderId,
    type = MESSAGE_TYPES.TEXT,
    text = null,
    attachmentIds = [],
    replyToId = null,
    metadata = null
  } = {}) {
    await ensureConversationAccess(
      conversationId,
      senderId
    );

    if (!Object.values(MESSAGE_TYPES).includes(type)) {
      throw new MessageServiceError(
        "INVALID_MESSAGE_TYPE",
        "نوع الرسالة غير صالح."
      );
    }

    if (
      type === MESSAGE_TYPES.TEXT &&
      !String(text || "").trim()
    ) {
      throw new MessageServiceError(
        "MESSAGE_CONTENT_REQUIRED",
        "محتوى الرسالة مطلوب."
      );
    }

    if (
      replyToId &&
      !(await messageRepository.findOne({
        where: { id: replyToId }
      }))
    ) {
      throw new MessageServiceError(
        "REPLY_MESSAGE_NOT_FOUND",
        "الرسالة التي يتم الرد عليها غير موجودة."
      );
    }

    if (
      attachmentIds.length &&
      !attachmentService
    ) {
      throw new MessageServiceError(
        "ATTACHMENT_SERVICE_REQUIRED",
        "Attachment service is not configured."
      );
    }

    const message = await messageRepository.create({
      conversationId,
      senderId,
      type,
      text:
        typeof text === "string"
          ? text.trim()
          : null,
      attachmentIds,
      replyToId,
      metadata,
      status: MESSAGE_STATUS.SENT,
      createdAt: now(),
      updatedAt: now()
    });

    if (realtimeService?.messageCreated) {
      await realtimeService.messageCreated(message);
    }

    return message;
  }

  async function list(
    conversationId,
    userId,
    {
      limit = 50,
      offset = 0,
      before = null,
      after = null
    } = {}
  ) {
    await ensureConversationAccess(
      conversationId,
      userId
    );

    const where = {
      conversationId,
      status: {
        $ne: MESSAGE_STATUS.DELETED
      }
    };

    if (before) {
      where.createdAt = {
        ...(where.createdAt || {}),
        $lt: before
      };
    }

    if (after) {
      where.createdAt = {
        ...(where.createdAt || {}),
        $gt: after
      };
    }

    return messageRepository.findMany({
      where,
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function updateText(
    messageId,
    userId,
    text
  ) {
    const message = await getById(messageId);

    if (message.senderId !== userId) {
      throw new MessageServiceError(
        "MESSAGE_OWNER_REQUIRED",
        "يمكن لمرسل الرسالة فقط تعديلها."
      );
    }

    if (message.status === MESSAGE_STATUS.DELETED) {
      throw new MessageServiceError(
        "MESSAGE_DELETED",
        "لا يمكن تعديل رسالة محذوفة."
      );
    }

    const content = String(text || "").trim();

    if (!content) {
      throw new MessageServiceError(
        "MESSAGE_CONTENT_REQUIRED",
        "محتوى الرسالة مطلوب."
      );
    }

    const updated = await messageRepository.update(
      messageId,
      {
        text: content,
        edited: true,
        editedAt: now(),
        updatedAt: now()
      }
    );

    if (realtimeService?.messageUpdated) {
      await realtimeService.messageUpdated(updated);
    }

    return updated;
  }

  async function remove(messageId, userId) {
    const message = await getById(messageId);

    if (message.senderId !== userId) {
      throw new MessageServiceError(
        "MESSAGE_OWNER_REQUIRED",
        "يمكن لمرسل الرسالة فقط حذفها."
      );
    }

    const updated = await messageRepository.update(
      messageId,
      {
        status: MESSAGE_STATUS.DELETED,
        text: null,
        attachmentIds: [],
        deletedAt: now(),
        updatedAt: now()
      }
    );

    if (realtimeService?.messageDeleted) {
      await realtimeService.messageDeleted(updated);
    }

    return updated;
  }

  async function markDelivered(
    messageId,
    userId
  ) {
    await ensureMessageConversationAccess(
      messageId,
      userId
    );

    const message = await getById(messageId);

    if (
      message.status === MESSAGE_STATUS.READ
    ) {
      return message;
    }

    return messageRepository.update(
      messageId,
      {
        status: MESSAGE_STATUS.DELIVERED,
        deliveredAt: message.deliveredAt || now(),
        updatedAt: now()
      }
    );
  }

  async function markRead(
    messageId,
    userId
  ) {
    await ensureMessageConversationAccess(
      messageId,
      userId
    );

    const message = await getById(messageId);

    const updated = await messageRepository.update(
      messageId,
      {
        status: MESSAGE_STATUS.READ,
        readAt: now(),
        updatedAt: now()
      }
    );

    if (realtimeService?.messageRead) {
      await realtimeService.messageRead(
        updated,
        userId
      );
    }

    return updated;
  }

  async function markConversationRead(
    conversationId,
    userId
  ) {
    await ensureConversationAccess(
      conversationId,
      userId
    );

    return messageRepository.query(
      "markConversationRead",
      {
        conversationId,
        userId,
        status: MESSAGE_STATUS.READ,
        readAt: now()
      }
    );
  }

  async function search(
    conversationId,
    userId,
    query,
    {
      limit = 20,
      offset = 0
    } = {}
  ) {
    await ensureConversationAccess(
      conversationId,
      userId
    );

    const value = String(query || "").trim();

    if (!value) {
      return [];
    }

    return messageRepository.findMany({
      where: {
        conversationId,
        textSearch: value,
        status: {
          $ne: MESSAGE_STATUS.DELETED
        }
      },
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function getReplyChain(
    messageId,
    userId
  ) {
    const message = await getById(messageId);

    await ensureConversationAccess(
      message.conversationId,
      userId
    );

    const chain = [];
    let current = message;

    while (current?.replyToId) {
      const parent = await getById(
        current.replyToId
      );

      chain.unshift(parent);
      current = parent;
    }

    chain.push(message);

    return chain;
  }

  async function ensureMessageConversationAccess(
    messageId,
    userId
  ) {
    const message = await getById(messageId);

    await ensureConversationAccess(
      message.conversationId,
      userId
    );

    return message;
  }

  return Object.freeze({
    create,
    getById,
    list,
    updateText,
    remove,
    markDelivered,
    markRead,
    markConversationRead,
    search,
    getReplyChain,
    constants: {
      MESSAGE_TYPES,
      MESSAGE_STATUS
    }
  });
}

module.exports = {
  createMessageService,
  MessageServiceError,
  MESSAGE_TYPES,
  MESSAGE_STATUS
};
