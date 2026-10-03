"use strict";

require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");

// ============================================================
// NOVA — MASTER BACKEND BOOTSTRAP
// ============================================================

const CONFIG = Object.freeze({
  name: "NOVA",
  version: process.env.API_VERSION || "v1",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),

  appwrite: {
    endpoint:
      process.env.APPWRITE_ENDPOINT ||
      "https://fra.cloud.appwrite.io/v1",

    projectId:
      process.env.APPWRITE_PROJECT_ID ||
      "6ac17816000ffd3616a2",

    apiKey:
      process.env.APPWRITE_API_KEY || "",

    databaseId:
      process.env.APPWRITE_DATABASE_ID || "",

    databaseName:
      process.env.APPWRITE_DATABASE_NAME ||
      "NOVA Database"
  }
});


// ============================================================
// LOGGING
// ============================================================

function log(message, data = "") {
  console.log(`[NOVA] ${message}`, data);
}

function fatal(error) {
  console.error("\n[NOVA] BACKEND START FAILED");
  console.error(error?.message || error);
  process.exit(1);
}


// ============================================================
// APPWRITE CLIENT
// ============================================================

async function appwriteRequest(method, route, body) {

  if (!CONFIG.appwrite.apiKey) {
    throw new Error(
      "APPWRITE_API_KEY غير موجود في backend/.env"
    );
  }

  const response = await fetch(
    `${CONFIG.appwrite.endpoint}${route}`,
    {
      method,

      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Appwrite-Project":
          CONFIG.appwrite.projectId,
        "X-Appwrite-Key":
          CONFIG.appwrite.apiKey
      },

      body:
        body === undefined
          ? undefined
          : JSON.stringify(body)
    }
  );

  const raw = await response.text();

  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      `Appwrite HTTP ${response.status}`
    );

    error.status = response.status;
    error.code =
      data?.type ||
      `APPWRITE_${response.status}`;

    throw error;
  }

  return data;
}


// ============================================================
// DATABASE
// ============================================================

async function getOrFindDatabase() {

  if (CONFIG.appwrite.databaseId) {
    return CONFIG.appwrite.databaseId;
  }

  const result =
    await appwriteRequest(
      "GET",
      "/tablesdb?limit=100"
    );

  const databases =
    Array.isArray(result?.databases)
      ? result.databases
      : [];

  const database =
    databases.find(
      item =>
        item.name ===
        CONFIG.appwrite.databaseName
    );

  if (!database?.$id) {
    throw new Error(
      `لم يتم العثور على قاعدة "${CONFIG.appwrite.databaseName}".`
    );
  }

  return database.$id;
}


// ============================================================
// NOVA TABLE DEFINITIONS
// ============================================================

const TABLES = [

  ["users", "Users"],
  ["profiles", "Profiles"],
  ["contacts", "Contacts"],

  ["conversations", "Conversations"],
  ["conversation_members", "Conversation Members"],
  ["messages", "Messages"],
  ["attachments", "Attachments"],

  ["groups", "Groups"],
  ["group_members", "Group Members"],

  ["communities", "Communities"],
  ["community_members", "Community Members"],

  ["statuses", "Statuses"],
  ["status_views", "Status Views"],

  ["calls", "Calls"],
  ["call_participants", "Call Participants"],

  ["notifications", "Notifications"],
  ["devices", "Devices"],

  ["privacy_settings", "Privacy Settings"],
  ["security_settings", "Security Settings"],
  ["security_events", "Security Events"],

  ["sessions", "Sessions"],
  ["verification_tokens", "Verification Tokens"]
];


// ============================================================
// CREATE / VERIFY TABLES
// ============================================================

async function ensureTables(databaseId) {

  const result =
    await appwriteRequest(
      "GET",
      `/tablesdb/${encodeURIComponent(
        databaseId
      )}/tables?limit=100`
    );

  const existing =
    new Set(
      (result.tables || [])
        .map(table => table.$id)
    );

  for (const [id, name] of TABLES) {

    if (existing.has(id)) {

      log(`Table OK: ${id}`);

      continue;
    }

    log(`Creating table: ${id}`);

    await appwriteRequest(
      "POST",
      `/tablesdb/${encodeURIComponent(
        databaseId
      )}/tables`,
      {
        tableId: id,
        name,
        enabled: true,
        rowSecurity: true,
        permissions: []
      }
    );

    log(`Table CREATED: ${id}`);
  }
}


// ============================================================
// LOAD EXPRESS APP
// ============================================================

function loadApplication() {

  const appPath =
    path.join(__dirname, "app.js");

  const app =
    require(appPath);

  if (!app) {
    throw new Error(
      "backend/app.js لم يُرجع Express application."
    );
  }

  return app;
}


// ============================================================
// MASTER STATUS
// ============================================================

function attachMasterRoutes(app, runtime) {

  app.get(
    "/nova/status",
    async (req, res) => {

      res.json({
        success: true,

        application: {
          name: CONFIG.name,
          version: CONFIG.version,
          status: "online"
        },

        backend: {
          status: "running"
        },

        database: {
          provider: "appwrite",
          status: "connected",
          databaseId:
            runtime.databaseId
        },

        timestamp:
          new Date().toISOString()
      });
    }
  );


  app.get(
    "/nova",
    (req, res) => {

      res.json({
        success: true,
        name: "NOVA",
        message: "NOVA Backend is running.",
        api:
          `/api/${CONFIG.version}`,
        status: "online"
      });

    }
  );
}


// ============================================================
// INTERNAL MODULE CHECK
// ============================================================

function checkModules() {

  const modules = {

    database:
      "./database",

    services:
      "./services",

    controllers:
      "./controllers",

    middleware:
      "./middleware",

    api:
      "./api"
  };

  const result = {};

  for (const [name, modulePath] of
    Object.entries(modules)) {

    try {

      require(
        path.join(
          __dirname,
          modulePath
        )
      );

      result[name] = "loaded";

    } catch (error) {

      result[name] = {
        status: "error",
        message: error.message
      };

    }
  }

  return result;
}


// ============================================================
// START
// ============================================================

async function start() {

  log("======================================");
  log("NOVA MASTER BACKEND");
  log("======================================");

  if (!CONFIG.appwrite.apiKey) {

    throw new Error(
      "ضع APPWRITE_API_KEY في backend/.env أولًا."
    );
  }


  // ----------------------------------------------------------
  // 1. Appwrite
  // ----------------------------------------------------------

  log("Connecting to Appwrite...");

  const databaseId =
    await getOrFindDatabase();

  log(
    `Database detected: ${databaseId}`
  );


  // ----------------------------------------------------------
  // 2. Verify Database
  // ----------------------------------------------------------

  await appwriteRequest(
    "GET",
    `/tablesdb/${encodeURIComponent(
      databaseId
    )}`
  );

  log("Database connection OK");


  // ----------------------------------------------------------
  // 3. Prepare Tables
  // ----------------------------------------------------------

  log("Preparing NOVA tables...");

  await ensureTables(
    databaseId
  );

  log("Tables layer ready");


  // ----------------------------------------------------------
  // 4. Load Backend Modules
  // ----------------------------------------------------------

  const moduleStatus =
    checkModules();

  log(
    "Backend modules loaded."
  );


  // ----------------------------------------------------------
  // 5. Load Express
  // ----------------------------------------------------------

  const app =
    loadApplication();


  // ----------------------------------------------------------
  // 6. Runtime
  // ----------------------------------------------------------

  const runtime = {

    name: CONFIG.name,

    version: CONFIG.version,

    databaseId,

    provider: "appwrite",

    startedAt:
      new Date().toISOString(),

    modules:
      moduleStatus

  };


  global.NOVA_RUNTIME =
    runtime;


  // ----------------------------------------------------------
  // 7. Master Routes
  // ----------------------------------------------------------

  attachMasterRoutes(
    app,
    runtime
  );


  // ----------------------------------------------------------
  // 8. HTTP Server
  // ----------------------------------------------------------

  const server =
    http.createServer(app);


  server.listen(
    CONFIG.port,
    CONFIG.host,
    () => {

      console.log("");
      console.log(
        "======================================"
      );

      console.log(
        "        NOVA BACKEND ONLINE"
      );

      console.log(
        "======================================"
      );

      console.log(
        `API     : http://localhost:${CONFIG.port}/api/${CONFIG.version}`
      );

      console.log(
        `Status  : http://localhost:${CONFIG.port}/nova/status`
      );

      console.log(
        `Appwrite: ${CONFIG.appwrite.endpoint}`
      );

      console.log(
        `Database: ${databaseId}`
      );

      console.log(
        "======================================"
      );

    }
  );


  // ----------------------------------------------------------
  // 9. Graceful Shutdown
  // ----------------------------------------------------------

  async function shutdown(signal) {

    log(
      `${signal} received. Closing server...`
    );

    server.close(
      () => {

        log(
          "NOVA backend stopped."
        );

        process.exit(0);

      }
    );

  }


  process.once(
    "SIGINT",
    () => shutdown("SIGINT")
  );

  process.once(
    "SIGTERM",
    () => shutdown("SIGTERM")
  );


  return server;
}


// ============================================================
// RUN
// ============================================================

if (
  require.main === module
) {

  start().catch(fatal);

}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  CONFIG,
  start,
  appwriteRequest,
  getOrFindDatabase,
  ensureTables
};
