"use strict";

/**
 * NOVA — Authentication Service
 * =========================================================
 *
 * مسؤول عن منطق المصادقة فقط.
 *
 * لا يحتوي على:
 * - بيانات مستخدمين وهمية
 * - كلمات مرور حقيقية
 * - JWT secrets
 * - اتصال مباشر بقاعدة البيانات
 * - Express request/response logic
 *
 * يعتمد على Repository / Adapter يتم حقنه من الخارج.
 *
 * الهدف:
 * فصل منطق Authentication عن:
 *   Controller
 *        ↓
 *   Service
 *        ↓
 *   Repository
 *        ↓
 *   Database
 */


// ============================================================
// Errors
// ============================================================

class AuthenticationServiceError extends Error {

  constructor(
    code,
    message,
    statusCode = 400,
    details = null
  ) {

    super(message);

    this.name =
      "AuthenticationServiceError";

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


// ============================================================
// Error Helpers
// ============================================================

function invalidCredentials() {

  return new AuthenticationServiceError(
    "INVALID_CREDENTIALS",
    "بيانات تسجيل الدخول غير صحيحة.",
    401
  );

}


function accountNotFound() {

  return new AuthenticationServiceError(
    "ACCOUNT_NOT_FOUND",
    "الحساب غير موجود.",
    404
  );

}


function accountDisabled() {

  return new AuthenticationServiceError(
    "ACCOUNT_DISABLED",
    "هذا الحساب غير متاح حاليًا.",
    403
  );

}


function verificationRequired() {

  return new AuthenticationServiceError(
    "VERIFICATION_REQUIRED",
    "يجب تأكيد الحساب قبل المتابعة.",
    403
  );

}


function serviceDependencyError(
  dependency
) {

  return new AuthenticationServiceError(
    "SERVICE_DEPENDENCY_NOT_CONFIGURED",
    `خدمة ${dependency} غير مهيأة.`,
    503
  );

}


// ============================================================
// Validation Helpers
// ============================================================

function normalizeIdentifier(
  identifier
) {

  if (
    typeof identifier !==
    "string"
  ) {

    throw new AuthenticationServiceError(
      "INVALID_IDENTIFIER",
      "معرّف الحساب غير صالح.",
      400
    );

  }


  const value =
    identifier.trim();


  if (
    value.length === 0
  ) {

    throw new AuthenticationServiceError(
      "INVALID_IDENTIFIER",
      "معرّف الحساب مطلوب.",
      400
    );

  }


  return value;

}


function normalizeEmail(
  email
) {

  const value =
    normalizeIdentifier(
      email
    ).toLowerCase();


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(value)
  ) {

    throw new AuthenticationServiceError(
      "INVALID_EMAIL",
      "البريد الإلكتروني غير صالح.",
      400
    );

  }


  return value;

}


function validatePassword(
  password
) {

  if (
    typeof password !==
    "string"
  ) {

    throw new AuthenticationServiceError(
      "INVALID_PASSWORD",
      "كلمة المرور غير صالحة.",
      400
    );

  }


  if (
    password.length === 0
  ) {

    throw new AuthenticationServiceError(
      "INVALID_PASSWORD",
      "كلمة المرور مطلوبة.",
      400
    );

  }


  return password;

}


// ============================================================
// User State
// ============================================================

function isAccountDisabled(
  user
) {

  return (
    user?.disabled === true ||
    user?.status === "disabled" ||
    user?.status === "suspended" ||
    user?.isActive === false
  );

}


function requiresVerification(
  user
) {

  return (
    user?.verificationRequired === true ||
    (
      user?.emailVerified === false &&
      user?.requireEmailVerification === true
    ) ||
    (
      user?.phoneVerified === false &&
      user?.requirePhoneVerification === true
    )
  );

}


// ============================================================
// Safe User
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


  /*
   * Never expose credential material.
   */

  delete safeUser.password;

  delete safeUser.passwordHash;

  delete safeUser.passwordDigest;

  delete safeUser.refreshToken;

  delete safeUser.refreshTokenHash;

  delete safeUser.accessToken;

  delete safeUser.secret;

  delete safeUser.privateKey;


  return safeUser;

}


// ============================================================
// Service Factory
// ============================================================

function createAuthService(
  dependencies = {}
) {

  const {

    userRepository = null,

    passwordService = null,

    tokenService = null,

    verificationService = null,

    sessionService = null,

    clock = () => new Date()

  } = dependencies;


  /*
   * ----------------------------------------------------------
   * Repository
   * ----------------------------------------------------------
   */

  function requireUserRepository() {

    if (
      !userRepository ||
      typeof userRepository.findOne !==
      "function"
    ) {

      throw serviceDependencyError(
        "User Repository"
      );

    }

  }


  /*
   * ----------------------------------------------------------
   * Password Service
   * ----------------------------------------------------------
   */

  function requirePasswordService() {

    if (
      !passwordService ||
      typeof passwordService.verify !==
      "function"
    ) {

      throw serviceDependencyError(
        "Password Service"
      );

    }

  }


  /*
   * ----------------------------------------------------------
   * Token Service
   * ----------------------------------------------------------
   */

  function requireTokenService() {

    if (
      !tokenService ||
      typeof tokenService.createAccessToken !==
      "function"
    ) {

      throw serviceDependencyError(
        "Token Service"
      );

    }

  }


  // ==========================================================
  // Find User
  // ==========================================================

  async function findUserByIdentifier(
    identifier
  ) {

    requireUserRepository();


    const normalized =
      normalizeIdentifier(
        identifier
      );


    /*
     * Repository decides how the actual
     * database lookup works.
     *
     * No database driver is assumed here.
     */

    const user =
      await userRepository.findOne({

        where: {

          identifier:
            normalized

        }

      });


    return user || null;

  }


  // ==========================================================
  // Find User By Email
  // ==========================================================

  async function findUserByEmail(
    email
  ) {

    requireUserRepository();


    const normalized =
      normalizeEmail(
        email
      );


    const user =
      await userRepository.findOne({

        where: {

          email:
            normalized

        }

      });


    return user || null;

  }


  // ==========================================================
  // Find User By ID
  // ==========================================================

  async function findUserById(
    userId
  ) {

    requireUserRepository();


    if (
      userId === null ||
      userId === undefined ||
      String(userId).trim() === ""
    ) {

      throw new AuthenticationServiceError(
        "INVALID_USER_ID",
        "معرّف المستخدم غير صالح.",
        400
      );

    }


    const user =
      await userRepository.findOne({

        where: {

          id:
            userId

        }

      });


    return user || null;

  }


  // ==========================================================
  // Verify Password
  // ==========================================================

  async function verifyPassword(
    password,
    passwordHash
  ) {

    requirePasswordService();


    const normalizedPassword =
      validatePassword(
        password
      );


    if (
      typeof passwordHash !==
      "string" ||
      passwordHash.length === 0
    ) {

      /*
       * Never reveal whether the account
       * has a stored credential.
       */

      throw invalidCredentials();

    }


    const valid =
      await passwordService.verify(
        normalizedPassword,
        passwordHash
      );


    if (
      valid !== true
    ) {

      throw invalidCredentials();

    }


    return true;

  }


  // ==========================================================
  // Login
  // ==========================================================

  async function login(
    credentials = {},
    options = {}
  ) {

    const {

      identifier,

      email,

      password

    } =
      credentials;


    const loginIdentifier =
      email ||
      identifier;


    if (
      !loginIdentifier
    ) {

      throw new AuthenticationServiceError(
        "IDENTIFIER_REQUIRED",
        "البريد الإلكتروني أو معرّف الحساب مطلوب.",
        400
      );

    }


    validatePassword(
      password
    );


    /*
     * Avoid exposing which part of the
     * credentials was incorrect.
     */

    const user =
      email
        ? await findUserByEmail(
            email
          )
        : await findUserByIdentifier(
            identifier
          );


    if (
      !user
    ) {

      throw invalidCredentials();

    }


    if (
      isAccountDisabled(
        user
      )
    ) {

      throw accountDisabled();

    }


    if (
      requiresVerification(
        user
      ) &&
      options.allowUnverified !== true
    ) {

      throw verificationRequired();

    }


    const passwordHash =
      user.passwordHash ||
      user.passwordDigest;


    await verifyPassword(
      password,
      passwordHash
    );


    requireTokenService();


    const tokenPayload = {

      sub:
        user.id,

      type:
        "access"

    };


    /*
     * Token service owns signing,
     * expiry and secret management.
     */

    const accessToken =
      await tokenService.createAccessToken(
        tokenPayload
      );


    let session =
      null;


    if (
      sessionService &&
      typeof sessionService.create ===
      "function"
    ) {

      session =
        await sessionService.create({

          userId:
            user.id,

          createdAt:
            clock(),

          metadata:
            options.metadata || null

        });

    }


    return {

      user:
        sanitizeUser(
          user
        ),

      accessToken,

      session

    };

  }


  // ==========================================================
  // Register
  // ==========================================================

  async function register(
    input = {},
    options = {}
  ) {

    requireUserRepository();


    const {

      email,

      phone,

      password,

      displayName,

      username

    } =
      input;


    /*
     * Registration requires a password
     * service capable of creating a secure hash.
     */

    if (
      !passwordService ||
      typeof passwordService.hash !==
      "function"
    ) {

      throw serviceDependencyError(
        "Password Service"
      );

    }


    const normalizedEmail =
      email
        ? normalizeEmail(
            email
          )
        : null;


    const normalizedPhone =
      phone
        ? normalizeIdentifier(
            phone
          )
        : null;


    if (
      !normalizedEmail &&
      !normalizedPhone
    ) {

      throw new AuthenticationServiceError(
        "CONTACT_REQUIRED",
        "البريد الإلكتروني أو رقم الهاتف مطلوب.",
        400
      );

    }


    validatePassword(
      password
    );


    /*
     * Check existing account using repository.
     */

    if (
      normalizedEmail
    ) {

      const existingEmail =
        await userRepository.findOne({

          where: {

            email:
              normalizedEmail

          }

        });


      if (
        existingEmail
      ) {

        throw new AuthenticationServiceError(
          "EMAIL_ALREADY_EXISTS",
          "البريد الإلكتروني مستخدم بالفعل.",
          409
        );

      }

    }


    if (
      normalizedPhone
    ) {

      const existingPhone =
        await userRepository.findOne({

          where: {

            phone:
              normalizedPhone

          }

        });


      if (
        existingPhone
      ) {

        throw new AuthenticationServiceError(
          "PHONE_ALREADY_EXISTS",
          "رقم الهاتف مستخدم بالفعل.",
          409
        );

      }

    }


    const passwordHash =
      await passwordService.hash(
        password
      );


    const userData = {

      email:
        normalizedEmail,

      phone:
        normalizedPhone,

      passwordHash,

      displayName:
        displayName || null,

      username:
        username || null,

      status:
        "active",

      createdAt:
        clock(),

      updatedAt:
        clock()

    };


    /*
     * The repository is responsible for
     * persistence through the configured
     * database layer.
     */

    const createdUser =
      await userRepository.create(
        userData
      );


    if (
      !createdUser
    ) {

      throw new AuthenticationServiceError(
        "REGISTRATION_FAILED",
        "تعذر إنشاء الحساب.",
        500
      );

    }


    let verification =
      null;


    if (
      verificationService &&
      typeof verificationService.create ===
      "function"
    ) {

      verification =
        await verificationService.create({

          userId:
            createdUser.id,

          email:
            normalizedEmail,

          phone:
            normalizedPhone,

          channel:
            options.verificationChannel ||
            null

        });

    }


    return {

      user:
        sanitizeUser(
          createdUser
        ),

      verification

    };

  }


  // ==========================================================
  // Logout
  // ==========================================================

  async function logout(
    context = {}
  ) {

    const {

      sessionId,

      refreshToken

    } =
      context;


    if (
      sessionService &&
      typeof sessionService.destroy ===
      "function" &&
      sessionId
    ) {

      await sessionService.destroy(
        sessionId
      );

    }


    if (
      sessionService &&
      typeof sessionService.revokeRefreshToken ===
      "function" &&
      refreshToken
    ) {

      await sessionService.revokeRefreshToken(
        refreshToken
      );

    }


    return {

      success:
        true

    };

  }


  // ==========================================================
  // Verify Account
  // ==========================================================

  async function verifyAccount(
    input = {}
  ) {

    if (
      !verificationService ||
      typeof verificationService.verify !==
      "function"
    ) {

      throw serviceDependencyError(
        "Verification Service"
      );

    }


    const result =
      await verificationService.verify(
        input
      );


    return result;

  }


  // ==========================================================
  // Refresh Access Token
  // ==========================================================

  async function refreshAccessToken(
    refreshToken
  ) {

    requireTokenService();


    if (
      typeof refreshToken !==
      "string" ||
      refreshToken.trim() === ""
    ) {

      throw new AuthenticationServiceError(
        "REFRESH_TOKEN_REQUIRED",
        "رمز التجديد مطلوب.",
        401
      );

    }


    if (
      typeof tokenService.refresh !==
      "function"
    ) {

      throw serviceDependencyError(
        "Token Refresh Service"
      );

    }


    return tokenService.refresh(
      refreshToken
    );

  }


  // ==========================================================
  // Change Password
  // ==========================================================

  async function changePassword(
    userId,
    currentPassword,
    newPassword
  ) {

    requireUserRepository();

    requirePasswordService();


    const user =
      await findUserById(
        userId
      );


    if (
      !user
    ) {

      throw accountNotFound();

    }


    const currentHash =
      user.passwordHash ||
      user.passwordDigest;


    await verifyPassword(
      currentPassword,
      currentHash
    );


    validatePassword(
      newPassword
    );


    if (
      newPassword ===
      currentPassword
    ) {

      throw new AuthenticationServiceError(
        "PASSWORD_UNCHANGED",
        "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
        400
      );

    }


    if (
      typeof passwordService.hash !==
      "function"
    ) {

      throw serviceDependencyError(
        "Password Service"
      );

    }


    const newHash =
      await passwordService.hash(
        newPassword
      );


    if (
      typeof userRepository.update !==
      "function"
    ) {

      throw serviceDependencyError(
        "User Repository Update"
      );

    }


    const updatedUser =
      await userRepository.update(
        userId,
        {

          passwordHash:
            newHash,

          updatedAt:
            clock()

        }
      );


    /*
     * Revoke active sessions when possible.
     */

    if (
      sessionService &&
      typeof sessionService.revokeAllForUser ===
      "function"
    ) {

      await sessionService.revokeAllForUser(
        userId
      );

    }


    return {

      user:
        sanitizeUser(
          updatedUser ||
          user
        )

    };

  }


  // ==========================================================
  // Reset Password
  // ==========================================================

  async function resetPassword(
    input = {}
  ) {

    if (
      !verificationService ||
      typeof verificationService.consumePasswordReset !==
      "function"
    ) {

      throw serviceDependencyError(
        "Password Reset Service"
      );

    }


    requireUserRepository();

    requirePasswordService();


    const {

      token,

      newPassword

    } =
      input;


    validatePassword(
      newPassword
    );


    const resetRequest =
      await verificationService
        .consumePasswordReset(
          token
        );


    if (
      !resetRequest ||
      !resetRequest.userId
    ) {

      throw new AuthenticationServiceError(
        "INVALID_RESET_TOKEN",
        "رمز إعادة تعيين كلمة المرور غير صالح أو منتهي.",
        400
      );

    }


    const passwordHash =
      await passwordService.hash(
        newPassword
      );


    const updatedUser =
      await userRepository.update(
        resetRequest.userId,
        {

          passwordHash,

          updatedAt:
            clock()

        }
      );


    if (
      sessionService &&
      typeof sessionService.revokeAllForUser ===
      "function"
    ) {

      await sessionService.revokeAllForUser(
        resetRequest.userId
      );

    }


    return {

      user:
        sanitizeUser(
          updatedUser
        )

    };

  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {

    login,

    register,

    logout,

    verifyAccount,

    refreshAccessToken,

    changePassword,

    resetPassword,

    findUserByIdentifier,

    findUserByEmail,

    findUserById,

    verifyPassword,

    sanitizeUser

  };

}


// ============================================================
// Exports
// ============================================================

module.exports = {

  AuthenticationServiceError,

  createAuthService,

  invalidCredentials,

  accountNotFound,

  accountDisabled,

  verificationRequired,

  serviceDependencyError,

  normalizeIdentifier,

  normalizeEmail,

  validatePassword,

  isAccountDisabled,

  requiresVerification,

  sanitizeUser

};
