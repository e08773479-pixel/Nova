"use strict";

/**
 * NOVA — Community Service
 *
 * مسؤول عن:
 * - إنشاء المجتمعات
 * - قراءة وتحديث بيانات المجتمع
 * - البحث والقوائم
 * - إدارة العضوية عند توفر Community Member Repository
 * - الصلاحيات الأساسية
 *
 * ملاحظة:
 * لا يوجد هنا اتصال مباشر بقاعدة البيانات.
 * الـRepository يتم حقنه من طبقة Database لاحقًا.
 */

const COMMUNITY_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
  DISABLED: "disabled"
});

const COMMUNITY_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private"
});

const COMMUNITY_MEMBER_ROLES = Object.freeze({
  MEMBER: "member",
  MODERATOR: "moderator",
  ADMIN: "admin",
  OWNER: "owner"
});

const COMMUNITY_MEMBER_STATUS = Object.freeze({
  ACTIVE: "active",
  BANNED: "banned",
  LEFT: "left",
  PENDING: "pending"
});

class CommunityServiceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CommunityServiceError";
    this.code = code;
    this.details = details;
  }
}

function createCommunityService({
  communityRepository,
  communityMemberRepository = null,
  userRepository = null,
  realtimeService = null,
  clock = () => new Date()
} = {}) {
  if (!communityRepository) {
    throw new CommunityServiceError(
      "COMMUNITY_REPOSITORY_REQUIRED",
      "Community repository is required."
    );
  }

  const now = () => clock();

  function requireUserId(userId) {
    if (!userId) {
      throw new CommunityServiceError(
        "USER_ID_REQUIRED",
        "معرّف المستخدم مطلوب."
      );
    }

    return userId;
  }

  function requireCommunityId(communityId) {
    if (!communityId) {
      throw new CommunityServiceError(
        "COMMUNITY_ID_REQUIRED",
        "معرّف المجتمع مطلوب."
      );
    }

    return communityId;
  }

  async function getById(communityId) {
    requireCommunityId(communityId);

    const community = await communityRepository.findOne({
      where: { id: communityId }
    });

    if (!community) {
      throw new CommunityServiceError(
        "COMMUNITY_NOT_FOUND",
        "المجتمع غير موجود."
      );
    }

    return community;
  }

  async function create(input, ownerId) {
    requireUserId(ownerId);

    if (!input || !input.name) {
      throw new CommunityServiceError(
        "COMMUNITY_NAME_REQUIRED",
        "اسم المجتمع مطلوب."
      );
    }

    const name = String(input.name).trim();

    if (!name) {
      throw new CommunityServiceError(
        "COMMUNITY_NAME_REQUIRED",
        "اسم المجتمع مطلوب."
      );
    }

    if (userRepository) {
      const owner = await userRepository.findOne({
        where: { id: ownerId }
      });

      if (!owner) {
        throw new CommunityServiceError(
          "OWNER_NOT_FOUND",
          "المستخدم المالك غير موجود."
        );
      }
    }

    const community = await communityRepository.create({
      name,
      description: input.description || null,
      avatar: input.avatar || null,
      cover: input.cover || null,
      visibility:
        input.visibility === COMMUNITY_VISIBILITY.PRIVATE
          ? COMMUNITY_VISIBILITY.PRIVATE
          : COMMUNITY_VISIBILITY.PUBLIC,
      status: COMMUNITY_STATUS.ACTIVE,
      ownerId,
      createdAt: now(),
      updatedAt: now()
    });

    if (realtimeService?.communityCreated) {
      await realtimeService.communityCreated(community);
    }

    return community;
  }

  async function update(communityId, actorId, changes) {
    requireCommunityId(communityId);
    requireUserId(actorId);

    await requireAdmin(communityId, actorId);

    if (!changes || typeof changes !== "object") {
      throw new CommunityServiceError(
        "INVALID_UPDATE",
        "بيانات التحديث غير صالحة."
      );
    }

    const allowed = [
      "name",
      "description",
      "avatar",
      "cover",
      "visibility"
    ];

    const payload = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        payload[key] = changes[key];
      }
    }

    if (Object.keys(payload).length === 0) {
      throw new CommunityServiceError(
        "NO_CHANGES",
        "لا توجد بيانات لتحديثها."
      );
    }

    if (payload.name !== undefined) {
      payload.name = String(payload.name).trim();

      if (!payload.name) {
        throw new CommunityServiceError(
          "COMMUNITY_NAME_REQUIRED",
          "اسم المجتمع مطلوب."
        );
      }
    }

    if (
      payload.visibility !== undefined &&
      !Object.values(COMMUNITY_VISIBILITY).includes(payload.visibility)
    ) {
      throw new CommunityServiceError(
        "INVALID_VISIBILITY",
        "نوع ظهور المجتمع غير صالح."
      );
    }

    payload.updatedAt = now();

    const updated = await communityRepository.update(
      communityId,
      payload
    );

    if (realtimeService?.communityUpdated) {
      await realtimeService.communityUpdated(updated);
    }

    return updated;
  }

  async function archive(communityId, actorId) {
    requireUserId(actorId);
    await requireOwner(communityId, actorId);

    return communityRepository.update(communityId, {
      status: COMMUNITY_STATUS.ARCHIVED,
      updatedAt: now()
    });
  }

  async function restore(communityId, actorId) {
    requireUserId(actorId);
    await requireOwner(communityId, actorId);

    return communityRepository.update(communityId, {
      status: COMMUNITY_STATUS.ACTIVE,
      updatedAt: now()
    });
  }

  async function disable(communityId, actorId) {
    requireUserId(actorId);
    await requireOwner(communityId, actorId);

    return communityRepository.update(communityId, {
      status: COMMUNITY_STATUS.DISABLED,
      updatedAt: now()
    });
  }

  async function list({
    limit = 20,
    offset = 0,
    status = COMMUNITY_STATUS.ACTIVE,
    visibility = null
  } = {}) {
    const where = { status };

    if (visibility) {
      where.visibility = visibility;
    }

    return communityRepository.findMany({
      where,
      limit,
      offset,
      sort: {
        createdAt: "desc"
      }
    });
  }

  async function search(query, options = {}) {
    const value = String(query || "").trim();

    if (!value) {
      return [];
    }

    return communityRepository.findMany({
      where: {
        status: COMMUNITY_STATUS.ACTIVE,
        search: value
      },
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      sort: {
        createdAt: "desc"
      }
    });
  }

  function requireMembershipRepository() {
    if (!communityMemberRepository) {
      throw new CommunityServiceError(
        "COMMUNITY_MEMBERS_REPOSITORY_REQUIRED",
        "Community membership repository is not configured yet."
      );
    }

    return communityMemberRepository;
  }

  async function getMembership(communityId, userId) {
    requireCommunityId(communityId);
    requireUserId(userId);

    const repository = requireMembershipRepository();

    return repository.findOne({
      where: {
        communityId,
        userId
      }
    });
  }

  async function isMember(communityId, userId) {
    const membership = await getMembership(communityId, userId);

    return Boolean(
      membership &&
      membership.status !== COMMUNITY_MEMBER_STATUS.BANNED &&
      membership.status !== COMMUNITY_MEMBER_STATUS.LEFT
    );
  }

  async function join(communityId, userId) {
    requireCommunityId(communityId);
    requireUserId(userId);

    const repository = requireMembershipRepository();
    const community = await getById(communityId);

    if (community.status !== COMMUNITY_STATUS.ACTIVE) {
      throw new CommunityServiceError(
        "COMMUNITY_NOT_ACTIVE",
        "المجتمع غير متاح للانضمام."
      );
    }

    const existing = await repository.findOne({
      where: {
        communityId,
        userId
      }
    });

    if (existing?.status === COMMUNITY_MEMBER_STATUS.BANNED) {
      throw new CommunityServiceError(
        "USER_BANNED",
        "لا يمكن لهذا المستخدم الانضمام إلى المجتمع."
      );
    }

    if (existing) {
      return existing;
    }

    const membership = await repository.create({
      communityId,
      userId,
      role: COMMUNITY_MEMBER_ROLES.MEMBER,
      status:
        community.visibility === COMMUNITY_VISIBILITY.PRIVATE
          ? COMMUNITY_MEMBER_STATUS.PENDING
          : COMMUNITY_MEMBER_STATUS.ACTIVE,
      joinedAt: now(),
      updatedAt: now()
    });

    if (realtimeService?.communityMemberJoined) {
      await realtimeService.communityMemberJoined(
        communityId,
        membership
      );
    }

    return membership;
  }

  async function leave(communityId, userId) {
    requireCommunityId(communityId);
    requireUserId(userId);

    const repository = requireMembershipRepository();

    const membership = await getMembership(communityId, userId);

    if (!membership) {
      throw new CommunityServiceError(
        "MEMBERSHIP_NOT_FOUND",
        "عضوية المستخدم غير موجودة."
      );
    }

    if (membership.role === COMMUNITY_MEMBER_ROLES.OWNER) {
      throw new CommunityServiceError(
        "OWNER_CANNOT_LEAVE",
        "لا يمكن للمالك مغادرة المجتمع قبل نقل الملكية."
      );
    }

    return repository.update(membership.id, {
      status: COMMUNITY_MEMBER_STATUS.LEFT,
      leftAt: now(),
      updatedAt: now()
    });
  }

  async function requireOwner(communityId, userId) {
    const community = await getById(communityId);

    if (community.ownerId !== userId) {
      throw new CommunityServiceError(
        "OWNER_REQUIRED",
        "هذه العملية متاحة لمالك المجتمع فقط."
      );
    }

    return community;
  }

  async function requireAdmin(communityId, userId) {
    const membership = await getMembership(communityId, userId);

    if (
      !membership ||
      ![
        COMMUNITY_MEMBER_ROLES.OWNER,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_ROLES.MODERATOR
      ].includes(membership.role) ||
      membership.status !== COMMUNITY_MEMBER_STATUS.ACTIVE
    ) {
      const community = await getById(communityId);

      if (community.ownerId !== userId) {
        throw new CommunityServiceError(
          "COMMUNITY_ADMIN_REQUIRED",
          "ليس لديك صلاحية إدارة هذا المجتمع."
        );
      }

      return community;
    }

    return membership;
  }

  async function updateMemberRole(
    communityId,
    actorId,
    memberId,
    role
  ) {
    requireUserId(actorId);
    requireUserId(memberId);

    await requireAdmin(communityId, actorId);

    if (!Object.values(COMMUNITY_MEMBER_ROLES).includes(role)) {
      throw new CommunityServiceError(
        "INVALID_MEMBER_ROLE",
        "دور العضو غير صالح."
      );
    }

    if (role === COMMUNITY_MEMBER_ROLES.OWNER) {
      throw new CommunityServiceError(
        "OWNER_TRANSFER_REQUIRED",
        "نقل الملكية يجب أن يتم من خلال عملية نقل الملكية."
      );
    }

    const repository = requireMembershipRepository();

    const membership = await repository.findOne({
      where: {
        communityId,
        userId: memberId
      }
    });

    if (!membership) {
      throw new CommunityServiceError(
        "MEMBERSHIP_NOT_FOUND",
        "العضوية غير موجودة."
      );
    }

    return repository.update(membership.id, {
      role,
      updatedAt: now()
    });
  }

  async function banMember(communityId, actorId, memberId) {
    requireUserId(actorId);
    requireUserId(memberId);

    await requireAdmin(communityId, actorId);

    const repository = requireMembershipRepository();

    const membership = await repository.findOne({
      where: {
        communityId,
        userId: memberId
      }
    });

    if (!membership) {
      throw new CommunityServiceError(
        "MEMBERSHIP_NOT_FOUND",
        "العضوية غير موجودة."
      );
    }

    if (membership.role === COMMUNITY_MEMBER_ROLES.OWNER) {
      throw new CommunityServiceError(
        "OWNER_CANNOT_BE_BANNED",
        "لا يمكن حظر مالك المجتمع."
      );
    }

    return repository.update(membership.id, {
      status: COMMUNITY_MEMBER_STATUS.BANNED,
      bannedAt: now(),
      updatedAt: now()
    });
  }

  async function unbanMember(communityId, actorId, memberId) {
    requireUserId(actorId);
    requireUserId(memberId);

    await requireAdmin(communityId, actorId);

    const repository = requireMembershipRepository();

    const membership = await repository.findOne({
      where: {
        communityId,
        userId: memberId
      }
    });

    if (!membership) {
      throw new CommunityServiceError(
        "MEMBERSHIP_NOT_FOUND",
        "العضوية غير موجودة."
      );
    }

    return repository.update(membership.id, {
      status: COMMUNITY_MEMBER_STATUS.ACTIVE,
      bannedAt: null,
      updatedAt: now()
    });
  }

  async function listMembers(
    communityId,
    { limit = 50, offset = 0 } = {}
  ) {
    const repository = requireMembershipRepository();

    return repository.findMany({
      where: {
        communityId,
        status: COMMUNITY_MEMBER_STATUS.ACTIVE
      },
      limit,
      offset,
      sort: {
        joinedAt: "asc"
      }
    });
  }

  return Object.freeze({
    create,
    getById,
    update,
    archive,
    restore,
    disable,
    list,
    search,
    getMembership,
    isMember,
    join,
    leave,
    updateMemberRole,
    banMember,
    unbanMember,
    listMembers,
    requireOwner,
    requireAdmin,
    constants: {
      COMMUNITY_STATUS,
      COMMUNITY_VISIBILITY,
      COMMUNITY_MEMBER_ROLES,
      COMMUNITY_MEMBER_STATUS
    }
  });
}

module.exports = {
  createCommunityService,
  CommunityServiceError,
  COMMUNITY_STATUS,
  COMMUNITY_VISIBILITY,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUS
};
