"use strict";

/**
 * NOVA Backend Application
 * ---------------------------------------------------------
 * مسؤول عن تجهيز Express Application قبل تشغيل السيرفر.
 *
 * server.js = تشغيل الخادم
 * app.js    = إعداد التطبيق
 *
 * لا توجد بيانات وهمية.
 * لا يوجد اتصال بقاعدة البيانات في هذه المرحلة.
 */

const express = require("express");

const api = require("./api");


// =========================================================
// Create Application
// =========================================================

const app = express();


// =========================================================
// Basic Application Configuration
// =========================================================

app.disable("x-powered-by");


// =========================================================
// Body Parsers
// =========================================================

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);


// =========================================================
// Request Metadata
// =========================================================

app.use((req, res, next) => {

  req.nova = {
    requestId:
      req.headers["x-request-id"] ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`
  };

  res.setHeader(
    "X-NOVA-Request-ID",
    req.nova.requestId
  );

  next();

});


// =========================================================
// Basic CORS
// =========================================================

app.use((req, res, next) => {

  const origin =
    process.env.CORS_ORIGIN || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID"
    ].join(", ")
  );

  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-NOVA-Request-ID"
  );

  if (req.method === "OPTIONS") {

    return res.status(204).end();

  }

  next();

});


// =========================================================
// Root Endpoint
// =========================================================

app.get("/", (req, res) => {

  res.status(200).json({
    success: true,
    name: "NOVA",
    service: "backend",
    status: "online"
  });

});


// =========================================================
// API
// =========================================================

app.use(
  `/api/${process.env.API_VERSION || "v1"}`,
  api
);


// =========================================================
// Global 404
// =========================================================

app.use((req, res) => {

  res.status(404).json({

    success: false,

    error: {
      code: "NOT_FOUND",
      message: "المسار المطلوب غير موجود."
    },

    requestId:
      req.nova?.requestId || null

  });

});


// =========================================================
// Global Error Handler
// =========================================================

app.use((error, req, res, next) => {

  console.error(
    "[NOVA] Application error:",
    error
  );

  const statusCode =
    Number(error.statusCode) >= 400 &&
    Number(error.statusCode) < 600
      ? Number(error.statusCode)
      : 500;

  const isProduction =
    process.env.NODE_ENV === "production";

  res.status(statusCode).json({

    success: false,

    error: {
      code:
        error.code ||
        "INTERNAL_SERVER_ERROR",

      message:
        isProduction
          ? "حدث خطأ داخلي في الخادم."
          : (
              error.message ||
              "حدث خطأ داخلي في الخادم."
            )
    },

    requestId:
      req.nova?.requestId || null

  });

});


// =========================================================
// Export
// =========================================================

module.exports = app;
