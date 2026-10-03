"use strict";

/**
 * NOVA — Profile Service
 * =========================================================
 *
 * طبقة منطق الملفات الشخصية.
 *
 * المسؤوليات:
 * - إنشاء ملف المستخدم
 * - جلب الملف الشخصي
 * - تحديث الملف
 * - تحديث الصورة الشخصية والغلاف
 * - التحكم في البيانات العامة
 * - إدارة إعدادات الظهور الأساسية
 *
 * لا يوجد هنا:
 * - بيانات وهمية
 * - Express
 * - SQL
 * - MongoDB
 * - اتصال مباشر بقاعدة البيانات
 *
 * التخزين يتم من خلال Profile Repository.
 */


// ============================================================
// Errors
// ============================================================

class ProfileServiceError extends Error {

  constructor(
    code,
    message,
    statusCode = 400,
    details = null
  ) {

    super(message);

    this.name =
      "ProfileServiceError";

    this.code =
      code;

    this.statusCode =
      statusCode;

    this.details =
      details;

    this.expose =
      true;

  }

}


function profileNotFound() {

  return new ProfileServiceError(
    "PROFILE_NOT_FOUND",
    "الملف الشخصي غير موجود.",
    404
  );

}


function repositoryUnavailable() {

  return new ProfileServiceError(
    "PROFILE_REPOSITORY_NOT_CONFIGURED",
    "خدمة الملفات الشخصية غير مهيأة.",
    503
  );

}


// ============================================================
// Helpers
// ============================================================

function normalizeUserId(
  userId
) {

  if (
    userId === null ||
    userId === undefined
  ) {

    throw new ProfileServiceError(
      "INVALID_USER_ID",
      "معرّف المستخدم مطلوب.",
      400
    );

  }


  const value =
    String(userId).trim();


  if (
    value.length === 0
  ) {

    throw new ProfileServiceError(
      "INVALID_USER_ID",
      "معرّف المستخدم غير صالح.",
      400
    );

  }


  return value;

}


function normalizeText(
  value,
  options = {}
) {

  const {

    nullable = true,

    maxLength = null

  } =
    options;


  if (
    value === null ||
    value === undefined
  ) {

    if (
      nullable
    ) {

      return null;

    }


    throw new ProfileServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );

  }


  if (
    typeof value !==
    "string"
  ) {

    throw new ProfileServiceError(
      "INVALID_TEXT",
      "القيمة النصية غير صالحة.",
      400
    );

  }


  const result =
    value.trim();


  if (
    !nullable &&
    result.length === 0
  ) {

    throw new ProfileServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );

  }


  if (
    maxLength !== null &&
    result.length >
    Number(maxLength)
  ) {

    throw new ProfileServiceError(
      "TEXT_TOO_LONG",
      "النص يتجاوز الحد المسموح.",
      400
    );

  }


  return result.length > 0
    ? result
    : null;

}


// ============================================================
// URL Validation
// ============================================================

function normalizeUrl(
  value,
  options = {}
) {

  const {

    nullable = true

  } =
    options;


  const normalized =
    normalizeText(
      value,
      {
        nullable
      }
    );


  if (
    normalized === null
  ) {

    return null;

  }


  try {

    const url =
      new URL(
        normalized
      );


    if (
      ![
        "http:",
        "https:"
      ].includes(
        url.protocol
      )
    ) {

      throw new Error();

    }


    return url.toString();

  } catch {

    throw new ProfileServiceError(
      "INVALID_URL",
      "رابط الصورة غير صالح.",
      400
    );

  }

}


// ============================================================
// Visibility
// ============================================================

const VISIBILITY_VALUES = [

  "public",

  "friends",

  "private"

];


function normalizeVisibility(
  value
) {

  const visibility =
    normalizeText(
      value
    );


  if (
    visibility === null
  ) {

    return "public";

  }


  if (
    !VISIBILITY_VALUES.includes(
      visibility
    )
  ) {

    throw new ProfileServiceError(
      "INVALID_VISIBILITY",
      "إعداد الظهور غير صالح.",
      400
    );

  }


  return visibility;

}


// ============================================================
// Safe Profile
// ============================================================

const INTERNAL_PROFILE_FIELDS = [

  "password",

  "passwordHash",

  "passwordDigest",

  "securityAnswer",

  "secret",

  "privateKey",

  "internalNotes"

];


function sanitizeProfile(
  profile
) {

  if (
    !profile ||
    typeof profile !== "object"
  ) {

    return null;

  }


  const safeProfile = {
    ...profile
  };


  for (
    const field of
      INTERNAL_PROFILE_FIELDS
  ) {

    delete safeProfile[field];

  }


  return safeProfile;

}


// ============================================================
// Service Factory
// ============================================================

function createProfileService(
  dependencies = {}
) {

  const {

    profileRepository = null,

    userRepository = null,

    clock = () => new Date()

  } =
    dependencies;


  // ==========================================================
  // Repository Requirements
  // ==========================================================

  function requireProfileRepository() {

    if (
      !profileRepository ||
      typeof profileRepository.findOne !==
      "function"
    ) {

      throw repositoryUnavailable();

    }

  }


  // ==========================================================
  // Get Profile
  // ==========================================================

  async function getByUserId(
    userId,
    options = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        userId
      );


    const profile =
      await profileRepository.findOne({

        where: {

          userId:
            id

        }

      });


    if (
      !profile
    ) {

      if (
        options.required === false
      ) {

        return null;

      }


      throw profileNotFound();

    }


    return sanitizeProfile(
      profile
    );

  }


  // ==========================================================
  // Get Profile By ID
  // ==========================================================

  async function getById(
    profileId,
    options = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        profileId
      );


    const profile =
      await profileRepository.findOne({

        where: {

          id

        }

      });


    if (
      !profile
    ) {

      if (
        options.required === false
      ) {

        return null;

      }


      throw profileNotFound();

    }


    return sanitizeProfile(
      profile
    );

  }


  // ==========================================================
  // Create Profile
  // ==========================================================

  async function create(
    userId,
    input = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        userId
      );


    if (
      !input ||
      typeof input !== "object"
    ) {

      throw new ProfileServiceError(
        "INVALID_PROFILE_DATA",
        "بيانات الملف الشخصي غير صالحة.",
        400
      );

    }


    const existing =
      await profileRepository.findOne({

        where: {

          userId:
            id

        }

      });


    if (
      existing
    ) {

      throw new ProfileServiceError(
        "PROFILE_ALREADY_EXISTS",
        "الملف الشخصي موجود بالفعل.",
        409
      );

    }


    const profileData = {

      userId:
        id,

      displayName:
        normalizeText(
          input.displayName,
          {
            maxLength: 80
          }
        ),

      username:
        normalizeText(
          input.username,
          {
            maxLength: 40
          }
        ),

      bio:
        normalizeText(
          input.bio,
          {
            maxLength: 500
          }
        ),

      avatarUrl:
        normalizeUrl(
          input.avatarUrl
        ),

      coverUrl:
        normalizeUrl(
          input.coverUrl
        ),

      visibility:
        normalizeVisibility(
          input.visibility
        ),

      createdAt:
        input.createdAt ||
        clock(),

      updatedAt:
        clock()

    };


    const created =
      await profileRepository.create(
        profileData
      );


    if (
      !created
    ) {

      throw new ProfileServiceError(
        "PROFILE_CREATE_FAILED",
        "تعذر إنشاء الملف الشخصي.",
        500
      );

    }


    return sanitizeProfile(
      created
    );

  }


  // ==========================================================
  // Update Profile
  // ==========================================================

  async function update(
    userId,
    changes = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        userId
      );


    if (
      !changes ||
      typeof changes !== "object"
    ) {

      throw new ProfileServiceError(
        "INVALID_PROFILE_DATA",
        "بيانات التحديث غير صالحة.",
        400
      );

    }


    const updateData = {};


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "displayName"
      )
    ) {

      updateData.displayName =
        normalizeText(
          changes.displayName,
          {
            maxLength: 80
          }
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "username"
      )
    ) {

      updateData.username =
        normalizeText(
          changes.username,
          {
            maxLength: 40
          }
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "bio"
      )
    ) {

      updateData.bio =
        normalizeText(
          changes.bio,
          {
            maxLength: 500
          }
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "avatarUrl"
      )
    ) {

      updateData.avatarUrl =
        normalizeUrl(
          changes.avatarUrl
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "coverUrl"
      )
    ) {

      updateData.coverUrl =
        normalizeUrl(
          changes.coverUrl
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "visibility"
      )
    ) {

      updateData.visibility =
        normalizeVisibility(
          changes.visibility
        );

    }


    if (
      Object.keys(
        updateData
      ).length === 0
    ) {

      throw new ProfileServiceError(
        "NO_UPDATE_FIELDS",
        "لم يتم إرسال أي بيانات للتحديث.",
        400
      );

    }


    updateData.updatedAt =
      clock();


    const updated =
      await profileRepository.update(
        id,
        updateData
      );


    if (
      !updated
    ) {

      throw profileNotFound();

    }


    return sanitizeProfile(
      updated
    );

  }


  // ==========================================================
  // Update Avatar
  // ==========================================================

  async function updateAvatar(
    userId,
    avatarUrl
  ) {

    const id =
      normalizeUserId(
        userId
      );


    const url =
      normalizeUrl(
        avatarUrl,
        {
          nullable: false
        }
      );


    return update(
      id,
      {
        avatarUrl:
          url
      }
    );

  }


  // ==========================================================
  // Update Cover
  // ==========================================================

  async function updateCover(
    userId,
    coverUrl
  ) {

    const id =
      normalizeUserId(
        userId
      );


    const url =
      normalizeUrl(
        coverUrl,
        {
          nullable: false
        }
      );


    return update(
      id,
      {
        coverUrl:
          url
      }
    );

  }


  // ==========================================================
  // Update Visibility
  // ==========================================================

  async function updateVisibility(
    userId,
    visibility
  ) {

    const id =
      normalizeUserId(
        userId
      );


    return update(
      id,
      {
        visibility
      }
    );

  }


  // ==========================================================
  // Ensure Profile
  // ==========================================================

  async function ensureProfile(
    userId,
    defaults = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        userId
      );


    const existing =
      await profileRepository.findOne({

        where: {

          userId:
            id

        }

      });


    if (
      existing
    ) {

      return sanitizeProfile(
        existing
      );

    }


    return create(
      id,
      defaults
    );

  }


  // ==========================================================
  // Delete Profile
  // ==========================================================

  async function remove(
    userId,
    options = {}
  ) {

    requireProfileRepository();


    const id =
      normalizeUserId(
        userId
      );


    if (
      typeof profileRepository.delete !==
      "function"
    ) {

      throw new ProfileServiceError(
        "DELETE_NOT_SUPPORTED",
        "حذف الملف الشخصي غير مدعوم.",
        503
      );

    }


    const deleted =
      await profileRepository.delete(
        id,
        {
          userId:
            id,

          permanent:
            options.permanent === true
        }
      );


    if (
      !deleted
    ) {

      throw profileNotFound();

    }


    return {

      deleted:
        true,

      userId:
        id

    };

  }


  // ==========================================================
  // Profile + User
  // ==========================================================

  async function getCompleteProfile(
    userId
  ) {

    const id =
      normalizeUserId(
        userId
      );


    const profile =
      await getByUserId(
        id
      );


    let user =
      null;


    if (
      userRepository &&
      typeof userRepository.findOne ===
      "function"
    ) {

      user =
        await userRepository.findOne({

          where: {

            id

          }

        });

    }


    /*
     * Keep user data intentionally limited.
     */

    const safeUser =
      user
        ? {

            id:
              user.id,

            username:
              user.username || null,

            emailVerified:
              user.emailVerified ??
              null,

            phoneVerified:
              user.phoneVerified ??
              null,

            status:
              user.status || null,

            createdAt:
              user.createdAt || null

          }
        : null;


    return {

      user:
        safeUser,

      profile

    };

  }


  // ==========================================================
  // Check Ownership
  // ==========================================================

  function isOwner(
    userId,
    profile
  ) {

    if (
      !profile
    ) {

      return false;

    }


    const currentUserId =
      normalizeUserId(
        userId
      );


    const profileUserId =
      profile.userId;


    if (
      profileUserId === null ||
      profileUserId === undefined
    ) {

      return false;

    }


    return (
      currentUserId ===
      String(
        profileUserId
      )
    );

  }


  // ==========================================================
  // Require Ownership
  // ==========================================================

  function requireOwnership(
    userId,
    profile
  ) {

    if (
      !isOwner(
        userId,
        profile
      )
    ) {

      throw new ProfileServiceError(
        "PROFILE_OWNERSHIP_REQUIRED",
        "لا تملك صلاحية تعديل هذا الملف الشخصي.",
        403
      );

    }


    return true;

  }


  // ==========================================================
  // Public Profile
  // ==========================================================

  async function getPublicProfile(
    userId,
    viewerId = null
  ) {

    const profile =
      await getByUserId(
        userId
      );


    const visibility =
      profile.visibility ||
      "public";


    /*
     * Public profile.
     */

    if (
      visibility ===
      "public"
    ) {

      return sanitizeProfile(
        profile
      );

    }


    /*
     * Owner can always see their
     * own profile.
     */

    if (
      viewerId !== null &&
      String(
        viewerId
      ) === String(
        userId
      )
    ) {

      return sanitizeProfile(
        profile
      );

    }


    /*
     * Friend relationship checks belong
     * to the Contacts/Friends service.
     *
     * We deliberately do not guess.
     */

    if (
      visibility ===
      "friends"
    ) {

      throw new ProfileServiceError(
        "FRIENDS_ACCESS_REQUIRED",
        "هذا الملف متاح للأصدقاء فقط.",
        403
      );

    }


    throw new ProfileServiceError(
      "PRIVATE_PROFILE",
      "هذا الملف الشخصي خاص.",
      403
    );

  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {

    getByUserId,

    getById,

    create,

    update,

    updateAvatar,

    updateCover,

    updateVisibility,

    ensureProfile,

    remove,

    getCompleteProfile,

    getPublicProfile,

    isOwner,

    requireOwnership,

    sanitizeProfile

  };

}


// ============================================================
// Exports
// ============================================================

module.exports = {

  ProfileServiceError,

  createProfileService,

  profileNotFound,

  repositoryUnavailable,

  normalizeUserId,

  normalizeText,

  normalizeUrl,

  normalizeVisibility,

  sanitizeProfile,

  VISIBILITY_VALUES,

  INTERNAL_PROFILE_FIELDS

};
