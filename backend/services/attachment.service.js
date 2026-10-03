"use strict";

/**
 * NOVA — Attachment Service
 * =========================================================
 *
 * مسؤول عن منطق المرفقات والملفات المرتبطة بالمحادثات.
 *
 * المسؤوليات:
 * - إنشاء سجل مرفق بعد رفع الملف فعليًا
 * - جلب المرفق
 * - التحقق من ملكية/صلاحية الوصول
 * - تحديث حالة المرفق
 * - حذف المرفق منطقيًا
 * - ربط المرفق برسالة
 * - البحث عن مرفقات المحادثة
 *
 * ملاحظة:
 * هذه الطبقة لا ترفع الملفات إلى القرص أو التخزين السحابي
 * بنفسها. عملية التخزين الفعلي يجب أن تتم عبر Storage Provider
 * ويتم تمرير نتيجة التخزين إلى الخدمة.
 *
 * لا توجد بيانات وهمية.
 * لا يوجد اتصال مباشر بقاعدة البيانات.
 */

class AttachmentServiceError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);

    this.name = "AttachmentServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}


// ============================================================
// Constants
// ============================================================

const ATTACHMENT_TYPES = Object.freeze({
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  DOCUMENT: "document",
  OTHER: "other"
});


const ATTACHMENT_STATUS = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
  DELETED: "deleted"
});


const VALID_ATTACHMENT_TYPES = Object.freeze(
  Object.values(ATTACHMENT_TYPES)
);


const VALID_ATTACHMENT_STATUS = Object.freeze(
  Object.values(ATTACHMENT_STATUS)
);


// ============================================================
// Errors
// ============================================================

function attachmentNotFound() {
  return new AttachmentServiceError(
    "ATTACHMENT_NOT_FOUND",
    "المرفق غير موجود.",
    404
  );
}


function attachmentRepositoryUnavailable() {
  return new AttachmentServiceError(
    "ATTACHMENT_REPOSITORY_NOT_CONFIGURED",
    "خدمة المرفقات غير مهيأة.",
    503
  );
}


function attachmentAccessDenied() {
  return new AttachmentServiceError(
    "ATTACHMENT_ACCESS_DENIED",
    "ليس لديك صلاحية للوصول إلى هذا المرفق.",
    403
  );
}


// ============================================================
// Helpers
// ============================================================

function normalizeId(value, field = "المعرّف") {
  if (value === null || value === undefined) {
    throw new AttachmentServiceError(
      "INVALID_ID",
      `${field} مطلوب.`,
      400
    );
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new AttachmentServiceError(
      "INVALID_ID",
      `${field} غير صالح.`,
      400
    );
  }

  return normalized;
}


function normalizeText(
  value,
  {
    nullable = true,
    maxLength = 255
  } = {}
) {
  if (value === null || value === undefined) {
    if (nullable) {
      return null;
    }

    throw new AttachmentServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (typeof value !== "string") {
    throw new AttachmentServiceError(
      "INVALID_TEXT",
      "القيمة النصية غير صالحة.",
      400
    );
  }

  const normalized = value.trim();

  if (!nullable && !normalized) {
    throw new AttachmentServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (normalized.length > maxLength) {
    throw new AttachmentServiceError(
      "TEXT_TOO_LONG",
      "القيمة النصية تتجاوز الحد المسموح.",
      400
    );
  }

  return normalized || null;
}


function normalizePositiveNumber(
  value,
  field = "القيمة"
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    throw new AttachmentServiceError(
      "INVALID_NUMBER",
      `${field} مطلوبة.`,
      400
    );
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    throw new AttachmentServiceError(
      "INVALID_NUMBER",
      `${field} غير صالحة.`,
      400
    );
  }

  return number;
}


function normalizeAttachmentType(type) {
  const normalized = normalizeText(
    type,
    {
      nullable: false,
      maxLength: 30
    }
  );

  if (
    !VALID_ATTACHMENT_TYPES.includes(
      normalized
    )
  ) {
    throw new AttachmentServiceError(
      "INVALID_ATTACHMENT_TYPE",
      "نوع المرفق غير مدعوم.",
      400
    );
  }

  return normalized;
}


function normalizeStatus(status) {
  const normalized = normalizeText(
    status,
    {
      nullable: false,
      maxLength: 30
    }
  );

  if (
    !VALID_ATTACHMENT_STATUS.includes(
      normalized
    )
  ) {
    throw new AttachmentServiceError(
      "INVALID_ATTACHMENT_STATUS",
      "حالة المرفق غير مدعومة.",
      400
    );
  }

  return normalized;
}


function normalizeLimit(
  value,
  fallback = 30,
  maximum = 100
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    Math.max(Math.floor(number), 1),
    maximum
  );
}


function normalizeOffset(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    Math.floor(number),
    0
  );
}


// ============================================================
// Sanitization
// ============================================================

const INTERNAL_FIELDS = Object.freeze([
  "secret",
  "privateKey",
  "storageSecret",
  "internalPath",
  "internalNotes",
  "securityToken"
]);


function sanitizeAttachment(attachment) {
  if (
    !attachment ||
    typeof attachment !== "object"
  ) {
    return null;
  }

  const safe = {
    ...attachment
  };

  for (
    const field of INTERNAL_FIELDS
  ) {
    delete safe[field];
  }

  return safe;
}


// ============================================================
// Service Factory
// ============================================================

function createAttachmentService(
  dependencies = {}
) {
  const {
    attachmentRepository = null,

    conversationRepository = null,

    conversationMemberRepository = null,

    messageRepository = null,

    storageProvider = null,

    clock = () => new Date()
  } = dependencies;


  // ==========================================================
  // Requirements
  // ==========================================================

  function requireAttachmentRepository() {
    if (
      !attachmentRepository ||
      typeof attachmentRepository.findOne !==
        "function"
    ) {
      throw attachmentRepositoryUnavailable();
    }
  }


  function requireMemberRepository() {
    if (
      !conversationMemberRepository ||
      typeof conversationMemberRepository.findOne !==
        "function"
    ) {
      throw new AttachmentServiceError(
        "MEMBER_REPOSITORY_NOT_CONFIGURED",
        "خدمة أعضاء المحادثات غير مهيأة.",
        503
      );
    }
  }


  // ==========================================================
  // Membership
  // ==========================================================

  async function getConversationMembership(
    conversationId,
    userId
  ) {
    requireMemberRepository();

    const normalizedConversationId =
      normalizeId(
        conversationId,
        "معرّف المحادثة"
      );

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    return (
      await conversationMemberRepository.findOne({
        where: {
          conversationId:
            normalizedConversationId,

          userId:
            normalizedUserId
        }
      })
    ) || null;
  }


  async function requireConversationMembership(
    conversationId,
    userId
  ) {
    const member =
      await getConversationMembership(
        conversationId,
        userId
      );

    if (!member) {
      throw attachmentAccessDenied();
    }

    return member;
  }


  // ==========================================================
  // Get Attachment
  // ==========================================================

  async function getById(
    attachmentId,
    options = {}
  ) {
    requireAttachmentRepository();

    const id =
      normalizeId(
        attachmentId,
        "معرّف المرفق"
      );

    const attachment =
      await attachmentRepository.findOne({
        where: {
          id
        }
      });

    if (!attachment) {
      if (
        options.required === false
      ) {
        return null;
      }

      throw attachmentNotFound();
    }

    return sanitizeAttachment(
      attachment
    );
  }


  // ==========================================================
  // Check Access
  // ==========================================================

  async function canAccess(
    attachment,
    userId
  ) {
    if (!attachment) {
      return false;
    }

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    /*
     * Owner access.
     */

    if (
      attachment.ownerId &&
      String(
        attachment.ownerId
      ) === normalizedUserId
    ) {
      return true;
    }

    /*
     * Conversation access.
     */

    if (
      attachment.conversationId
    ) {
      const member =
        await getConversationMembership(
          attachment.conversationId,
          normalizedUserId
        );

      return Boolean(member);
    }

    /*
     * Message-based access.
     */

    if (
      attachment.messageId &&
      messageRepository &&
      typeof messageRepository.findOne ===
        "function"
    ) {
      const message =
        await messageRepository.findOne({
          where: {
            id:
              attachment.messageId
          }
        });

      if (!message) {
        return false;
      }

      const member =
        await getConversationMembership(
          message.conversationId,
          normalizedUserId
        );

      return Boolean(member);
    }

    return false;
  }


  async function requireAccess(
    attachmentId,
    userId
  ) {
    const attachment =
      await getById(
        attachmentId
      );

    const allowed =
      await canAccess(
        attachment,
        userId
      );

    if (!allowed) {
      throw attachmentAccessDenied();
    }

    return attachment;
  }


  // ==========================================================
  // Create Attachment Record
  // ==========================================================

  async function create(
    input = {},
    ownerUserId
  ) {
    requireAttachmentRepository();

    const ownerId =
      normalizeId(
        ownerUserId,
        "معرّف مالك المرفق"
      );

    const type =
      normalizeAttachmentType(
        input.type
      );

    const originalName =
      normalizeText(
        input.originalName,
        {
          nullable: false,
          maxLength: 255
        }
      );

    const mimeType =
      normalizeText(
        input.mimeType,
        {
          nullable: false,
          maxLength: 150
        }
      );

    const size =
      normalizePositiveNumber(
        input.size,
        "حجم الملف"
      );

    const conversationId =
      input.conversationId
        ? normalizeId(
            input.conversationId,
            "معرّف المحادثة"
          )
        : null;

    const messageId =
      input.messageId
        ? normalizeId(
            input.messageId,
            "معرّف الرسالة"
          )
        : null;

    const storageKey =
      normalizeText(
        input.storageKey,
        {
          nullable: false,
          maxLength: 1000
        }
      );

    const url =
      normalizeText(
        input.url,
        {
          nullable: true,
          maxLength: 2000
        }
      );

    const thumbnailUrl =
      normalizeText(
        input.thumbnailUrl,
        {
          nullable: true,
          maxLength: 2000
        }
      );


    /*
     * If the attachment belongs to a conversation,
     * owner must have access to it.
     */

    if (conversationId) {
      await requireConversationMembership(
        conversationId,
        ownerId
      );
    }


    /*
     * If a message is supplied, verify that it exists
     * and belongs to the same conversation.
     */

    if (messageId) {
      if (
        !messageRepository ||
        typeof messageRepository.findOne !==
          "function"
      ) {
        throw new AttachmentServiceError(
          "MESSAGE_REPOSITORY_NOT_CONFIGURED",
          "خدمة الرسائل غير مهيأة.",
          503
        );
      }

      const message =
        await messageRepository.findOne({
          where: {
            id:
              messageId
          }
        });

      if (!message) {
        throw new AttachmentServiceError(
          "MESSAGE_NOT_FOUND",
          "الرسالة غير موجودة.",
          404
        );
      }

      if (
        conversationId &&
        String(
          message.conversationId
        ) !== conversationId
      ) {
        throw new AttachmentServiceError(
          "MESSAGE_CONVERSATION_MISMATCH",
          "الرسالة لا تنتمي إلى المحادثة المحددة.",
          400
        );
      }

      await requireConversationMembership(
        message.conversationId,
        ownerId
      );
    }


    const now = clock();

    const attachmentData = {
      ownerId,

      conversationId,

      messageId,

      type,

      originalName,

      mimeType,

      size,

      storageKey,

      url,

      thumbnailUrl,

      status:
        input.status
          ? normalizeStatus(
              input.status
            )
          : ATTACHMENT_STATUS.READY,

      createdAt:
        now,

      updatedAt:
        now
    };


    const created =
      await attachmentRepository.create(
        attachmentData
      );

    if (!created) {
      throw new AttachmentServiceError(
        "ATTACHMENT_CREATE_FAILED",
        "تعذر إنشاء سجل المرفق.",
        500
      );
    }

    return sanitizeAttachment(
      created
    );
  }


  // ==========================================================
  // Create Pending Attachment
  // ==========================================================

  async function createPending(
    input = {},
    ownerUserId
  ) {
    return create(
      {
        ...input,

        status:
          ATTACHMENT_STATUS.PENDING
      },

      ownerUserId
    );
  }


  // ==========================================================
  // Update Status
  // ==========================================================

  async function updateStatus(
    attachmentId,
    status,
    actorUserId
  ) {
    requireAttachmentRepository();

    const attachment =
      await requireAccess(
        attachmentId,
        actorUserId
      );

    const normalizedStatus =
      normalizeStatus(
        status
      );

    const updated =
      await attachmentRepository.update(
        attachment.id,
        {
          status:
            normalizedStatus,

          updatedAt:
            clock()
        }
      );

    if (!updated) {
      throw new AttachmentServiceError(
        "ATTACHMENT_STATUS_UPDATE_FAILED",
        "تعذر تحديث حالة المرفق.",
        500
      );
    }

    return sanitizeAttachment(
      updated
    );
  }


  // ==========================================================
  // Mark Ready
  // ==========================================================

  async function markReady(
    attachmentId,
    actorUserId,
    metadata = {}
  ) {
    requireAttachmentRepository();

    const attachment =
      await requireAccess(
        attachmentId,
        actorUserId
      );

    const updateData = {
      status:
        ATTACHMENT_STATUS.READY,

      updatedAt:
        clock()
    };


    if (
      metadata.url
    ) {
      updateData.url =
        normalizeText(
          metadata.url,
          {
            maxLength: 2000
          }
        );
    }


    if (
      metadata.thumbnailUrl
    ) {
      updateData.thumbnailUrl =
        normalizeText(
          metadata.thumbnailUrl,
          {
            maxLength: 2000
          }
        );
    }


    if (
      metadata.width !== undefined
    ) {
      updateData.width =
        normalizePositiveNumber(
          metadata.width,
          "العرض"
        );
    }


    if (
      metadata.height !== undefined
    ) {
      updateData.height =
        normalizePositiveNumber(
          metadata.height,
          "الارتفاع"
        );
    }


    if (
      metadata.duration !== undefined
    ) {
      updateData.duration =
        normalizePositiveNumber(
          metadata.duration,
          "المدة"
        );
    }


    const updated =
      await attachmentRepository.update(
        attachment.id,
        updateData
      );

    if (!updated) {
      throw new AttachmentServiceError(
        "ATTACHMENT_READY_FAILED",
        "تعذر اعتماد المرفق.",
        500
      );
    }

    return sanitizeAttachment(
      updated
    );
  }


  // ==========================================================
  // Mark Failed
  // ==========================================================

  async function markFailed(
    attachmentId,
    actorUserId,
    reason = null
  ) {
    requireAttachmentRepository();

    const attachment =
      await requireAccess(
        attachmentId,
        actorUserId
      );

    const normalizedReason =
      reason
        ? normalizeText(
            reason,
            {
              maxLength: 500
            }
          )
        : null;

    const updated =
      await attachmentRepository.update(
        attachment.id,
        {
          status:
            ATTACHMENT_STATUS.FAILED,

          failureReason:
            normalizedReason,

          updatedAt:
            clock()
        }
      );

    if (!updated) {
      throw new AttachmentServiceError(
        "ATTACHMENT_FAILURE_UPDATE_FAILED",
        "تعذر تسجيل فشل المرفق.",
        500
      );
    }

    return sanitizeAttachment(
      updated
    );
  }


  // ==========================================================
  // Attach To Message
  // ==========================================================

  async function attachToMessage(
    attachmentId,
    messageId,
    actorUserId
  ) {
    requireAttachmentRepository();

    if (
      !messageRepository ||
      typeof messageRepository.findOne !==
        "function"
    ) {
      throw new AttachmentServiceError(
        "MESSAGE_REPOSITORY_NOT_CONFIGURED",
        "خدمة الرسائل غير مهيأة.",
        503
      );
    }

    const attachment =
      await requireAccess(
        attachmentId,
        actorUserId
      );

    const normalizedMessageId =
      normalizeId(
        messageId,
        "معرّف الرسالة"
      );

    const message =
      await messageRepository.findOne({
        where: {
          id:
            normalizedMessageId
        }
      });

    if (!message) {
      throw new AttachmentServiceError(
        "MESSAGE_NOT_FOUND",
        "الرسالة غير موجودة.",
        404
      );
    }

    if (
      attachment.conversationId &&
      String(
        attachment.conversationId
      ) !==
        String(
          message.conversationId
        )
    ) {
      throw new AttachmentServiceError(
        "ATTACHMENT_CONVERSATION_MISMATCH",
        "المرفق والرسالة لا ينتميان إلى نفس المحادثة.",
        400
      );
    }

    const updated =
      await attachmentRepository.update(
        attachment.id,
        {
          messageId:
            normalizedMessageId,

          conversationId:
            message.conversationId,

          updatedAt:
            clock()
        }
      );

    if (!updated) {
      throw new AttachmentServiceError(
        "ATTACHMENT_LINK_FAILED",
        "تعذر ربط المرفق بالرسالة.",
        500
      );
    }

    return sanitizeAttachment(
      updated
    );
  }


  // ==========================================================
  // List Conversation Attachments
  // ==========================================================

  async function listForConversation(
    conversationId,
    userId,
    options = {}
  ) {
    requireAttachmentRepository();

    const normalizedConversationId =
      normalizeId(
        conversationId,
        "معرّف المحادثة"
      );

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    await requireConversationMembership(
      normalizedConversationId,
      normalizedUserId
    );

    const limit =
      normalizeLimit(
        options.limit
      );

    const offset =
      normalizeOffset(
        options.offset
      );

    const where = {
      conversationId:
        normalizedConversationId
    };


    if (
      options.type
    ) {
      where.type =
        normalizeAttachmentType(
          options.type
        );
    }


    if (
      options.status
    ) {
      where.status =
        normalizeStatus(
          options.status
        );
    }


    const result =
      await attachmentRepository.findMany({
        where,

        limit,

        offset,

        sort: {
          createdAt: "desc"
        }
      });

    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];

    return {
      items:
        items.map(
          sanitizeAttachment
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // List User Attachments
  // ==========================================================

  async function listForUser(
    userId,
    options = {}
  ) {
    requireAttachmentRepository();

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const limit =
      normalizeLimit(
        options.limit
      );

    const offset =
      normalizeOffset(
        options.offset
      );

    const result =
      await attachmentRepository.findMany({
        where: {
          ownerId:
            normalizedUserId
        },

        limit,

        offset,

        sort: {
          createdAt: "desc"
        }
      });

    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];

    return {
      items:
        items.map(
          sanitizeAttachment
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Delete Attachment
  // ==========================================================

  async function remove(
    attachmentId,
    actorUserId,
    options = {}
  ) {
    requireAttachmentRepository();

    const actorId =
      normalizeId(
        actorUserId,
        "معرّف المستخدم"
      );

    const attachment =
      await getById(
        attachmentId
      );

    const isOwner =
      attachment.ownerId &&
      String(
        attachment.ownerId
      ) === actorId;


    let isConversationMember =
      false;

    if (
      !isOwner &&
      attachment.conversationId
    ) {
      const member =
        await getConversationMembership(
          attachment.conversationId,
          actorId
        );

      isConversationMember =
        Boolean(member);
    }


    let isAdmin =
      false;

    if (
      !isOwner &&
      isConversationMember &&
      options.allowAdminDelete
    ) {
      const member =
        await getConversationMembership(
          attachment.conversationId,
          actorId
        );

      isAdmin =
        member?.role === "admin" ||
        member?.role === "owner";
    }


    if (
      !isOwner &&
      !isAdmin
    ) {
      throw attachmentAccessDenied();
    }


    /*
     * Soft delete first.
     *
     * Physical storage deletion is optional and delegated
     * to the storage provider.
     */

    const updated =
      await attachmentRepository.update(
        attachment.id,
        {
          status:
            ATTACHMENT_STATUS.DELETED,

          deletedAt:
            clock(),

          deletedBy:
            actorId,

          updatedAt:
            clock()
        }
      );

    if (!updated) {
      throw new AttachmentServiceError(
        "ATTACHMENT_DELETE_FAILED",
        "تعذر حذف المرفق.",
        500
      );
    }


    /*
     * Storage cleanup is best-effort and provider-driven.
     * The database state remains the source of truth.
     */

    if (
      options.deletePhysical !== false &&
      storageProvider &&
      typeof storageProvider.delete ===
        "function" &&
      attachment.storageKey
    ) {
      try {
        await storageProvider.delete(
          attachment.storageKey
        );
      } catch (error) {
        /*
         * Do not undo the database deletion.
         * The provider can retry cleanup later.
         */
      }
    }


    return sanitizeAttachment(
      updated
    );
  }


  // ==========================================================
  // Generate Access URL
  // ==========================================================

  async function getAccessUrl(
    attachmentId,
    userId,
    options = {}
  ) {
    const attachment =
      await requireAccess(
        attachmentId,
        userId
      );

    if (
      attachment.status ===
      ATTACHMENT_STATUS.DELETED
    ) {
      throw new AttachmentServiceError(
        "ATTACHMENT_DELETED",
        "هذا المرفق تم حذفه.",
        404
      );
    }

    /*
     * If a public/resolved URL already exists,
     * return it without assuming storage capabilities.
     */

    if (
      attachment.url &&
      options.preferStoredUrl !== false
    ) {
      return {
        attachment:
          sanitizeAttachment(
            attachment
          ),

        url:
          attachment.url
      };
    }


    if (
      storageProvider &&
      typeof storageProvider.getAccessUrl ===
        "function"
    ) {
      const url =
        await storageProvider.getAccessUrl(
          attachment.storageKey,
          {
            expiresIn:
              options.expiresIn
          }
        );

      return {
        attachment:
          sanitizeAttachment(
            attachment
          ),

        url:
          url || null
      };
    }


    return {
      attachment:
        sanitizeAttachment(
          attachment
        ),

      url:
        null
    };
  }


  // ==========================================================
  // Find By Message
  // ==========================================================

  async function listForMessage(
    messageId,
    userId,
    options = {}
  ) {
    requireAttachmentRepository();

    if (
      !messageRepository ||
      typeof messageRepository.findOne !==
        "function"
    ) {
      throw new AttachmentServiceError(
        "MESSAGE_REPOSITORY_NOT_CONFIGURED",
        "خدمة الرسائل غير مهيأة.",
        503
      );
    }

    const normalizedMessageId =
      normalizeId(
        messageId,
        "معرّف الرسالة"
      );

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const message =
      await messageRepository.findOne({
        where: {
          id:
            normalizedMessageId
        }
      });

    if (!message) {
      throw new AttachmentServiceError(
        "MESSAGE_NOT_FOUND",
        "الرسالة غير موجودة.",
        404
      );
    }

    await requireConversationMembership(
      message.conversationId,
      normalizedUserId
    );

    const limit =
      normalizeLimit(
        options.limit
      );

    const offset =
      normalizeOffset(
        options.offset
      );

    const result =
      await attachmentRepository.findMany({
        where: {
          messageId:
            normalizedMessageId
        },

        limit,

        offset,

        sort: {
          createdAt: "asc"
        }
      });

    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];

    return {
      items:
        items.map(
          sanitizeAttachment
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {
    getById,

    canAccess,

    requireAccess,

    create,

    createPending,

    updateStatus,

    markReady,

    markFailed,

    attachToMessage,

    listForConversation,

    listForUser,

    listForMessage,

    remove,

    getAccessUrl,

    sanitizeAttachment
  };
}


// ============================================================
// Exports
// ============================================================

module.exports = {
  AttachmentServiceError,

  createAttachmentService,

  attachmentNotFound,

  attachmentRepositoryUnavailable,

  attachmentAccessDenied,

  normalizeId,

  normalizeText,

  normalizePositiveNumber,

  normalizeAttachmentType,

  normalizeStatus,

  normalizeLimit,

  normalizeOffset,

  sanitizeAttachment,

  ATTACHMENT_TYPES,

  ATTACHMENT_STATUS,

  VALID_ATTACHMENT_TYPES,

  VALID_ATTACHMENT_STATUS
};
