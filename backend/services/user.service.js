"use strict";

/**
 * NOVA — User Service
 * =========================================================
 *
 * طبقة منطق المستخدمين.
 *
 * المسؤوليات:
 * - جلب المستخدمين
 * - إنشاء المستخدم
 * - تحديث بيانات المستخدم
 * - حذف/تعطيل الحساب
 * - البحث
 * - التحقق من ملكية الحساب
 * - تنظيف البيانات الحساسة قبل الإرجاع
 *
 * لا يوجد هنا:
 * - Express
 * - بيانات وهمية
 * - اتصال مباشر بقاعدة البيانات
 * - SQL
 * - MongoDB logic
 * - أسرار أو كلمات مرور
 *
 * جميع عمليات التخزين تمر عبر User Repository.
 */


// ============================================================
// Errors
// ============================================================

class UserServiceError extends Error {

  constructor(
    code,
    message,
    statusCode = 400,
    details = null
  ) {

    super(message);

    this.name =
      "UserServiceError";

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


function userNotFound() {

  return new UserServiceError(
    "USER_NOT_FOUND",
    "المستخدم غير موجود.",
    404
  );

}


function repositoryUnavailable() {

  return new UserServiceError(
    "USER_REPOSITORY_NOT_CONFIGURED",
    "خدمة المستخدمين غير مهيأة.",
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

    throw new UserServiceError(
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

    throw new UserServiceError(
      "INVALID_USER_ID",
      "معرّف المستخدم غير صالح.",
      400
    );

  }


  return value;

}


function normalizeText(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  if (
    typeof value !== "string"
  ) {

    throw new UserServiceError(
      "INVALID_TEXT",
      "قيمة نصية غير صالحة.",
      400
    );

  }


  const result =
    value.trim();


  return result.length > 0
    ? result
    : null;

}


// ============================================================
// Sensitive Fields
// ============================================================

const SENSITIVE_FIELDS = [

  "password",

  "passwordHash",

  "passwordDigest",

  "refreshToken",

  "refreshTokenHash",

  "accessToken",

  "secret",

  "privateKey",

  "resetToken",

  "verificationToken",

  "securityAnswer"

];


// ============================================================
// Sanitize User
// ============================================================

function sanitizeUser(
  user
) {

  if (
    !user ||
    typeof user !== "object"
  ) {

    return null;

  }


  const safeUser = {
    ...user
  };


  for (
    const field of
      SENSITIVE_FIELDS
  ) {

    delete safeUser[field];

  }


  return safeUser;

}


// ============================================================
// Service Factory
// ============================================================

function createUserService(
  dependencies = {}
) {

  const {

    userRepository = null,

    clock = () => new Date(),

    normalizeUser =
      sanitizeUser

  } =
    dependencies;


  // ==========================================================
  // Repository
  // ==========================================================

  function requireRepository() {

    if (
      !userRepository ||
      typeof userRepository.findOne !==
      "function"
    ) {

      throw repositoryUnavailable();

    }

  }


  // ==========================================================
  // Find By ID
  // ==========================================================

  async function getById(
    userId,
    options = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const user =
      await userRepository.findOne({

        where: {

          id

        }

      });


    if (
      !user
    ) {

      if (
        options.required === false
      ) {

        return null;

      }


      throw userNotFound();

    }


    return options.includeSensitive === true
      ? {
          ...user
        }
      : normalizeUser(
          user
        );

  }


  // ==========================================================
  // Find By Username
  // ==========================================================

  async function getByUsername(
    username
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        username
      );


    if (
      !normalized
    ) {

      throw new UserServiceError(
        "INVALID_USERNAME",
        "اسم المستخدم مطلوب.",
        400
      );

    }


    const user =
      await userRepository.findOne({

        where: {

          username:
            normalized

        }

      });


    return user
      ? normalizeUser(user)
      : null;

  }


  // ==========================================================
  // Find By Email
  // ==========================================================

  async function getByEmail(
    email
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        email
      );


    if (
      !normalized
    ) {

      throw new UserServiceError(
        "INVALID_EMAIL",
        "البريد الإلكتروني مطلوب.",
        400
      );

    }


    const user =
      await userRepository.findOne({

        where: {

          email:
            normalized.toLowerCase()

        }

      });


    return user
      ? normalizeUser(user)
      : null;

  }


  // ==========================================================
  // Find By Phone
  // ==========================================================

  async function getByPhone(
    phone
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        phone
      );


    if (
      !normalized
    ) {

      throw new UserServiceError(
        "INVALID_PHONE",
        "رقم الهاتف مطلوب.",
        400
      );

    }


    const user =
      await userRepository.findOne({

        where: {

          phone:
            normalized

        }

      });


    return user
      ? normalizeUser(user)
      : null;

  }


  // ==========================================================
  // List Users
  // ==========================================================

  async function list(
    options = {}
  ) {

    requireRepository();


    const {

      filter = {},

      limit = 20,

      offset = 0,

      sort = null

    } =
      options;


    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );


    const safeOffset =
      Math.max(
        Number(offset) || 0,
        0
      );


    const result =
      await userRepository.findMany({

        where:
          filter,

        limit:
          safeLimit,

        offset:
          safeOffset,

        sort

      });


    const users =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return users.map(
      normalizeUser
    );

  }


  // ==========================================================
  // Search Users
  // ==========================================================

  async function search(
    query,
    options = {}
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        query
      );


    if (
      !normalized
    ) {

      return [];

    }


    const limit =
      Math.min(
        Math.max(
          Number(
            options.limit
          ) || 20,
          1
        ),
        50
      );


    /*
     * The repository/database adapter is responsible
     * for translating this query into its real
     * database-specific search operation.
     */

    const result =
      await userRepository.query({

        type:
          "search",

        query:
          normalized,

        limit

      });


    const users =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return users.map(
      normalizeUser
    );

  }


  // ==========================================================
  // Create User
  // ==========================================================

  async function create(
    input = {}
  ) {

    requireRepository();


    if (
      !input ||
      typeof input !== "object"
    ) {

      throw new UserServiceError(
        "INVALID_USER_DATA",
        "بيانات المستخدم غير صالحة.",
        400
      );

    }


    const data = {

      username:
        normalizeText(
          input.username
        ),

      displayName:
        normalizeText(
          input.displayName
        ),

      email:
        normalizeText(
          input.email
        )?.toLowerCase() || null,

      phone:
        normalizeText(
          input.phone
        ),

      status:
        input.status ||
        "active",

      createdAt:
        input.createdAt ||
        clock(),

      updatedAt:
        clock()

    };


    /*
     * Credential fields may be supplied by
     * Auth Service when required.
     *
     * They are passed through intentionally,
     * but never returned unsanitized.
     */

    if (
      input.passwordHash
    ) {

      data.passwordHash =
        input.passwordHash;

    }


    if (
      input.emailVerified !==
      undefined
    ) {

      data.emailVerified =
        Boolean(
          input.emailVerified
        );

    }


    if (
      input.phoneVerified !==
      undefined
    ) {

      data.phoneVerified =
        Boolean(
          input.phoneVerified
        );

    }


    const created =
      await userRepository.create(
        data
      );


    if (
      !created
    ) {

      throw new UserServiceError(
        "USER_CREATE_FAILED",
        "تعذر إنشاء المستخدم.",
        500
      );

    }


    return normalizeUser(
      created
    );

  }


  // ==========================================================
  // Update User
  // ==========================================================

  async function update(
    userId,
    changes = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    if (
      !changes ||
      typeof changes !== "object"
    ) {

      throw new UserServiceError(
        "INVALID_UPDATE_DATA",
        "بيانات التحديث غير صالحة.",
        400
      );

    }


    const allowedFields = [

      "username",

      "displayName",

      "bio",

      "avatarUrl",

      "coverUrl",

      "email",

      "phone",

      "status",

      "emailVerified",

      "phoneVerified",

      "lastSeenAt"

    ];


    const updateData = {};


    for (
      const field of
        allowedFields
    ) {

      if (
        Object.prototype.hasOwnProperty.call(
          changes,
          field
        )
      ) {

        if (
          typeof changes[field] ===
          "string"
        ) {

          updateData[field] =
            normalizeText(
              changes[field]
            );

        } else {

          updateData[field] =
            changes[field];

        }

      }

    }


    if (
      Object.keys(
        updateData
      ).length === 0
    ) {

      throw new UserServiceError(
        "NO_UPDATE_FIELDS",
        "لم يتم إرسال أي بيانات للتحديث.",
        400
      );

    }


    updateData.updatedAt =
      clock();


    const updated =
      await userRepository.update(
        id,
        updateData
      );


    if (
      !updated
    ) {

      throw userNotFound();

    }


    return normalizeUser(
      updated
    );

  }


  // ==========================================================
  // Change Status
  // ==========================================================

  async function changeStatus(
    userId,
    status
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const normalizedStatus =
      normalizeText(
        status
      );


    if (
      !normalizedStatus
    ) {

      throw new UserServiceError(
        "INVALID_STATUS",
        "حالة المستخدم غير صالحة.",
        400
      );

    }


    const allowedStatuses = [

      "active",

      "inactive",

      "suspended",

      "disabled"

    ];


    if (
      !allowedStatuses.includes(
        normalizedStatus
      )
    ) {

      throw new UserServiceError(
        "INVALID_STATUS",
        "حالة المستخدم غير مدعومة.",
        400
      );

    }


    const updated =
      await userRepository.update(
        id,
        {

          status:
            normalizedStatus,

          updatedAt:
            clock()

        }
      );


    if (
      !updated
    ) {

      throw userNotFound();

    }


    return normalizeUser(
      updated
    );

  }


  // ==========================================================
  // Delete User
  // ==========================================================

  async function remove(
    userId,
    options = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    /*
     * Soft deletion is the default.
     * Permanent deletion must be explicitly
     * enabled by the caller/service policy.
     */

    if (
      options.permanent !== true
    ) {

      return changeStatus(
        id,
        "disabled"
      );

    }


    if (
      typeof userRepository.delete !==
      "function"
    ) {

      throw new UserServiceError(
        "DELETE_NOT_SUPPORTED",
        "حذف المستخدم غير مدعوم حاليًا.",
        503
      );

    }


    const deleted =
      await userRepository.delete(
        id
      );


    if (
      !deleted
    ) {

      throw userNotFound();

    }


    return {

      deleted:
        true,

      userId:
        id

    };

  }


  // ==========================================================
  // Check Ownership
  // ==========================================================

  function isOwner(
    userId,
    resourceUserId
  ) {

    if (
      userId === null ||
      userId === undefined ||
      resourceUserId === null ||
      resourceUserId === undefined
    ) {

      return false;

    }


    return (
      String(userId) ===
      String(resourceUserId)
    );

  }


  // ==========================================================
  // Require Ownership
  // ==========================================================

  function requireOwnership(
    userId,
    resourceUserId
  ) {

    if (
      !isOwner(
        userId,
        resourceUserId
      )
    ) {

      throw new UserServiceError(
        "USER_OWNERSHIP_REQUIRED",
        "لا تملك صلاحية تعديل هذا الحساب.",
        403
      );

    }


    return true;

  }


  // ==========================================================
  // Get Public Profile
  // ==========================================================

  async function getPublicProfile(
    userId
  ) {

    const user =
      await getById(
        userId
      );


    /*
     * Keep the public representation
     * intentionally limited.
     */

    return {

      id:
        user.id,

      username:
        user.username || null,

      displayName:
        user.displayName || null,

      bio:
        user.bio || null,

      avatarUrl:
        user.avatarUrl || null,

      coverUrl:
        user.coverUrl || null,

      status:
        user.status || null,

      createdAt:
        user.createdAt || null

    };

  }


  // ==========================================================
  // Update Last Seen
  // ==========================================================

  async function updateLastSeen(
    userId,
    timestamp = null
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const lastSeenAt =
      timestamp ||
      clock();


    const updated =
      await userRepository.update(
        id,
        {

          lastSeenAt,

          updatedAt:
            clock()

        }
      );


    if (
      !updated
    ) {

      throw userNotFound();

    }


    return normalizeUser(
      updated
    );

  }


  // ==========================================================
  // Existence Checks
  // ==========================================================

  async function existsByUsername(
    username
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        username
      );


    if (
      !normalized
    ) {

      return false;

    }


    const user =
      await userRepository.findOne({

        where: {

          username:
            normalized

        }

      });


    return Boolean(
      user
    );

  }


  async function existsByEmail(
    email
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        email
      );


    if (
      !normalized
    ) {

      return false;

    }


    const user =
      await userRepository.findOne({

        where: {

          email:
            normalized.toLowerCase()

        }

      });


    return Boolean(
      user
    );

  }


  async function existsByPhone(
    phone
  ) {

    requireRepository();


    const normalized =
      normalizeText(
        phone
      );


    if (
      !normalized
    ) {

      return false;

    }


    const user =
      await userRepository.findOne({

        where: {

          phone:
            normalized

        }

      });


    return Boolean(
      user
    );

  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {

    getById,

    getByUsername,

    getByEmail,

    getByPhone,

    list,

    search,

    create,

    update,

    changeStatus,

    remove,

    isOwner,

    requireOwnership,

    getPublicProfile,

    updateLastSeen,

    existsByUsername,

    existsByEmail,

    existsByPhone,

    sanitizeUser

  };

}


// ============================================================
// Exports
// ============================================================

module.exports = {

  UserServiceError,

  createUserService,

  userNotFound,

  repositoryUnavailable,

  normalizeUserId,

  normalizeText,

  sanitizeUser,

  SENSITIVE_FIELDS

};
