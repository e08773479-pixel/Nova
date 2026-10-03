// ============================================================
// NOVA — Central Database Entry Point
// File: backend/database/index.js
// ============================================================

"use strict";

/*
 * NOVA Database Layer
 *
 * Central gateway for the database system.
 *
 * Current provider:
 * - Appwrite TablesDB
 *
 * Important:
 * - No fake records.
 * - No mock users.
 * - No mock messages.
 * - No fake balances.
 * - API keys are NEVER stored in this file.
 *
 * Appwrite credentials are read from environment variables.
 */

// ============================================================
// Dependencies
// ============================================================

const database = require("./database");
const connection = require("./connection");
const adapterModule = require("./adapter");
const repositoryModule = require("./repository");
const schemaModule = require("./schema");
const migrationsModule = require("./migrations");


// ============================================================
// NOVA / Appwrite Configuration
// ============================================================

const DEFAULT_APPWRITE_ENDPOINT =
  "https://fra.cloud.appwrite.io/v1";

const DEFAULT_APPWRITE_PROJECT_ID =
  "6ac17816000ffd3616a2";

const DEFAULT_DATABASE_NAME =
  "NOVA Database";


// ============================================================
// Configuration
// ============================================================

function getConfig() {

  return {

    provider: "appwrite",

    endpoint:
      process.env.APPWRITE_ENDPOINT ||
      DEFAULT_APPWRITE_ENDPOINT,

    projectId:
      process.env.APPWRITE_PROJECT_ID ||
      DEFAULT_APPWRITE_PROJECT_ID,

    apiKey:
      process.env.APPWRITE_API_KEY ||
      "",

    databaseId:
      process.env.APPWRITE_DATABASE_ID ||
      "",

    databaseName:
      process.env.APPWRITE_DATABASE_NAME ||
      DEFAULT_DATABASE_NAME

  };

}


// ============================================================
// Validation
// ============================================================

function validateConfig(config = getConfig()) {

  const errors = [];

  if (!config.endpoint) {

    errors.push(
      "APPWRITE_ENDPOINT is required."
    );

  }

  if (!config.projectId) {

    errors.push(
      "APPWRITE_PROJECT_ID is required."
    );

  }

  if (!config.apiKey) {

    errors.push(
      "APPWRITE_API_KEY is required."
    );

  }

  return {

    valid: errors.length === 0,

    errors

  };

}


// ============================================================
// Adapter Factory
// ============================================================

function createAppwriteAdapter(config = getConfig()) {

  if (
    !adapterModule ||
    typeof adapterModule.createAdapter !== "function"
  ) {

    throw new Error(
      "APPWRITE_ADAPTER_FACTORY_NOT_FOUND"
    );

  }

  return adapterModule.createAdapter({

    endpoint: config.endpoint,

    projectId: config.projectId,

    apiKey: config.apiKey,

    databaseId: config.databaseId

  });

}


// ============================================================
// Configure Database Adapter
// ============================================================

function configureAdapter() {

  const config = getConfig();

  const validation =
    validateConfig(config);

  if (!validation.valid) {

    const error =
      new Error(
        validation.errors.join(" ")
      );

    error.code =
      "DATABASE_CONFIG_INVALID";

    throw error;

  }


  const adapter =
    createAppwriteAdapter(config);


  /*
   * Connect the Appwrite adapter to the
   * central database gateway when supported.
   */

  if (
    database &&
    typeof database.setAdapter === "function"
  ) {

    database.setAdapter(
      adapter,
      {

        driver: "appwrite",

        name: config.databaseName,

        version: "1.0.0"

      }
    );

  }


  return adapter;

}


// ============================================================
// Initialize Database
// ============================================================

async function initialize(options = {}) {

  const config = getConfig();

  const validation =
    validateConfig(config);

  if (!validation.valid) {

    const error =
      new Error(
        validation.errors.join(" ")
      );

    error.code =
      "DATABASE_CONFIG_INVALID";

    throw error;

  }


  const adapter =
    configureAdapter();


  /*
   * Appwrite connection is handled by the adapter.
   */

  if (
    typeof adapter.connect === "function"
  ) {

    await adapter.connect({

      endpoint: config.endpoint,

      projectId: config.projectId,

      apiKey: config.apiKey,

      databaseId: config.databaseId

    });

  }


  /*
   * Keep the existing central database lifecycle
   * synchronized when the gateway supports it.
   */

  let databaseState = null;

  if (
    database &&
    typeof database.initialize === "function"
  ) {

    try {

      databaseState =
        await database.initialize({

          enabled: true,

          driver: "appwrite",

          name: config.databaseName,

          version: "1.0.0",

          adapter,

          endpoint: config.endpoint,

          projectId: config.projectId,

          apiKey: config.apiKey,

          databaseId: config.databaseId

        });

    } catch (error) {

      /*
       * The adapter itself has already been connected.
       *
       * We don't hide a real Appwrite connection failure.
       */

      if (
        error &&
        error.code !==
          "DATABASE_ALREADY_INITIALIZED"
      ) {

        throw error;

      }

    }

  }


  /*
   * Initialize the logical migration registry.
   * This does NOT create fake database records.
   */

  let migrationState = null;

  if (
    migrationsModule &&
    typeof migrationsModule.initialize === "function"
  ) {

    migrationState =
      migrationsModule.initialize();

  }


  return {

    success: true,

    provider: "appwrite",

    connected: true,

    endpoint: config.endpoint,

    projectId: config.projectId,

    databaseId:
      config.databaseId || null,

    databaseName:
      config.databaseName,

    database:
      databaseState,

    migrations:
      migrationState

  };

}


// ============================================================
// Shutdown
// ============================================================

async function shutdown() {

  let result = null;


  if (
    connection &&
    typeof connection.disconnect === "function"
  ) {

    try {

      result =
        await connection.disconnect();

    } catch (error) {

      /*
       * The Appwrite adapter may already have
       * completed its shutdown lifecycle.
       */

      result = {

        success: false,

        error: error.message

      };

    }

  }


  if (
    database &&
    typeof database.disconnect === "function"
  ) {

    try {

      await database.disconnect();

    } catch (error) {

      /*
       * Nothing fake is created here and the
       * shutdown error is intentionally ignored
       * after the primary disconnect attempt.
       */

    }

  }


  return {

    success: true,

    result

  };

}


// ============================================================
// Status
// ============================================================

function getStatus() {

  let databaseStatus = null;

  let connectionStatus = null;


  if (
    database &&
    typeof database.getStatus === "function"
  ) {

    databaseStatus =
      database.getStatus();

  }


  if (
    connection &&
    typeof connection.getState === "function"
  ) {

    connectionStatus =
      connection.getState();

  }


  const config = getConfig();


  return {

    provider: "appwrite",

    configured:
      Boolean(
        config.endpoint &&
        config.projectId &&
        config.apiKey
      ),

    connected:
      Boolean(
        databaseStatus &&
        databaseStatus.connected
      ) ||
      Boolean(
        connectionStatus &&
        connectionStatus.status === "connected"
      ),

    endpoint:
      config.endpoint,

    projectId:
      config.projectId,

    databaseId:
      config.databaseId || null,

    databaseName:
      config.databaseName,

    database:
      databaseStatus,

    connection:
      connectionStatus

  };

}


// ============================================================
// Health Check
// ============================================================

async function healthCheck() {

  const config = getConfig();

  let adapter = null;


  try {

    adapter =
      configureAdapter();


    if (
      typeof adapter.healthCheck === "function"
    ) {

      const result =
        await adapter.healthCheck();


      return {

        success:
          result.success !== false,

        provider:
          "appwrite",

        ...result

      };

    }


    return {

      success: true,

      provider: "appwrite",

      status: "configured"

    };

  } catch (error) {

    return {

      success: false,

      provider: "appwrite",

      status: "error",

      code:
        error.code ||
        "DATABASE_HEALTH_CHECK_FAILED",

      message:
        error.message

    };

  }

}


// ============================================================
// Database Execution
// ============================================================

async function execute(
  operation,
  ...args
) {

  if (
    !database ||
    typeof database.execute !== "function"
  ) {

    throw new Error(
      "DATABASE_EXECUTOR_NOT_AVAILABLE"
    );

  }

  return database.execute(
    operation,
    ...args
  );

}


// ============================================================
// Transactions
// ============================================================

async function transaction(callback) {

  if (
    !database ||
    typeof database.transaction !== "function"
  ) {

    throw new Error(
      "DATABASE_TRANSACTION_NOT_AVAILABLE"
    );

  }

  return database.transaction(
    callback
  );

}


// ============================================================
// Repository API
// ============================================================

function createRepository(
  adapter,
  options = {}
) {

  if (
    !repositoryModule ||
    typeof repositoryModule.createRepository !==
      "function"
  ) {

    throw new Error(
      "REPOSITORY_FACTORY_NOT_FOUND"
    );

  }

  return repositoryModule.createRepository(
    adapter,
    options
  );

}


function registerRepository(
  name,
  repository
) {

  if (
    !repositoryModule ||
    typeof repositoryModule.registerRepository !==
      "function"
  ) {

    throw new Error(
      "REPOSITORY_REGISTRY_NOT_AVAILABLE"
    );

  }

  return repositoryModule.registerRepository(
    name,
    repository
  );

}


function getRepository(name) {

  if (
    !repositoryModule ||
    typeof repositoryModule.getRepository !==
      "function"
  ) {

    return null;

  }

  return repositoryModule.getRepository(
    name
  );

}


function listRepositories() {

  if (
    !repositoryModule ||
    typeof repositoryModule.listRepositories !==
      "function"
  ) {

    return [];

  }

  return repositoryModule.listRepositories();

}


// ============================================================
// Schema API
// ============================================================

function getSchema() {

  if (
    !schemaModule ||
    typeof schemaModule.getSchema !==
      "function"
  ) {

    return null;

  }

  return schemaModule.getSchema();

}


function getEntity(name) {

  if (
    !schemaModule ||
    typeof schemaModule.getEntity !==
      "function"
  ) {

    return null;

  }

  return schemaModule.getEntity(name);

}


function validateSchema() {

  if (
    !schemaModule ||
    typeof schemaModule.validateSchema !==
      "function"
  ) {

    return {

      valid: false,

      errors: [
        "SCHEMA_VALIDATOR_NOT_AVAILABLE"
      ]

    };

  }

  return schemaModule.validateSchema();

}


// ============================================================
// Migration API
// ============================================================

function getMigrations() {

  if (
    !migrationsModule ||
    typeof migrationsModule.getMigrations !==
      "function"
  ) {

    return [];

  }

  return migrationsModule.getMigrations();

}


async function migrate(targetVersion = null) {

  if (
    !migrationsModule ||
    typeof migrationsModule.migrate !==
      "function"
  ) {

    throw new Error(
      "MIGRATION_ENGINE_NOT_AVAILABLE"
    );

  }

  return migrationsModule.migrate(
    targetVersion
  );

}


// ============================================================
// Connection Helpers
// ============================================================

function isConnected() {

  const status =
    getStatus();

  return Boolean(
    status.connected
  );

}


async function reconnect() {

  if (
    connection &&
    typeof connection.reconnect === "function"
  ) {

    return connection.reconnect();

  }

  return initialize();

}


// ============================================================
// Reset
// ============================================================

function reset() {

  if (
    repositoryModule &&
    typeof repositoryModule.clearRepositories ===
      "function"
  ) {

    repositoryModule.clearRepositories();

  }


  if (
    migrationsModule &&
    typeof migrationsModule.reset ===
      "function"
  ) {

    migrationsModule.reset();

  }


  return {

    success: true,

    message:
      "تمت إعادة ضبط حالة طبقة قاعدة البيانات."

  };

}


// ============================================================
// Public API
// ============================================================

module.exports = {

  // Configuration
  getConfig,
  validateConfig,

  // Adapter
  createAppwriteAdapter,
  configureAdapter,

  // Lifecycle
  initialize,
  shutdown,
  reconnect,

  // Status
  getStatus,
  healthCheck,
  isConnected,

  // Database
  execute,
  transaction,

  // Repository
  createRepository,
  registerRepository,
  getRepository,
  listRepositories,

  // Schema
  getSchema,
  getEntity,
  validateSchema,

  // Migrations
  getMigrations,
  migrate,

  // Reset
  reset

};
