"use strict";

/**
 * NOVA — Authentication Middleware
 * =========================================================
 *
 * مسؤول عن:
 * - قراءة Access Token من الطلب.
 * - تجهيز طبقة Authentication مركزية.
 * - عدم إنشاء مستخدمين أو Sessions وهمية.
 * - عدم وضع JWT Secret داخل الكود.
 *
 * ملاحظة:
 * التحقق الفعلي من JWT سيتم ربطه بخدمة المصادقة
 * عندما يتم بناء Auth Service.
 */


// ============================================================
// Configuration
// ============================================================

const DEFAULT_HEADER =
  "authorization";

const DEFAULT_SCHEME =
  "Bearer";


// ============================================================
// Authentication Error
// ============================================================

function authenticationError(
  message = "المصادقة مطلوبة."
) {

  const error =
    new Error(
      message
    );

  error.code =
    "AUTHENTICATION_REQUIRED";

  error.statusCode =
    401;

  error.expose =
    true;

  return error;

}


// ============================================================
// Extract Authorization Header
// ============================================================

function getAuthorizationHeader(
  req
) {

  if (!req) {

    return null;

  }


  const value =
    req.get(
      DEFAULT_HEADER
    );


  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {

    return null;

  }


  return value.trim();

}


// ============================================================
// Extract Bearer Token
// ============================================================

function extractBearerToken(
  req
) {

  const header =
    getAuthorizationHeader(
      req
    );


  if (!header) {

    return null;

  }


  const parts =
    header.split(/\s+/);


  if (
    parts.length !== 2
  ) {

    return null;

  }


  const scheme =
    parts[0];


  const token =
    parts[1];


  if (
    scheme.toLowerCase() !==
    DEFAULT_SCHEME.toLowerCase()
  ) {

    return null;

  }


  if (
    !token ||
    token.length < 10
  ) {

    return null;

  }


  return token;

}


// ============================================================
// Token Verifier
// ============================================================

async function verifyToken(
  token,
  options = {}
) {

  if (
    typeof token !== "string" ||
    token.length === 0
  ) {

    throw authenticationError();

  }


  const verifier =
    options.verifyToken;


  if (
    typeof verifier !== "function"
  ) {

    const error =
      new Error(
        "Authentication verifier is not configured."
      );

    error.code =
      "AUTH_VERIFIER_NOT_CONFIGURED";

    error.statusCode =
      500;

    error.expose =
      false;

    throw error;

  }


  const identity =
    await verifier(
      token
    );


  if (
    !identity ||
    typeof identity !== "object"
  ) {

    throw authenticationError(
      "رمز المصادقة غير صالح."
    );

  }


  return identity;

}


// ============================================================
// Attach Identity
// ============================================================

function attachIdentity(
  req,
  identity
) {

  req.user =
    identity;


  req.auth = {

    authenticated: true,

    userId:
      identity.id ||
      identity.userId ||
      null,

    method:
      identity.authMethod ||
      "bearer"

  };


  return req;

}


// ============================================================
// Authentication Middleware
// ============================================================

function authenticate(options = {}) {

  const {

    verifyToken: verifier,

    optional = false,

    headerName =
      DEFAULT_HEADER,

    scheme =
      DEFAULT_SCHEME

  } = options;


  return async function authenticateMiddleware(
    req,
    res,
    next
  ) {

    try {

      const header =
        req.get(
          headerName
        );


      if (
        !header ||
        typeof header !== "string"
      ) {

        if (optional) {

          req.auth = {

            authenticated: false,

            userId: null,

            method: null

          };


          return next();

        }


        throw authenticationError();

      }


      const parts =
        header.trim()
          .split(/\s+/);


      if (
        parts.length !== 2 ||
        parts[0].toLowerCase() !==
          scheme.toLowerCase()
      ) {

        if (optional) {

          req.auth = {

            authenticated: false,

            userId: null,

            method: null

          };


          return next();

        }


        throw authenticationError(
          "صيغة المصادقة غير صحيحة."
        );

      }


      const token =
        parts[1];


      const identity =
        await verifyToken(
          token,
          {
            verifyToken:
              verifier
          }
        );


      attachIdentity(
        req,
        identity
      );


      next();

    } catch (error) {

      next(error);

    }

  };

}


// ============================================================
// Require Authenticated User
// ============================================================

function requireAuthenticatedUser(
  req
) {

  if (
    !req?.auth?.authenticated ||
    !req?.auth?.userId
  ) {

    throw authenticationError();

  }


  return req.user;

}


// ============================================================
// Get Current User
// ============================================================

function getCurrentUser(
  req
) {

  if (
    !req?.auth?.authenticated
  ) {

    return null;

  }


  return req.user ||
    null;

}


// ============================================================
// Get Current User ID
// ============================================================

function getCurrentUserId(
  req
) {

  return req?.auth?.userId ||
    req?.user?.id ||
    req?.user?.userId ||
    null;

}


// ============================================================
// Require User ID
// ============================================================

function requireUserId(
  req
) {

  const userId =
    getCurrentUserId(
      req
    );


  if (!userId) {

    throw authenticationError();

  }


  return userId;

}


// ============================================================
// Check Ownership
// ============================================================

function isCurrentUser(
  req,
  userId
) {

  const currentUserId =
    getCurrentUserId(
      req
    );


  if (
    currentUserId === null ||
    userId === null ||
    userId === undefined
  ) {

    return false;

  }


  return String(
    currentUserId
  ) === String(
    userId
  );

}


// ============================================================
// Require Ownership
// ============================================================

function requireOwnership(
  req,
  userId
) {

  if (
    !isCurrentUser(
      req,
      userId
    )
  ) {

    const error =
      new Error(
        "لا يمكنك الوصول إلى هذا المورد."
      );

    error.code =
      "RESOURCE_ACCESS_DENIED";

    error.statusCode =
      403;

    error.expose =
      true;

    throw error;

  }


  return true;

}


// ============================================================
// Clear Authentication
// ============================================================

function clearAuthentication(
  req
) {

  if (!req) {

    return;

  }


  delete req.user;

  delete req.auth;

}


// ============================================================
// Export
// ============================================================

module.exports = {

  authenticationError,

  getAuthorizationHeader,

  extractBearerToken,

  verifyToken,

  attachIdentity,

  authenticate,

  requireAuthenticatedUser,

  getCurrentUser,

  getCurrentUserId,

  requireUserId,

  isCurrentUser,

  requireOwnership,

  clearAuthentication

};
