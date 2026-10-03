"use strict";

/**
 * NOVA — Conversation Service
 * =========================================================
 *
 * مسؤول عن منطق المحادثات:
 * - إنشاء المحادثة
 * - جلب المحادثة
 * - تحديث بياناتها
 * - إضافة المشاركين
 * - إزالة المشاركين
 * - مغادرة المحادثة
 * - تغيير دور المشارك
 * - كتم المحادثة
 * - تثبيت المحادثة
 * - التحقق من العضوية
 * - جلب محادثات المستخدم
 *
 * لا يتعامل مباشرة مع Express أو قاعدة البيانات.
 * يعتمد على repositories يتم حقنها من طبقة البيانات.
 *
 * لا توجد بيانات وهمية.
 */

class ConversationServiceError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);

    this.name = "ConversationServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}


// ============================================================
// Constants
// ============================================================

const CONVERSATION_TYPES = Object.freeze({
  DIRECT: "direct",
  GROUP: "group"
});

const CONVERSATION_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
  DISABLED: "disabled"
});

const MEMBER_STATUS = Object.freeze({
  ACTIVE: "active",
  LEFT: "left",
  REMOVED: "removed"
});

const MEMBER_ROLES = Object.freeze({
  MEMBER: "member",
  ADMIN: "admin",
  OWNER: "owner"
});

const VALID_CONVERSATION_TYPES = Object.freeze(
  Object.values(CONVERSATION_TYPES)
);

const VALID_CONVERSATION_STATUSES = Object.freeze(
  Object.values(CONVERSATION_STATUS)
);

const VALID_MEMBER_STATUSES = Object.freeze(
  Object.values(MEMBER_STATUS)
);

const VALID_MEMBER_ROLES = Object.freeze(
  Object.values(MEMBER_ROLES)
);


// ============================================================
// Errors
// ============================================================

function conversationNotFound() {
  return new ConversationServiceError(
    "CONVERSATION_NOT_FOUND",
    "المحادثة غير موجودة.",
    404
  );
}

function conversationRepositoryUnavailable() {
  return new ConversationServiceError(
    "CONVERSATION_REPOSITORY_NOT_CONFIGURED",
    "خدمة المحادثات غير مهيأة.",
    503
  );
}

function memberRepositoryUnavailable() {
  return new ConversationServiceError(
    "CONVERSATION_MEMBER_REPOSITORY_NOT_CONFIGURED",
    "خدمة أعضاء المحادثات غير مهيأة.",
    503
  );
}

function conversationAccessDenied() {
  return new ConversationServiceError(
    "CONVERSATION_ACCESS_DENIED",
    "لا تملك صلاحية الوصول إلى هذه المحادثة.",
    403
  );
}


// ============================================================
// Helpers
// ============================================================

function normalizeId(value, field = "المعرّف") {
  if (value === null || value === undefined) {
    throw new ConversationServiceError(
      "INVALID_ID",
      `${field} مطلوب.`,
      400
    );
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new ConversationServiceError(
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

    throw new ConversationServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (typeof value !== "string") {
    throw new ConversationServiceError(
      "INVALID_TEXT",
      "القيمة النصية غير صالحة.",
      400
    );
  }

  const normalized = value.trim();

  if (!nullable && !normalized) {
    throw new ConversationServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (normalized.length > maxLength) {
    throw new ConversationServiceError(
      "TEXT_TOO_LONG",
      "النص يتجاوز الحد المسموح.",
      400
    );
  }

  return normalized || null;
}


function normalizeEnum(value, allowed, field) {
  const normalized = normalizeText(value, {
    nullable: false,
    maxLength: 100
  });

  if (!allowed.includes(normalized)) {
    throw new ConversationServiceError(
      "INVALID_ENUM_VALUE",
      `${field} غير مدعوم.`,
      400
    );
  }

  return normalized;
}


function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === "false" || value === "0" || value === 0) {
    return false;
  }

  throw new ConversationServiceError(
    "INVALID_BOOLEAN",
    "القيمة المنطقية غير صالحة.",
    400
  );
}


function normalizeLimit(value, fallback = 50, maximum = 100) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    Math.max(Math.floor(parsed), 1),
    maximum
  );
}


function normalizeOffset(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(Math.floor(parsed), 0);
}


// ============================================================
// Sanitization
// ============================================================

const INTERNAL_FIELDS = Object.freeze([
  "internalNotes",
  "encryptionKey",
  "privateKey",
  "securityToken"
]);


function sanitizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") {
    return null;
  }

  const safe = {
    ...conversation
  };

  for (const field of INTERNAL_FIELDS) {
    delete safe[field];
  }

  return safe;
}


function sanitizeMember(member) {
  if (!member || typeof member !== "object") {
    return null;
  }

  const safe = {
    ...member
  };

  for (const field of INTERNAL_FIELDS) {
    delete safe[field];
  }

  return safe;
}


// ============================================================
// Service Factory
// ============================================================

function createConversationService(dependencies = {}) {
  const {
    conversationRepository = null,
    memberRepository = null,
    userRepository = null,
    realtimeService = null,
    clock = () => new Date()
  } = dependencies;


  // ==========================================================
  // Repository Requirements
  // ==========================================================

  function requireConversationRepository() {
    if (
      !conversationRepository ||
      typeof conversationRepository.findOne !== "function"
    ) {
      throw conversationRepositoryUnavailable();
    }
  }


  function requireMemberRepository() {
    if (
      !memberRepository ||
      typeof memberRepository.findOne !== "function"
    ) {
      throw memberRepositoryUnavailable();
    }
  }


  // ==========================================================
  // Get Conversation
  // ==========================================================

  async function getById(
    conversationId,
    options = {}
  ) {
    requireConversationRepository();

    const id = normalizeId(
      conversationId,
      "معرّف المحادثة"
    );

    const conversation =
      await conversationRepository.findOne({
        where: {
          id
        }
      });

    if (!conversation) {
      if (options.required === false) {
        return null;
      }

      throw conversationNotFound();
    }

    return sanitizeConversation(conversation);
  }


  // ==========================================================
  // Get Member
  // ==========================================================

  async function getMember(
    conversationId,
    userId
  ) {
    requireMemberRepository();

    const conversationIdValue =
      normalizeId(
        conversationId,
        "معرّف المحادثة"
      );

    const userIdValue =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const member =
      await memberRepository.findOne({
        where: {
          conversationId:
            conversationIdValue,

          userId:
            userIdValue
        }
      });

    return member
      ? sanitizeMember(member)
      : null;
  }


  async function requireMember(
    conversationId,
    userId
  ) {
    const member =
      await getMember(
        conversationId,
        userId
      );

    if (!member) {
      throw conversationAccessDenied();
    }

    if (
      member.status &&
      member.status !== MEMBER_STATUS.ACTIVE
    ) {
      throw new ConversationServiceError(
        "CONVERSATION_MEMBERSHIP_INACTIVE",
        "عضويتك في المحادثة غير نشطة.",
        403
      );
    }

    return member;
  }


  // ==========================================================
  // Role Helpers
  // ==========================================================

  function isOwner(member) {
    return Boolean(
      member &&
      member.role === MEMBER_ROLES.OWNER
    );
  }


  function isAdmin(member) {
    return Boolean(
      member &&
      (
        member.role === MEMBER_ROLES.ADMIN ||
        member.role === MEMBER_ROLES.OWNER
      )
    );
  }


  async function requireAdmin(
    conversationId,
    userId
  ) {
    const member =
      await requireMember(
        conversationId,
        userId
      );

    if (!isAdmin(member)) {
      throw new ConversationServiceError(
        "CONVERSATION_ADMIN_REQUIRED",
        "تحتاج إلى صلاحيات إدارية لتنفيذ هذا الإجراء.",
        403
      );
    }

    return member;
  }


  async function requireOwner(
    conversationId,
    userId
  ) {
    const member =
      await requireMember(
        conversationId,
        userId
      );

    if (!isOwner(member)) {
      throw new ConversationServiceError(
        "CONVERSATION_OWNER_REQUIRED",
        "هذا الإجراء متاح لمالك المحادثة فقط.",
        403
      );
    }

    return member;
  }


  // ==========================================================
  // Create Conversation
  // ==========================================================

  async function create(
    input = {},
    creatorUserId
  ) {
    requireConversationRepository();
    requireMemberRepository();

    const creatorId =
      normalizeId(
        creatorUserId,
        "معرّف المنشئ"
      );

    const type =
      normalizeEnum(
        input.type ||
          CONVERSATION_TYPES.DIRECT,
        VALID_CONVERSATION_TYPES,
        "نوع المحادثة"
      );

    let participantIds =
      Array.isArray(input.participantIds)
        ? input.participantIds
        : [];


    participantIds = [
      creatorId,
      ...participantIds.map(
        id =>
          normalizeId(
            id,
            "معرّف المستخدم"
          )
      )
    ];


    participantIds = [
      ...new Set(
        participantIds.map(
          id => String(id)
        )
      )
    ];


    if (
      type === CONVERSATION_TYPES.DIRECT &&
      participantIds.length !== 2
    ) {
      throw new ConversationServiceError(
        "DIRECT_CONVERSATION_REQUIRES_TWO_USERS",
        "المحادثة المباشرة يجب أن تحتوي على مستخدمين اثنين.",
        400
      );
    }


    if (
      type === CONVERSATION_TYPES.GROUP &&
      participantIds.length < 2
    ) {
      throw new ConversationServiceError(
        "GROUP_CONVERSATION_REQUIRES_MEMBERS",
        "محادثة المجموعة تحتاج إلى أكثر من مستخدم.",
        400
      );
    }


    if (
      userRepository &&
      typeof userRepository.findOne === "function"
    ) {
      for (const userId of participantIds) {
        const user =
          await userRepository.findOne({
            where: {
              id:
                userId
            }
          });

        if (!user) {
          throw new ConversationServiceError(
            "USER_NOT_FOUND",
            "أحد المشاركين غير موجود.",
            404
          );
        }
      }
    }


    const now =
      clock();


    const conversationData = {
      type,

      status:
        CONVERSATION_STATUS.ACTIVE,

      title:
        normalizeText(
          input.title,
          {
            nullable: true,
            maxLength: 120
          }
        ),

      createdBy:
        creatorId,

      createdAt:
        now,

      updatedAt:
        now
    };


    const conversation =
      await conversationRepository.create(
        conversationData
      );


    if (!conversation) {
      throw new ConversationServiceError(
        "CONVERSATION_CREATE_FAILED",
        "تعذر إنشاء المحادثة.",
        500
      );
    }


    const members = [];


    for (
      const participantId of participantIds
    ) {
      const member =
        await memberRepository.create({
          conversationId:
            conversation.id,

          userId:
            participantId,

          role:
            String(participantId) ===
            String(creatorId)
              ? MEMBER_ROLES.OWNER
              : MEMBER_ROLES.MEMBER,

          status:
            MEMBER_STATUS.ACTIVE,

          joinedAt:
            now,

          createdAt:
            now,

          updatedAt:
            now
        });


      if (!member) {
        throw new ConversationServiceError(
          "CONVERSATION_MEMBER_CREATE_FAILED",
          "تعذر إنشاء أحد أعضاء المحادثة.",
          500
        );
      }

      members.push(
        sanitizeMember(member)
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitConversationEvent ===
        "function"
    ) {
      await realtimeService.emitConversationEvent(
        "conversation.created",
        {
          conversation:
            sanitizeConversation(
              conversation
            ),

          members
        }
      );
    }


    return {
      conversation:
        sanitizeConversation(
          conversation
        ),

      members
    };
  }


  // ==========================================================
  // Update Conversation
  // ==========================================================

  async function update(
    conversationId,
    changes,
    actorUserId
  ) {
    requireConversationRepository();

    const conversation =
      await getById(
        conversationId
      );

    await requireAdmin(
      conversation.id,
      actorUserId
    );


    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new ConversationServiceError(
        "INVALID_CONVERSATION_UPDATE",
        "بيانات التحديث غير صالحة.",
        400
      );
    }


    const updateData = {};


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "title"
      )
    ) {
      updateData.title =
        normalizeText(
          changes.title,
          {
            nullable: true,
            maxLength: 120
          }
        );
    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "status"
      )
    ) {
      updateData.status =
        normalizeEnum(
          changes.status,
          VALID_CONVERSATION_STATUSES,
          "حالة المحادثة"
        );
    }


    if (
      Object.keys(updateData).length === 0
    ) {
      throw new ConversationServiceError(
        "NO_UPDATE_FIELDS",
        "لم يتم إرسال بيانات للتحديث.",
        400
      );
    }


    updateData.updatedAt =
      clock();


    const updated =
      await conversationRepository.update(
        conversation.id,
        updateData
      );


    if (!updated) {
      throw new ConversationServiceError(
        "CONVERSATION_UPDATE_FAILED",
        "تعذر تحديث المحادثة.",
        500
      );
    }


    return sanitizeConversation(
      updated
    );
  }


  // ==========================================================
  // Add Member
  // ==========================================================

  async function addMember(
    conversationId,
    targetUserId,
    actorUserId,
    options = {}
  ) {
    requireMemberRepository();

    const conversation =
      await getById(
        conversationId
      );

    await requireAdmin(
      conversation.id,
      actorUserId
    );


    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );


    if (
      userRepository &&
      typeof userRepository.findOne === "function"
    ) {
      const user =
        await userRepository.findOne({
          where: {
            id:
              targetId
          }
        });

      if (!user) {
        throw new ConversationServiceError(
          "USER_NOT_FOUND",
          "المستخدم غير موجود.",
          404
        );
      }
    }


    const existing =
      await memberRepository.findOne({
        where: {
          conversationId:
            conversation.id,

          userId:
            targetId
        }
      });


    if (existing) {
      if (
        existing.status ===
        MEMBER_STATUS.ACTIVE
      ) {
        throw new ConversationServiceError(
          "ALREADY_MEMBER",
          "المستخدم عضو بالفعل في المحادثة.",
          409
        );
      }


      const restored =
        await memberRepository.update(
          existing.id,
          {
            status:
              MEMBER_STATUS.ACTIVE,

            joinedAt:
              clock(),

            leftAt:
              null,

            updatedAt:
              clock()
          }
        );

      return sanitizeMember(
        restored
      );
    }


    const role =
      options.role
        ? normalizeEnum(
            options.role,
            VALID_MEMBER_ROLES,
            "دور العضو"
          )
        : MEMBER_ROLES.MEMBER;


    if (
      role === MEMBER_ROLES.OWNER
    ) {
      throw new ConversationServiceError(
        "OWNER_ROLE_RESTRICTED",
        "لا يمكن إضافة مستخدم بدور مالك.",
        400
      );
    }


    const now =
      clock();


    const member =
      await memberRepository.create({
        conversationId:
          conversation.id,

        userId:
          targetId,

        role,

        status:
          MEMBER_STATUS.ACTIVE,

        joinedAt:
          now,

        createdAt:
          now,

        updatedAt:
          now
      });


    if (!member) {
      throw new ConversationServiceError(
        "ADD_MEMBER_FAILED",
        "تعذر إضافة العضو.",
        500
      );
    }


    return sanitizeMember(
      member
    );
  }


  // ==========================================================
  // Remove Member
  // ==========================================================

  async function removeMember(
    conversationId,
    targetUserId,
    actorUserId
  ) {
    requireMemberRepository();

    const conversation =
      await getById(
        conversationId
      );

    const actor =
      await requireMember(
        conversation.id,
        actorUserId
      );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );


    const target =
      await memberRepository.findOne({
        where: {
          conversationId:
            conversation.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new ConversationServiceError(
        "MEMBER_NOT_FOUND",
        "العضو غير موجود.",
        404
      );
    }


    const selfRemoval =
      String(actorUserId) ===
      String(targetUserId);


    if (!selfRemoval) {
      if (!isAdmin(actor)) {
        throw new ConversationServiceError(
          "CONVERSATION_ADMIN_REQUIRED",
          "تحتاج إلى صلاحيات إدارية لإزالة عضو.",
          403
        );
      }


      if (
        target.role ===
        MEMBER_ROLES.OWNER
      ) {
        throw new ConversationServiceError(
          "OWNER_REMOVAL_FORBIDDEN",
          "لا يمكن إزالة مالك المحادثة.",
          403
        );
      }


      if (
        target.role === MEMBER_ROLES.ADMIN &&
        actor.role !== MEMBER_ROLES.OWNER
      ) {
        throw new ConversationServiceError(
          "ADMIN_REMOVAL_FORBIDDEN",
          "لا يمكنك إزالة مسؤول المحادثة.",
          403
        );
      }
    }


    const updated =
      await memberRepository.update(
        target.id,
        {
          status:
            selfRemoval
              ? MEMBER_STATUS.LEFT
              : MEMBER_STATUS.REMOVED,

          leftAt:
            clock(),

          removedBy:
            selfRemoval
              ? null
              : normalizeId(
                  actorUserId,
                  "معرّف المنفذ"
                ),

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new ConversationServiceError(
        "REMOVE_MEMBER_FAILED",
        "تعذر إزالة العضو.",
        500
      );
    }


    return sanitizeMember(
      updated
    );
  }


  // ==========================================================
  // Leave Conversation
  // ==========================================================

  async function leave(
    conversationId,
    userId
  ) {
    return removeMember(
      conversationId,
      userId,
      userId
    );
  }


  // ==========================================================
  // Update Member Role
  // ==========================================================

  async function updateMemberRole(
    conversationId,
    targetUserId,
    actorUserId,
    role
  ) {
    requireMemberRepository();

    const conversation =
      await getById(
        conversationId
      );

    await requireOwner(
      conversation.id,
      actorUserId
    );


    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );


    const target =
      await memberRepository.findOne({
        where: {
          conversationId:
            conversation.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new ConversationServiceError(
        "MEMBER_NOT_FOUND",
        "العضو غير موجود.",
        404
      );
    }


    const normalizedRole =
      normalizeEnum(
        role,
        VALID_MEMBER_ROLES,
        "دور العضو"
      );


    if (
      normalizedRole ===
      MEMBER_ROLES.OWNER
    ) {
      throw new ConversationServiceError(
        "OWNER_TRANSFER_REQUIRED",
        "استخدم إجراء نقل الملكية.",
        400
      );
    }


    if (
      target.role ===
      MEMBER_ROLES.OWNER
    ) {
      throw new ConversationServiceError(
        "OWNER_ROLE_PROTECTED",
        "لا يمكن تغيير دور مالك المحادثة بهذه الطريقة.",
        400
      );
    }


    const updated =
      await memberRepository.update(
        target.id,
        {
          role:
            normalizedRole,

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new ConversationServiceError(
        "ROLE_UPDATE_FAILED",
        "تعذر تحديث دور العضو.",
        500
      );
    }


    return sanitizeMember(
      updated
    );
  }


  // ==========================================================
  // Mute Conversation
  // ==========================================================

  async function setMuted(
    conversationId,
    userId,
    muted
  ) {
    requireMemberRepository();

    const member =
      await requireMember(
        conversationId,
        userId
      );


    const isMuted =
      normalizeBoolean(
        muted
      );


    const updated =
      await memberRepository.update(
        member.id,
        {
          muted:
            isMuted,

          mutedAt:
            isMuted
              ? clock()
              : null,

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new ConversationServiceError(
        "MUTE_UPDATE_FAILED",
        "تعذر تحديث حالة كتم المحادثة.",
        500
      );
    }


    return sanitizeMember(
      updated
    );
  }


  // ==========================================================
  // Pin Conversation
  // ==========================================================

  async function setPinned(
    conversationId,
    userId,
    pinned
  ) {
    requireMemberRepository();

    const member =
      await requireMember(
        conversationId,
        userId
      );


    const isPinned =
      normalizeBoolean(
        pinned
      );


    const updated =
      await memberRepository.update(
        member.id,
        {
          pinned:
            isPinned,

          pinnedAt:
            isPinned
              ? clock()
              : null,

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new ConversationServiceError(
        "PIN_UPDATE_FAILED",
        "تعذر تحديث تثبيت المحادثة.",
        500
      );
    }


    return sanitizeMember(
      updated
    );
  }


  // ==========================================================
  // List Members
  // ==========================================================

  async function listMembers(
    conversationId,
    actorUserId,
    options = {}
  ) {
    requireMemberRepository();

    const conversation =
      await getById(
        conversationId
      );

    await requireMember(
      conversation.id,
      actorUserId
    );


    const limit =
      normalizeLimit(
        options.limit,
        100,
        200
      );

    const offset =
      normalizeOffset(
        options.offset
      );


    const where = {
      conversationId:
        conversation.id
    };


    if (options.status) {
      where.status =
        normalizeEnum(
          options.status,
          VALID_MEMBER_STATUSES,
          "حالة العضو"
        );
    }


    const result =
      await memberRepository.findMany({
        where,

        limit,

        offset,

        sort: {
          joinedAt: "asc"
        }
      });


    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return {
      items:
        items.map(
          sanitizeMember
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // List User Conversations
  // ==========================================================

  async function listForUser(
    userId,
    options = {}
  ) {
    requireMemberRepository();

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


    if (
      typeof memberRepository.query !==
      "function"
    ) {
      throw new ConversationServiceError(
        "CONVERSATION_LIST_UNAVAILABLE",
        "قائمة المحادثات غير مهيأة.",
        503
      );
    }


    const result =
      await memberRepository.query({
        type:
          "listConversationsForUser",

        userId:
          normalizedUserId,

        status:
          options.status ||
          MEMBER_STATUS.ACTIVE,

        conversationType:
          options.type ||
          null,

        limit,

        offset
      });


    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return {
      items:
        items.map(
          sanitizeConversation
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Archive
  // ==========================================================

  async function archive(
    conversationId,
    actorUserId
  ) {
    return update(
      conversationId,
      {
        status:
          CONVERSATION_STATUS.ARCHIVED
      },
      actorUserId
    );
  }


  // ==========================================================
  // Restore
  // ==========================================================

  async function restore(
    conversationId,
    actorUserId
  ) {
    return update(
      conversationId,
      {
        status:
          CONVERSATION_STATUS.ACTIVE
      },
      actorUserId
    );
  }


  // ==========================================================
  // Disable
  // ==========================================================

  async function disable(
    conversationId,
    actorUserId
  ) {
    await requireOwner(
      conversationId,
      actorUserId
    );

    return update(
      conversationId,
      {
        status:
          CONVERSATION_STATUS.DISABLED
      },
      actorUserId
    );
  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {
    getById,

    getMember,

    requireMember,

    isOwner,

    isAdmin,

    requireAdmin,

    requireOwner,

    create,

    update,

    addMember,

    removeMember,

    leave,

    updateMemberRole,

    setMuted,

    setPinned,

    listMembers,

    listForUser,

    archive,

    restore,

    disable,

    sanitizeConversation,

    sanitizeMember
  };
}


// ============================================================
// Exports
// ============================================================

module.exports = {
  ConversationServiceError,

  createConversationService,

  conversationNotFound,

  conversationRepositoryUnavailable,

  memberRepositoryUnavailable,

  conversationAccessDenied,

  normalizeId,

  normalizeText,

  normalizeEnum,

  normalizeBoolean,

  normalizeLimit,

  normalizeOffset,

  sanitizeConversation,

  sanitizeMember,

  CONVERSATION_TYPES,

  CONVERSATION_STATUS,

  MEMBER_STATUS,

  MEMBER_ROLES,

  VALID_CONVERSATION_TYPES,

  VALID_CONVERSATION_STATUSES,

  VALID_MEMBER_STATUSES,

  VALID_MEMBER_ROLES
};
