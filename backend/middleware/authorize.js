"use strict";

/**
 * NOVA — Authorization Middleware
 * =========================================================
 *
 * Authentication ≠ Authorization
 *
 * Authentication:
 *    من هو المستخدم؟
 *
 * Authorization:
 *    ماذا يُسمح لهذا المستخدم أن يفعل؟
 *
 * هذا الملف مسؤول عن الصلاحيات فقط.
 *
 * لا يحتوي على:
 * - مستخدمين وهميين
 * - أدوار وهمية
 * - بيانات قاعدة بيانات
 * - Secrets
 *
 * يتم تمرير معلومات المستخدم والصلاحيات
 * من طبقة Authentication / Service الحقيقية.
 */


// ============================================================
// Authorization Error
// ============================================================

function authorizationError(
  message = "غير مسموح بتنفيذ هذا الإجراء."
) {

  const error =
    new Error(
      message
    );

  error.code =
    "FORBIDDEN";

  error.statusCode =
    403;

  error.expose =
    true;

  return error;

}


// ============================================================
// Normalize Permission
// ============================================================

function normalizePermission(
  permission
) {

  if (
    typeof permission !== "string"
  ) {

    const error =
      new TypeError(
        "Permission must be a string."
      );

    error.code =
      "INVALID_PERMISSION";

    throw error;

  }


  const normalized =
    permission.trim();


  if (
    normalized.length === 0
  ) {

    const error =
      new TypeError(
        "Permission cannot be empty."
      );

    error.code =
      "INVALID_PERMISSION";

    throw error;

  }


  return normalized;

}


// ============================================================
// Normalize Role
// ============================================================

function normalizeRole(
  role
) {

  if (
    typeof role !== "string"
  ) {

    const error =
      new TypeError(
        "Role must be a string."
      );

    error.code =
      "INVALID_ROLE";

    throw error;

  }


  const normalized =
    role.trim();


  if (
    normalized.length === 0
  ) {

    const error =
      new TypeError(
        "Role cannot be empty."
      );

    error.code =
      "INVALID_ROLE";

    throw error;

  }


  return normalized;

}


// ============================================================
// Extract Roles
// ============================================================

function getUserRoles(
  user
) {

  if (
    !user ||
    typeof user !== "object"
  ) {

    return [];

  }


  const source =
    Array.isArray(
      user.roles
    )
      ? user.roles
      : user.role
        ? [user.role]
        : [];


  return source
    .filter(
      role =>
        typeof role === "string"
    )
    .map(
      normalizeRole
    );

}


// ============================================================
// Extract Permissions
// ============================================================

function getUserPermissions(
  user
) {

  if (
    !user ||
    typeof user !== "object"
  ) {

    return [];

  }


  const source =
    Array.isArray(
      user.permissions
    )
      ? user.permissions
      : [];


  return source
    .filter(
      permission =>
        typeof permission ===
        "string"
    )
    .map(
      normalizePermission
    );

}


// ============================================================
// Has Role
// ============================================================

function hasRole(
  user,
  role
) {

  const requiredRole =
    normalizeRole(
      role
    );


  const roles =
    getUserRoles(
      user
    );


  return roles.includes(
    requiredRole
  );

}


// ============================================================
// Has Any Role
// ============================================================

function hasAnyRole(
  user,
  roles
) {

  if (
    !Array.isArray(roles) ||
    roles.length === 0
  ) {

    return false;

  }


  return roles.some(
    role =>
      hasRole(
        user,
        role
      )
  );

}


// ============================================================
// Has All Roles
// ============================================================

function hasAllRoles(
  user,
  roles
) {

  if (
    !Array.isArray(roles) ||
    roles.length === 0
  ) {

    return false;

  }


  return roles.every(
    role =>
      hasRole(
        user,
        role
      )
  );

}


// ============================================================
// Has Permission
// ============================================================

function hasPermission(
  user,
  permission
) {

  const requiredPermission =
    normalizePermission(
      permission
    );


  const permissions =
    getUserPermissions(
      user
    );


  return permissions.includes(
    requiredPermission
  );

}


// ============================================================
// Has Any Permission
// ============================================================

function hasAnyPermission(
  user,
  permissions
) {

  if (
    !Array.isArray(
      permissions
    ) ||
    permissions.length === 0
  ) {

    return false;

  }


  return permissions.some(
    permission =>
      hasPermission(
        user,
        permission
      )
  );

}


// ============================================================
// Has All Permissions
// ============================================================

function hasAllPermissions(
  user,
  permissions
) {

  if (
    !Array.isArray(
      permissions
    ) ||
    permissions.length === 0
  ) {

    return false;

  }


  return permissions.every(
    permission =>
      hasPermission(
        user,
        permission
      )
  );

}


// ============================================================
// Check Authorization
// ============================================================

function checkAuthorization(
  user,
  options = {}
) {

  const {

    roles = [],

    permissions = [],

    requireAllRoles = false,

    requireAllPermissions = false,

    allowOwner = false,

    ownerId = null

  } = options;


  const normalizedRoles =
    Array.isArray(roles)
      ? roles
      : [roles];


  const normalizedPermissions =
    Array.isArray(permissions)
      ? permissions
      : [permissions];


  const validRoles =
    normalizedRoles.filter(
      Boolean
    );


  const validPermissions =
    normalizedPermissions.filter(
      Boolean
    );


  /*
   * Owner check
   */

  if (
    allowOwner &&
    ownerId !== null &&
    ownerId !== undefined &&
    user
  ) {

    const currentUserId =
      user.id ||
      user.userId;


    if (
      currentUserId !== null &&
      currentUserId !== undefined &&
      String(
        currentUserId
      ) === String(
        ownerId
      )
    ) {

      return true;

    }

  }


  /*
   * Role check
   */

  if (
    validRoles.length > 0
  ) {

    const roleAllowed =
      requireAllRoles
        ? hasAllRoles(
            user,
            validRoles
          )
        : hasAnyRole(
            user,
            validRoles
          );


    if (!roleAllowed) {

      return false;

    }

  }


  /*
   * Permission check
   */

  if (
    validPermissions.length > 0
  ) {

    const permissionAllowed =
      requireAllPermissions
        ? hasAllPermissions(
            user,
            validPermissions
          )
        : hasAnyPermission(
            user,
            validPermissions
          );


    if (!permissionAllowed) {

      return false;

    }

  }


  /*
   * إذا لم يتم تحديد Roles أو Permissions،
   * فلا يتم منح صلاحية تلقائيًا.
   */

  if (
    validRoles.length === 0 &&
    validPermissions.length === 0 &&
    !allowOwner
  ) {

    return false;

  }


  return true;

}


// ============================================================
// Middleware
// ============================================================

function authorize(options = {}) {

  return function authorizationMiddleware(
    req,
    res,
    next
  ) {

    try {

      const user =
        req?.user;


      if (
        !user
      ) {

        throw authorizationError(
          "يجب تسجيل الدخول أولًا."
        );

      }


      const allowed =
        checkAuthorization(
          user,
          options
        );


      if (
        !allowed
      ) {

        throw authorizationError();

      }


      req.authorization = {

        authorized: true,

        roles:
          getUserRoles(
            user
          ),

        permissions:
          getUserPermissions(
            user
          )

      };


      next();

    } catch (error) {

      next(error);

    }

  };

}


// ============================================================
// Require Role
// ============================================================

function requireRole(
  role
) {

  return authorize({

    roles: [
      role
    ]

  });

}


// ============================================================
// Require Any Role
// ============================================================

function requireAnyRole(
  roles
) {

  return authorize({

    roles,

    requireAllRoles: false

  });

}


// ============================================================
// Require All Roles
// ============================================================

function requireAllRoles(
  roles
) {

  return authorize({

    roles,

    requireAllRoles: true

  });

}


// ============================================================
// Require Permission
// ============================================================

function requirePermission(
  permission
) {

  return authorize({

    permissions: [
      permission
    ]

  });

}


// ============================================================
// Require Any Permission
// ============================================================

function requireAnyPermission(
  permissions
) {

  return authorize({

    permissions,

    requireAllPermissions: false

  });

}


// ============================================================
// Require All Permissions
// ============================================================

function requireAllPermissions(
  permissions
) {

  return authorize({

    permissions,

    requireAllPermissions: true

  });

}


// ============================================================
// Require Owner Or Permission
// ============================================================

function requireOwnerOrPermission(
  getOwnerId,
  permission
) {

  if (
    typeof getOwnerId !==
    "function"
  ) {

    throw new TypeError(
      "getOwnerId must be a function."
    );

  }


  return function ownerOrPermissionMiddleware(
    req,
    res,
    next
  ) {

    try {

      const user =
        req?.user;


      if (
        !user
      ) {

        throw authorizationError(
          "يجب تسجيل الدخول أولًا."
        );

      }


      const ownerId =
        getOwnerId(
          req
        );


      const allowed =
        checkAuthorization(
          user,
          {

            allowOwner: true,

            ownerId,

            permissions: [
              permission
            ]

          }
        );


      if (
        !allowed
      ) {

        throw authorizationError();

      }


      req.authorization = {

        authorized: true,

        ownerOrPermission: true

      };


      next();

    } catch (error) {

      next(error);

    }

  };

}


// ============================================================
// Get Authorization Context
// ============================================================

function getAuthorizationContext(
  req
) {

  return req?.authorization ||
    null;

}


// ============================================================
// Export
// ============================================================

module.exports = {

  authorizationError,

  normalizePermission,

  normalizeRole,

  getUserRoles,

  getUserPermissions,

  hasRole,

  hasAnyRole,

  hasAllRoles,

  hasPermission,

  hasAnyPermission,

  hasAllPermissions,

  checkAuthorization,

  authorize,

  requireRole,

  requireAnyRole,

  requireAllRoles,

  requirePermission,

  requireAnyPermission,

  requireAllPermissions,

  requireOwnerOrPermission,

  getAuthorizationContext

};
