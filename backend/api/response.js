"use strict";

/**
 * NOVA — API Response Utilities
 * ---------------------------------------------------------
 * توحيد شكل جميع استجابات الـAPI.
 *
 * الهدف:
 * - شكل موحد للنجاح
 * - شكل موحد للأخطاء
 * - Pagination موحدة
 * - Request ID موحد
 *
 * لا توجد بيانات وهمية.
 * لا يوجد اتصال بقاعدة البيانات هنا.
 */


// ============================================================
// Request ID
// ============================================================

function getRequestId(req) {

  return (
    req?.nova?.requestId ||
    req?.headers?.["x-request-id"] ||
    null
  );

}


// ============================================================
// Success Response
// ============================================================

function success(

  res,

  data = null,

  options = {}

) {

  const {

    statusCode = 200,

    message = null,

    meta = null

  } = options;


  const response = {

    success: true,

    data,

    message,

    meta,

    requestId:
      getRequestId(
        res.req
      )

  };


  return res
    .status(statusCode)
    .json(response);

}


// ============================================================
// Created Response
// ============================================================

function created(

  res,

  data = null,

  options = {}

) {

  return success(

    res,

    data,

    {

      ...options,

      statusCode: 201

    }

  );

}


// ============================================================
// No Content
// ============================================================

function noContent(res) {

  return res
    .status(204)
    .send();

}


// ============================================================
// Error Response
// ============================================================

function error(

  res,

  options = {}

) {

  const {

    statusCode = 500,

    code = "INTERNAL_SERVER_ERROR",

    message = "حدث خطأ داخلي في الخادم.",

    details = null

  } = options;


  return res
    .status(statusCode)
    .json({

      success: false,

      error: {

        code,

        message,

        details

      },

      requestId:
        getRequestId(
          res.req
        )

    });

}


// ============================================================
// Bad Request
// ============================================================

function badRequest(

  res,

  message = "الطلب غير صالح.",

  details = null

) {

  return error(

    res,

    {

      statusCode: 400,

      code: "BAD_REQUEST",

      message,

      details

    }

  );

}


// ============================================================
// Unauthorized
// ============================================================

function unauthorized(

  res,

  message = "يجب تسجيل الدخول أولًا."

) {

  return error(

    res,

    {

      statusCode: 401,

      code: "UNAUTHORIZED",

      message

    }

  );

}


// ============================================================
// Forbidden
// ============================================================

function forbidden(

  res,

  message = "ليس لديك صلاحية لتنفيذ هذا الإجراء."

) {

  return error(

    res,

    {

      statusCode: 403,

      code: "FORBIDDEN",

      message

    }

  );

}


// ============================================================
// Not Found
// ============================================================

function notFound(

  res,

  message = "العنصر المطلوب غير موجود."

) {

  return error(

    res,

    {

      statusCode: 404,

      code: "NOT_FOUND",

      message

    }

  );

}


// ============================================================
// Conflict
// ============================================================

function conflict(

  res,

  message = "حدث تعارض في البيانات."

) {

  return error(

    res,

    {

      statusCode: 409,

      code: "CONFLICT",

      message

    }

  );

}


// ============================================================
// Validation Error
// ============================================================

function validationError(

  res,

  details = null,

  message = "بيانات الطلب غير صالحة."

) {

  return error(

    res,

    {

      statusCode: 422,

      code: "VALIDATION_ERROR",

      message,

      details

    }

  );

}


// ============================================================
// Pagination
// ============================================================

function paginationMeta({

  page = 1,

  limit = 20,

  total = 0

} = {}) {

  const safePage =
    Math.max(
      1,
      Number(page) || 1
    );

  const safeLimit =
    Math.max(
      1,
      Number(limit) || 20
    );

  const safeTotal =
    Math.max(
      0,
      Number(total) || 0
    );

  const totalPages =
    Math.ceil(
      safeTotal /
      safeLimit
    );


  return {

    page: safePage,

    limit: safeLimit,

    total: safeTotal,

    totalPages,

    hasNextPage:
      safePage < totalPages,

    hasPreviousPage:
      safePage > 1

  };

}


// ============================================================
// Paginated Response
// ============================================================

function paginated(

  res,

  data = [],

  pagination = {},

  options = {}

) {

  return success(

    res,

    data,

    {

      ...options,

      meta: {

        ...(options.meta || {}),

        pagination:
          paginationMeta(
            pagination
          )

      }

    }

  );

}


// ============================================================
// Export
// ============================================================

module.exports = {

  success,

  created,

  noContent,

  error,

  badRequest,

  unauthorized,

  forbidden,

  notFound,

  conflict,

  validationError,

  paginationMeta,

  paginated

};
