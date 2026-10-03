"use strict";

/**
 * NOVA — Group Service
 * =========================================================
 *
 * مسؤول عن منطق المجموعات:
 * - إنشاء المجموعة
 * - جلب المجموعة
 * - تعديل بيانات المجموعة
 * - إضافة الأعضاء
 * - إزالة الأعضاء
 * - الانضمام والمغادرة
 * - إدارة الأدوار
 * - نقل الملكية
 * - حظر/فك حظر العضو
 * - قوائم الأعضاء
 *
 * لا يتعامل مباشرة مع Express أو قاعدة البيانات.
 * يعتمد بالكامل على Repositories يتم حقنها.
 *
 * لا توجد بيانات وهمية.
 */

class GroupServiceError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = "GroupServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}


// ============================================================
// Constants
// ============================================================

const GROUP_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
  DISABLED: "disabled"
});

const GROUP_MEMBER_STATUS = Object.freeze({
  ACTIVE: "active",
  BANNED: "banned",
  LEFT: "left"
});

const GROUP_MEMBER_ROLES = Object.freeze({
  MEMBER: "member",
  MODERATOR: "moderator",
  ADMIN: "admin",
  OWNER: "owner"
});

const GROUP_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private"
});

const VALID_GROUP_STATUSES = Object.freeze(
  Object.values(GROUP_STATUS)
);

const VALID_MEMBER_STATUSES = Object.freeze(
  Object.values(GROUP_MEMBER_STATUS)
);

const VALID_MEMBER_ROLES = Object.freeze(
  Object.values(GROUP_MEMBER_ROLES)
);

const VALID_VISIBILITY = Object.freeze(
  Object.values(GROUP_VISIBILITY)
);


// ============================================================
// Errors
// ============================================================

function groupNotFound() {
  return new GroupServiceError(
    "GROUP_NOT_FOUND",
    "المجموعة غير موجودة.",
    404
  );
}

function groupRepositoryUnavailable() {
  return new GroupServiceError(
    "GROUP_REPOSITORY_NOT_CONFIGURED",
    "خدمة المجموعات غير مهيأة.",
    503
  );
}

function groupMemberRepositoryUnavailable() {
  return new GroupServiceError(
    "GROUP_MEMBER_REPOSITORY_NOT_CONFIGURED",
    "خدمة أعضاء المجموعات غير مهيأة.",
    503
  );
}

function groupMembershipRequired() {
  return new GroupServiceError(
    "GROUP_MEMBERSHIP_REQUIRED",
    "يجب أن تكون عضوًا في المجموعة.",
    403
  );
}


// ============================================================
// Helpers
// ============================================================

function normalizeId(value, field = "المعرّف") {
  if (value === null || value === undefined) {
    throw new GroupServiceError(
      "INVALID_ID",
      `${field} مطلوب.`,
      400
    );
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new GroupServiceError(
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

    throw new GroupServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (typeof value !== "string") {
    throw new GroupServiceError(
      "INVALID_TEXT",
      "القيمة النصية غير صالحة.",
      400
    );
  }

  const normalized = value.trim();

  if (!nullable && !normalized) {
    throw new GroupServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (normalized.length > maxLength) {
    throw new GroupServiceError(
      "TEXT_TOO_LONG",
      "النص يتجاوز الحد المسموح.",
      400
    );
  }

  return normalized || null;
}


function normalizeEnum(
  value,
  allowed,
  field
) {
  const normalized = normalizeText(
    value,
    {
      nullable: false,
      maxLength: 50
    }
  );

  if (!allowed.includes(normalized)) {
    throw new GroupServiceError(
      "INVALID_ENUM_VALUE",
      `${field} غير مدعوم.`,
      400
    );
  }

  return normalized;
}


function normalizeLimit(
  value,
  fallback = 50,
  maximum = 100
) {
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

  return Math.max(
    Math.floor(parsed),
    0
  );
}


// ============================================================
// Sanitization
// ============================================================

const INTERNAL_FIELDS = Object.freeze([
  "secret",
  "privateKey",
  "securityToken",
  "internalNotes"
]);


function sanitizeGroup(group) {
  if (!group || typeof group !== "object") {
    return null;
  }

  const safe = {
    ...group
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

function createGroupService(
  dependencies = {}
) {
  const {
    groupRepository = null,
    groupMemberRepository = null,
    userRepository = null,
    clock = () => new Date()
  } = dependencies;


  // ==========================================================
  // Repository Requirements
  // ==========================================================

  function requireGroupRepository() {
    if (
      !groupRepository ||
      typeof groupRepository.findOne !== "function"
    ) {
      throw groupRepositoryUnavailable();
    }
  }


  function requireMemberRepository() {
    if (
      !groupMemberRepository ||
      typeof groupMemberRepository.findOne !== "function"
    ) {
      throw groupMemberRepositoryUnavailable();
    }
  }


  // ==========================================================
  // Get Group
  // ==========================================================

  async function getById(
    groupId,
    options = {}
  ) {
    requireGroupRepository();

    const id = normalizeId(
      groupId,
      "معرّف المجموعة"
    );

    const group =
      await groupRepository.findOne({
        where: {
          id
        }
      });

    if (!group) {
      if (options.required === false) {
        return null;
      }

      throw groupNotFound();
    }

    return sanitizeGroup(group);
  }


  // ==========================================================
  // Membership
  // ==========================================================

  async function getMembership(
    groupId,
    userId
  ) {
    requireMemberRepository();

    const normalizedGroupId =
      normalizeId(
        groupId,
        "معرّف المجموعة"
      );

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const member =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            normalizedGroupId,

          userId:
            normalizedUserId
        }
      });

    return member
      ? sanitizeMember(member)
      : null;
  }


  async function requireMembership(
    groupId,
    userId
  ) {
    const member =
      await getMembership(
        groupId,
        userId
      );

    if (!member) {
      throw groupMembershipRequired();
    }

    if (
      member.status &&
      member.status !==
        GROUP_MEMBER_STATUS.ACTIVE
    ) {
      throw new GroupServiceError(
        "GROUP_MEMBERSHIP_INACTIVE",
        "عضويتك في المجموعة غير نشطة.",
        403
      );
    }

    return member;
  }


  // ==========================================================
  // Role Helpers
  // ==========================================================

  function hasRole(
    member,
    roles
  ) {
    if (!member) {
      return false;
    }

    const allowed =
      Array.isArray(roles)
        ? roles
        : [roles];

    return allowed.includes(
      member.role
    );
  }


  function isAdmin(member) {
    return hasRole(
      member,
      [
        GROUP_MEMBER_ROLES.ADMIN,
        GROUP_MEMBER_ROLES.OWNER
      ]
    );
  }


  function isModerator(member) {
    return hasRole(
      member,
      [
        GROUP_MEMBER_ROLES.MODERATOR,
        GROUP_MEMBER_ROLES.ADMIN,
        GROUP_MEMBER_ROLES.OWNER
      ]
    );
  }


  function isOwner(member) {
    return hasRole(
      member,
      GROUP_MEMBER_ROLES.OWNER
    );
  }


  async function requireModerator(
    groupId,
    userId
  ) {
    const member =
      await requireMembership(
        groupId,
        userId
      );

    if (!isModerator(member)) {
      throw new GroupServiceError(
        "GROUP_MODERATOR_REQUIRED",
        "تحتاج إلى صلاحيات إشرافية لتنفيذ هذا الإجراء.",
        403
      );
    }

    return member;
  }


  async function requireAdmin(
    groupId,
    userId
  ) {
    const member =
      await requireMembership(
        groupId,
        userId
      );

    if (!isAdmin(member)) {
      throw new GroupServiceError(
        "GROUP_ADMIN_REQUIRED",
        "تحتاج إلى صلاحيات إدارية لتنفيذ هذا الإجراء.",
        403
      );
    }

    return member;
  }


  async function requireOwner(
    groupId,
    userId
  ) {
    const member =
      await requireMembership(
        groupId,
        userId
      );

    if (!isOwner(member)) {
      throw new GroupServiceError(
        "GROUP_OWNER_REQUIRED",
        "هذا الإجراء متاح لمالك المجموعة فقط.",
        403
      );
    }

    return member;
  }


  // ==========================================================
  // Create Group
  // ==========================================================

  async function create(
    input = {},
    ownerUserId
  ) {
    requireGroupRepository();
    requireMemberRepository();

    const ownerId =
      normalizeId(
        ownerUserId,
        "معرّف مالك المجموعة"
      );

    const name =
      normalizeText(
        input.name,
        {
          nullable: false,
          maxLength: 120
        }
      );

    const description =
      normalizeText(
        input.description,
        {
          nullable: true,
          maxLength: 2000
        }
      );

    const visibility =
      normalizeEnum(
        input.visibility ||
          GROUP_VISIBILITY.PUBLIC,

        VALID_VISIBILITY,

        "خصوصية المجموعة"
      );


    if (
      userRepository &&
      typeof userRepository.findOne ===
        "function"
    ) {
      const owner =
        await userRepository.findOne({
          where: {
            id:
              ownerId
          }
        });

      if (!owner) {
        throw new GroupServiceError(
          "OWNER_USER_NOT_FOUND",
          "مالك المجموعة غير موجود.",
          404
        );
      }
    }


    const now = clock();

    const groupData = {
      name,

      description,

      visibility,

      status:
        GROUP_STATUS.ACTIVE,

      createdBy:
        ownerId,

      createdAt:
        now,

      updatedAt:
        now
    };


    const group =
      await groupRepository.create(
        groupData
      );

    if (!group) {
      throw new GroupServiceError(
        "GROUP_CREATE_FAILED",
        "تعذر إنشاء المجموعة.",
        500
      );
    }


    const ownerMember =
      await groupMemberRepository.create({
        groupId:
          group.id,

        userId:
          ownerId,

        role:
          GROUP_MEMBER_ROLES.OWNER,

        status:
          GROUP_MEMBER_STATUS.ACTIVE,

        joinedAt:
          now,

        createdAt:
          now,

        updatedAt:
          now
      });


    if (!ownerMember) {
      throw new GroupServiceError(
        "GROUP_OWNER_MEMBER_CREATE_FAILED",
        "تعذر إنشاء عضوية مالك المجموعة.",
        500
      );
    }


    return {
      group:
        sanitizeGroup(group),

      owner:
        sanitizeMember(
          ownerMember
        )
    };
  }


  // ==========================================================
  // Update Group
  // ==========================================================

  async function update(
    groupId,
    changes,
    actorUserId
  ) {
    requireGroupRepository();

    const group =
      await getById(
        groupId
      );

    await requireAdmin(
      group.id,
      actorUserId
    );

    if (
      !changes ||
      typeof changes !== "object"
    ) {
      throw new GroupServiceError(
        "INVALID_GROUP_UPDATE",
        "بيانات التحديث غير صالحة.",
        400
      );
    }

    const updateData = {};


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "name"
      )
    ) {
      updateData.name =
        normalizeText(
          changes.name,
          {
            nullable: false,
            maxLength: 120
          }
        );
    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "description"
      )
    ) {
      updateData.description =
        normalizeText(
          changes.description,
          {
            maxLength: 2000
          }
        );
    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "visibility"
      )
    ) {
      updateData.visibility =
        normalizeEnum(
          changes.visibility,
          VALID_VISIBILITY,
          "خصوصية المجموعة"
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
          VALID_GROUP_STATUSES,
          "حالة المجموعة"
        );
    }


    if (
      Object.keys(updateData).length === 0
    ) {
      throw new GroupServiceError(
        "NO_UPDATE_FIELDS",
        "لم يتم إرسال بيانات للتحديث.",
        400
      );
    }


    updateData.updatedAt =
      clock();


    const updated =
      await groupRepository.update(
        group.id,
        updateData
      );

    if (!updated) {
      throw new GroupServiceError(
        "GROUP_UPDATE_FAILED",
        "تعذر تحديث المجموعة.",
        500
      );
    }

    return sanitizeGroup(
      updated
    );
  }


  // ==========================================================
  // Add Member
  // ==========================================================

  async function addMember(
    groupId,
    targetUserId,
    actorUserId,
    options = {}
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    const actorId =
      normalizeId(
        actorUserId,
        "معرّف المنفذ"
      );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );

    const actor =
      await requireAdmin(
        group.id,
        actorId
      );


    if (
      userRepository &&
      typeof userRepository.findOne ===
        "function"
    ) {
      const user =
        await userRepository.findOne({
          where: {
            id:
              targetId
          }
        });

      if (!user) {
        throw new GroupServiceError(
          "TARGET_USER_NOT_FOUND",
          "المستخدم المطلوب غير موجود.",
          404
        );
      }
    }


    const existing =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            targetId
        }
      });


    if (existing) {
      if (
        existing.status ===
        GROUP_MEMBER_STATUS.BANNED
      ) {
        throw new GroupServiceError(
          "USER_BANNED",
          "هذا المستخدم محظور من المجموعة.",
          403
        );
      }

      throw new GroupServiceError(
        "MEMBER_ALREADY_EXISTS",
        "المستخدم عضو بالفعل في المجموعة.",
        409
      );
    }


    const role =
      options.role
        ? normalizeEnum(
            options.role,
            VALID_MEMBER_ROLES,
            "دور العضو"
          )
        : GROUP_MEMBER_ROLES.MEMBER;


    if (
      role ===
        GROUP_MEMBER_ROLES.OWNER &&
      !isOwner(actor)
    ) {
      throw new GroupServiceError(
        "OWNER_ROLE_REQUIRES_OWNER",
        "لا يمكن منح الملكية إلا من المالك الحالي.",
        403
      );
    }


    const now = clock();

    const created =
      await groupMemberRepository.create({
        groupId:
          group.id,

        userId:
          targetId,

        role,

        status:
          GROUP_MEMBER_STATUS.ACTIVE,

        joinedAt:
          now,

        createdAt:
          now,

        updatedAt:
          now
      });


    if (!created) {
      throw new GroupServiceError(
        "ADD_MEMBER_FAILED",
        "تعذر إضافة العضو.",
        500
      );
    }

    return sanitizeMember(
      created
    );
  }


  // ==========================================================
  // Remove Member
  // ==========================================================

  async function removeMember(
    groupId,
    targetUserId,
    actorUserId
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    const actorId =
      normalizeId(
        actorUserId,
        "معرّف المنفذ"
      );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );

    const actor =
      await requireMembership(
        group.id,
        actorId
      );

    const target =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new GroupServiceError(
        "MEMBER_NOT_FOUND",
        "العضو غير موجود.",
        404
      );
    }


    const selfRemoval =
      actorId === targetId;


    if (!selfRemoval) {
      if (!isModerator(actor)) {
        throw new GroupServiceError(
          "GROUP_MODERATOR_REQUIRED",
          "تحتاج إلى صلاحيات إشرافية لإزالة عضو.",
          403
        );
      }

      /*
       * Moderator cannot remove admin/owner.
       * Admin cannot remove owner.
       */

      if (
        target.role ===
        GROUP_MEMBER_ROLES.OWNER
      ) {
        throw new GroupServiceError(
          "OWNER_REMOVAL_FORBIDDEN",
          "لا يمكن إزالة مالك المجموعة.",
          403
        );
      }

      if (
        target.role ===
          GROUP_MEMBER_ROLES.ADMIN &&
        actor.role !==
          GROUP_MEMBER_ROLES.ADMIN &&
        actor.role !==
          GROUP_MEMBER_ROLES.OWNER
      ) {
        throw new GroupServiceError(
          "ADMIN_REMOVAL_FORBIDDEN",
          "لا يمكنك إزالة مسؤول أعلى منك.",
          403
        );
      }
    }


    const updated =
      await groupMemberRepository.update(
        target.id,
        {
          status:
            GROUP_MEMBER_STATUS.LEFT,

          leftAt:
            clock(),

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new GroupServiceError(
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
  // Leave Group
  // ==========================================================

  async function leave(
    groupId,
    userId
  ) {
    return removeMember(
      groupId,
      userId,
      userId
    );
  }


  // ==========================================================
  // Update Member Role
  // ==========================================================

  async function updateMemberRole(
    groupId,
    targetUserId,
    actorUserId,
    role
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    const actor =
      await requireOwner(
        group.id,
        actorUserId
      );

    const target =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            normalizeId(
              targetUserId,
              "معرّف المستخدم"
            )
        }
      });


    if (!target) {
      throw new GroupServiceError(
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
      target.role ===
        GROUP_MEMBER_ROLES.OWNER &&
      normalizedRole !==
        GROUP_MEMBER_ROLES.OWNER
    ) {
      throw new GroupServiceError(
        "OWNER_TRANSFER_REQUIRED",
        "نقل الملكية يحتاج إلى إجراء نقل ملكية صريح.",
        400
      );
    }


    const updated =
      await groupMemberRepository.update(
        target.id,
        {
          role:
            normalizedRole,

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new GroupServiceError(
        "ROLE_UPDATE_FAILED",
        "تعذر تحديث دور العضو.",
        500
      );
    }


    return {
      actor:
        sanitizeMember(actor),

      member:
        sanitizeMember(updated)
    };
  }


  // ==========================================================
  // Transfer Ownership
  // ==========================================================

  async function transferOwnership(
    groupId,
    targetUserId,
    currentOwnerId
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    const ownerId =
      normalizeId(
        currentOwnerId,
        "معرّف المالك الحالي"
      );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المالك الجديد"
      );


    if (ownerId === targetId) {
      throw new GroupServiceError(
        "SAME_OWNER",
        "المستخدم هو المالك بالفعل.",
        400
      );
    }


    const currentOwner =
      await requireOwner(
        group.id,
        ownerId
      );

    const target =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new GroupServiceError(
        "TARGET_MEMBER_NOT_FOUND",
        "المالك الجديد يجب أن يكون عضوًا في المجموعة.",
        400
      );
    }


    if (
      target.status &&
      target.status !==
        GROUP_MEMBER_STATUS.ACTIVE
    ) {
      throw new GroupServiceError(
        "TARGET_MEMBER_INACTIVE",
        "العضو المستهدف غير نشط.",
        400
      );
    }


    if (
      typeof groupMemberRepository.transaction !==
        "function"
    ) {
      throw new GroupServiceError(
        "TRANSACTION_REQUIRED",
        "نقل الملكية يحتاج إلى معاملة قاعدة بيانات.",
        503
      );
    }


    const result =
      await groupMemberRepository.transaction(
        async transaction => {
          const previousOwner =
            await transaction.update(
              currentOwner.id,
              {
                role:
                  GROUP_MEMBER_ROLES.ADMIN,

                updatedAt:
                  clock()
              }
            );

          const newOwner =
            await transaction.update(
              target.id,
              {
                role:
                  GROUP_MEMBER_ROLES.OWNER,

                updatedAt:
                  clock()
              }
            );

          return {
            previousOwner,
            newOwner
          };
        }
      );


    /*
     * Keep the group's creator/owner reference aligned
     * when the persistence model exposes createdBy.
     */

    let updatedGroup = group;

    if (
      typeof groupRepository.update ===
        "function" &&
      Object.prototype.hasOwnProperty.call(
        group,
        "ownerId"
      )
    ) {
      updatedGroup =
        await groupRepository.update(
          group.id,
          {
            ownerId:
              targetId,

            updatedAt:
              clock()
          }
        ) || group;
    }


    return {
      group:
        sanitizeGroup(
          updatedGroup
        ),

      previousOwner:
        sanitizeMember(
          result.previousOwner
        ),

      newOwner:
        sanitizeMember(
          result.newOwner
        )
    };
  }


  // ==========================================================
  // Ban Member
  // ==========================================================

  async function banMember(
    groupId,
    targetUserId,
    actorUserId,
    reason = null
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    const actor =
      await requireModerator(
        group.id,
        actorUserId
      );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );

    const target =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new GroupServiceError(
        "MEMBER_NOT_FOUND",
        "العضو غير موجود.",
        404
      );
    }


    if (
      target.role ===
      GROUP_MEMBER_ROLES.OWNER
    ) {
      throw new GroupServiceError(
        "OWNER_BAN_FORBIDDEN",
        "لا يمكن حظر مالك المجموعة.",
        403
      );
    }


    if (
      target.role ===
        GROUP_MEMBER_ROLES.ADMIN &&
      actor.role !==
        GROUP_MEMBER_ROLES.ADMIN &&
      actor.role !==
        GROUP_MEMBER_ROLES.OWNER
    ) {
      throw new GroupServiceError(
        "ADMIN_BAN_FORBIDDEN",
        "لا يمكنك حظر مسؤول أعلى منك.",
        403
      );
    }


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
      await groupMemberRepository.update(
        target.id,
        {
          status:
            GROUP_MEMBER_STATUS.BANNED,

          bannedAt:
            clock(),

          bannedBy:
            normalizeId(
              actorUserId,
              "معرّف المنفذ"
            ),

          banReason:
            normalizedReason,

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new GroupServiceError(
        "BAN_MEMBER_FAILED",
        "تعذر حظر العضو.",
        500
      );
    }


    return sanitizeMember(
      updated
    );
  }


  // ==========================================================
  // Unban Member
  // ==========================================================

  async function unbanMember(
    groupId,
    targetUserId,
    actorUserId
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    await requireModerator(
      group.id,
      actorUserId
    );

    const targetId =
      normalizeId(
        targetUserId,
        "معرّف المستخدم"
      );

    const target =
      await groupMemberRepository.findOne({
        where: {
          groupId:
            group.id,

          userId:
            targetId
        }
      });


    if (!target) {
      throw new GroupServiceError(
        "MEMBER_NOT_FOUND",
        "العضو غير موجود.",
        404
      );
    }


    const updated =
      await groupMemberRepository.update(
        target.id,
        {
          status:
            GROUP_MEMBER_STATUS.ACTIVE,

          unbannedAt:
            clock(),

          unbannedBy:
            normalizeId(
              actorUserId,
              "معرّف المنفذ"
            ),

          updatedAt:
            clock()
        }
      );


    if (!updated) {
      throw new GroupServiceError(
        "UNBAN_MEMBER_FAILED",
        "تعذر فك حظر العضو.",
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
    groupId,
    actorUserId,
    options = {}
  ) {
    requireMemberRepository();

    const group =
      await getById(
        groupId
      );

    await requireMembership(
      group.id,
      actorUserId
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
      groupId:
        group.id
    };


    if (
      options.status
    ) {
      where.status =
        normalizeEnum(
          options.status,
          VALID_MEMBER_STATUSES,
          "حالة العضو"
        );
    }


    if (
      options.role
    ) {
      where.role =
        normalizeEnum(
          options.role,
          VALID_MEMBER_ROLES,
          "دور العضو"
        );
    }


    const result =
      await groupMemberRepository.findMany({
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
  // List User Groups
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


    const result =
      await groupMemberRepository.query({
        type:
          "listGroupsForUser",

        userId:
          normalizedUserId,

        status:
          options.status ||
          GROUP_MEMBER_STATUS.ACTIVE,

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
          sanitizeGroup
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Search Groups
  // ==========================================================

  async function search(
    searchText,
    options = {}
  ) {
    requireGroupRepository();

    const query =
      normalizeText(
        searchText,
        {
          nullable: false,
          maxLength: 200
        }
      );

    const limit =
      normalizeLimit(
        options.limit,
        20,
        50
      );

    const offset =
      normalizeOffset(
        options.offset
      );


    const result =
      await groupRepository.query({
        type:
          "search",

        query,

        visibility:
          options.visibility ||
          null,

        status:
          options.status ||
          GROUP_STATUS.ACTIVE,

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
          sanitizeGroup
        ),

      query,

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Archive Group
  // ==========================================================

  async function archive(
    groupId,
    actorUserId
  ) {
    return update(
      groupId,
      {
        status:
          GROUP_STATUS.ARCHIVED
      },
      actorUserId
    );
  }


  // ==========================================================
  // Restore Group
  // ==========================================================

  async function restore(
    groupId,
    actorUserId
  ) {
    return update(
      groupId,
      {
        status:
          GROUP_STATUS.ACTIVE
      },
      actorUserId
    );
  }


  // ==========================================================
  // Disable Group
  // ==========================================================

  async function disable(
    groupId,
    actorUserId
  ) {
    await requireOwner(
      groupId,
      actorUserId
    );

    return update(
      groupId,
      {
        status:
          GROUP_STATUS.DISABLED
      },
      actorUserId
    );
  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {
    getById,

    getMembership,

    requireMembership,

    hasRole,

    isAdmin,

    isModerator,

    isOwner,

    requireModerator,

    requireAdmin,

    requireOwner,

    create,

    update,

    addMember,

    removeMember,

    leave,

    updateMemberRole,

    transferOwnership,

    banMember,

    unbanMember,

    listMembers,

    listForUser,

    search,

    archive,

    restore,

    disable,

    sanitizeGroup,

    sanitizeMember
  };
}


// ============================================================
// Exports
// ============================================================

module.exports = {
  GroupServiceError,

  createGroupService,

  groupNotFound,

  groupRepositoryUnavailable,

  groupMemberRepositoryUnavailable,

  groupMembershipRequired,

  normalizeId,

  normalizeText,

  normalizeEnum,

  normalizeLimit,

  normalizeOffset,

  sanitizeGroup,

  sanitizeMember,

  GROUP_STATUS,

  GROUP_MEMBER_STATUS,

  GROUP_MEMBER_ROLES,

  GROUP_VISIBILITY,

  VALID_GROUP_STATUSES,

  VALID_MEMBER_STATUSES,

  VALID_MEMBER_ROLES,

  VALID_VISIBILITY
};
