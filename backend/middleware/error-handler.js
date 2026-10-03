"use strict";

/**
 * NOVA — Global Error Handler
 * =========================================================
 *
 * المسؤول عن:
 * - توحيد أخطاء الـBackend.
 * - إخفاء التفاصيل الحساسة في Production.
 * - إرجاع Response موحد للـAPI.
 * - الحفاظ على Request ID لتسهيل تتبع الأخطاء.
 *
 * لا يعرض:
 * - كلمات مرور
 * - Secrets
 * - Database credentials
 * - Stack traces في Production
 */


// ============================================================
// HTTP Error
// ============================================================

class HttpError extends Error {

  constructor(
    statusCode,
    message,
    options = {}
  ) {

    super(message);


    this.name =
      "HttpError";


    this.statusCode =
      statusCode;


    this.code =
      options.code ||
      "HTTP_ERROR";


    this.details =
      options.details ||
      null;


    this.expose =
      options.expose !== false;


    Error.captureStackTrace?.(
      this,
      HttpError
    );

  }

}


// ============================================================
// Create HTTP Error
// ============================================================

function createHttpError(
  statusCode,
  message,
  options = {}
) {

  return new HttpError(
    statusCode,
    message,
    options
  );

}


// ============================================================
// Normalize Error
// ============================================================

function normalizeError(error) {

  if (
    error instanceof HttpError
  ) {

    return error;

  }


  if (
    error &&
    typeof error === "object"
  ) {

    const normalized =
      new Error(
        error.message ||
        "Internal server error."
      );


    normalized.name =
      error.name ||
      "Error";


    normalized.code =
      error.code ||
      "INTERNAL_ERROR";


    normalized.statusCode =
      Number.isInteger(
        error.statusCode
      )
        ? error.statusCode
        : 500;


    normalized.details =
      error.details ||
      null;


    normalized.expose =
      error.expose === true;


    normalized.stack =
      error.stack ||
      normalized.stack;


    return normalized;

  }


  return new HttpError(
    500,
    "Internal server error.",
    {
      code:
        "INTERNAL_ERROR",

      expose:
        false

    }
  );

}


// ============================================================
// Status Code Resolver
// ============================================================

function resolveStatusCode(
  error
) {

  const status =
    Number(
      error?.statusCode
    );


  if (
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  ) {

    return status;

  }


  return 500;

}


// ============================================================
// Public Message
// ============================================================

function resolvePublicMessage(
  error,
  statusCode,
  production
) {

  if (
    production &&
    statusCode >= 500
  ) {

    return "حدث خطأ داخلي في الخادم.";

  }


  if (
    error?.expose === false
  ) {

    if (
      statusCode >= 500
    ) {

      return "حدث خطأ داخلي في الخادم.";

    }

    return "تعذر تنفيذ الطلب.";

  }


  return (
    error?.message ||
    "تعذر تنفيذ الطلب."
  );

}


// ============================================================
// Error Response
// ============================================================

function buildErrorResponse(
  error,
  req,
  options = {}
) {

  const production =
    options.production === true;


  const normalized =
    normalizeError(
      error
    );


  const statusCode =
    resolveStatusCode(
      normalized
    );


  const requestId =
    req?.requestId ||
    req?.context?.requestId ||
    null;


  const response = {

    success: false,

    error: {

      code:
        normalized.code ||
        "INTERNAL_ERROR",

      message:
        resolvePublicMessage(
          normalized,
          statusCode,
          production
        )

    },

    requestId

  };


  if (
    normalized.details &&
    !(
      production &&
      statusCode >= 500
    )
  ) {

    response.error.details =
      normalized.details;

  }


  if (
    !production &&
    normalized.stack
  ) {

    response.error.stack =
      normalized.stack;

  }


  return response;

}


// ============================================================
// Global Error Middleware
// ============================================================

function errorHandler(options = {}) {

  const production =
    options.production !== undefined
      ? Boolean(
          options.production
        )
      : process.env.NODE_ENV ===
        "production";


  return function globalErrorHandler(
    error,
    req,
    res,
    next
  ) {

    /*
     * إذا كان Response بدأ بالفعل،
     * نترك Express يتولى إنهاء الاتصال.
     */

    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    const normalized =
      normalizeError(
        error
      );


    const statusCode =
      resolveStatusCode(
        normalized
      );


    const payload =
      buildErrorResponse(
        normalized,
        req,
        {
          production
        }
      );


    res
      .status(
        statusCode
      )
      .json(
        payload
      );

  };

}


// ============================================================
// Not Found Error
// ============================================================

function notFoundError(
  req
) {

  const error =
    new HttpError(
      404,
      "المسار المطلوب غير موجود.",
      {
        code:
          "ROUTE_NOT_FOUND"
      }
    );


  error.path =
    req?.originalUrl ||
    req?.url ||
    null;


  return error;

}


// ============================================================
// Async Handler
// ============================================================

function asyncHandler(
  handler
) {

  if (
    typeof handler !==
    "function"
  ) {

    throw new TypeError(
      "Async handler must be a function."
    );

  }


  return function wrappedHandler(
    req,
    res,
    next
  ) {

    Promise.resolve(
      handler(
        req,
        res,
        next
      )
    ).catch(
      next
    );

  };

}


// ============================================================
// Common Error Helpers
// ============================================================

function badRequest(
  message = "بيانات الطلب غير صحيحة.",
  details = null
) {

  return createHttpError(
    400,
    message,
    {
      code:
        "BAD_REQUEST",

      details
    }
  );

}


function unauthorized(
  message = "المصادقة مطلوبة."
) {

  return createHttpError(
    401,
    message,
    {
      code:
        "UNAUTHORIZED"
    }
  );

}


function forbidden(
  message = "غير مسموح بتنفيذ هذا الإجراء."
) {

  return createHttpError(
    403,
    message,
    {
      code:
        "FORBIDDEN"
    }
  );

}


function notFound(
  message = "المورد المطلوب غير موجود."
) {

  return createHttpError(
    404,
    message,
    {
      code:
        "NOT_FOUND"
    }
  );

}


function conflict(
  message = "يوجد تعارض في البيانات.",
  details = null
) {

  return createHttpError(
    409,
    message,
    {
      code:
        "CONFLICT",

      details
    }
  );

}


function validationError(
  message = "يرجى مراجعة البيانات المدخلة.",
  details = null
) {

  return createHttpError(
    422,
    message,
    {
      code:
        "VALIDATION_ERROR",

      details
    }
  );

}


// ============================================================
// Export
// ============================================================

module.exports = {

  HttpError,

  createHttpError,

  normalizeError,

  resolveStatusCode,

  buildErrorResponse,

  errorHandler,

  notFoundError,

  asyncHandler,

  badRequest,

  unauthorized,

  forbidden,

  notFound,

  conflict,

  validationError

};
