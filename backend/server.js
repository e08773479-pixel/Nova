"use strict";

/**
 * NOVA Backend Server
 * ---------------------------------------------------------
 * نقطة تشغيل الخادم الرئيسية.
 *
 * المسؤوليات:
 * - تشغيل HTTP Server
 * - تحميل تطبيق NOVA
 * - قراءة إعدادات البيئة
 * - تجهيز الإغلاق الآمن
 *
 * لا توجد هنا قاعدة بيانات أو بيانات وهمية.
 */

require("dotenv").config();

const http = require("http");
const app = require("./app");


// =========================================================
// Configuration
// =========================================================

const PORT = Number(process.env.PORT) || 3000;

const HOST = process.env.HOST || "0.0.0.0";

const NODE_ENV =
  process.env.NODE_ENV || "development";


// =========================================================
// Create HTTP Server
// =========================================================

const server = http.createServer(app);


// =========================================================
// Start Server
// =========================================================

server.listen(PORT, HOST, () => {

  console.log("");
  console.log("==========================================");
  console.log("              NOVA BACKEND");
  console.log("==========================================");
  console.log(`Environment : ${NODE_ENV}`);
  console.log(`Host        : ${HOST}`);
  console.log(`Port        : ${PORT}`);
  console.log(`API         : /api/v1`);
  console.log("Database    : not connected");
  console.log("Realtime    : not connected");
  console.log("==========================================");
  console.log("");

});


// =========================================================
// Graceful Shutdown
// =========================================================

function shutdown(signal) {

  console.log(
    `[NOVA] Received ${signal}. Shutting down...`
  );

  server.close((error) => {

    if (error) {

      console.error(
        "[NOVA] Server shutdown error:",
        error
      );

      process.exit(1);

    }

    console.log("[NOVA] Server stopped.");

    process.exit(0);

  });

}


// =========================================================
// Process Signals
// =========================================================

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);


// =========================================================
// Unexpected Errors
// =========================================================

process.on("uncaughtException", (error) => {

  console.error(
    "[NOVA] Uncaught exception:",
    error
  );

  shutdown("uncaughtException");

});


process.on("unhandledRejection", (reason) => {

  console.error(
    "[NOVA] Unhandled rejection:",
    reason
  );

});
