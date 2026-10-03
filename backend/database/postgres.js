'use strict';

/**
 * NOVA
 * PostgreSQL Database Driver
 *
 * مسؤول فقط عن الاتصال والتعامل مع PostgreSQL.
 * لا يحتوي على بيانات وهمية ولا ينشئ مستخدمين تلقائيًا.
 *
 * يتوافق مع طبقة قاعدة البيانات الموجودة:
 * database.js
 * connection.js
 * adapter.js
 * repository.js
 */

let Pool = null;

try {
  // PostgreSQL official Node.js client
  ({ Pool } = require('pg'));
} catch {
  // يتم إعطاء الخطأ بشكل واضح عند محاولة التشغيل
  // إذا لم يتم تثبيت pg بعد.
}

const state = {
  initialized: false,
  connected: false,
  pool: null,
  lastError: null,
  connectedAt: null,
};

function createDatabaseError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;

  if (cause) {
    error.cause = cause;
  }

  return error;
}

function ensurePgInstalled() {
  if (!Pool) {
    throw createDatabaseError(
      'POSTGRES_DRIVER_NOT_INSTALLED',
      'مكتبة PostgreSQL غير مثبتة. ثبّت الحزمة pg قبل تشغيل قاعدة البيانات.'
    );
  }
}

function normalizeConfig(config = {}) {
  return {
    host: config.host || process.env.DB_HOST || '127.0.0.1',
    port: Number(config.port || process.env.DB_PORT || 5432),
    database: config.database || process.env.DB_NAME || '',
    user: config.user || process.env.DB_USER || '',
    password:
      config.password !== undefined
        ? config.password
        : process.env.DB_PASSWORD || '',

    ssl:
      config.ssl !== undefined
        ? config.ssl
        : process.env.DB_SSL === 'true',

    max:
      Number(config.max || process.env.DB_POOL_MAX || 10),

    idleTimeoutMillis:
      Number(
        config.idleTimeoutMillis ||
        process.env.DB_IDLE_TIMEOUT_MS ||
        30000
      ),

    connectionTimeoutMillis:
      Number(
        config.connectionTimeoutMillis ||
        process.env.DB_CONNECTION_TIMEOUT_MS ||
        10000
      ),
  };
}

function validateConfig(config) {
  const errors = [];

  if (!config.host) {
    errors.push('DB_HOST');
  }

  if (!Number.isInteger(config.port) || config.port <= 0) {
    errors.push('DB_PORT');
  }

  if (!config.database) {
    errors.push('DB_NAME');
  }

  if (!config.user) {
    errors.push('DB_USER');
  }

  if (errors.length > 0) {
    throw createDatabaseError(
      'POSTGRES_CONFIG_INVALID',
      `إعدادات PostgreSQL غير مكتملة: ${errors.join(', ')}`
    );
  }

  return true;
}

async function connect(config = {}) {
  if (state.connected && state.pool) {
    return getState();
  }

  ensurePgInstalled();

  const normalized = normalizeConfig(config);

  validateConfig(normalized);

  const pool = new Pool({
    host: normalized.host,
    port: normalized.port,
    database: normalized.database,
    user: normalized.user,
    password: normalized.password,
    max: normalized.max,
    idleTimeoutMillis: normalized.idleTimeoutMillis,
    connectionTimeoutMillis: normalized.connectionTimeoutMillis,

    ssl: normalized.ssl
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false,
  });

  try {
    const client = await pool.connect();

    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    state.pool = pool;
    state.initialized = true;
    state.connected = true;
    state.lastError = null;
    state.connectedAt = new Date().toISOString();

    return getState();
  } catch (error) {
    await pool.end().catch(() => {});

    state.pool = null;
    state.initialized = false;
    state.connected = false;
    state.lastError = error;

    throw createDatabaseError(
      'POSTGRES_CONNECTION_FAILED',
      'تعذر الاتصال بقاعدة بيانات PostgreSQL.',
      error
    );
  }
}

function getPool() {
  if (!state.pool || !state.connected) {
    throw createDatabaseError(
      'POSTGRES_NOT_CONNECTED',
      'اتصال PostgreSQL غير متاح حاليًا.'
    );
  }

  return state.pool;
}

async function query(text, values = []) {
  const pool = getPool();

  if (typeof text !== 'string' || text.trim() === '') {
    throw createDatabaseError(
      'POSTGRES_QUERY_INVALID',
      'استعلام PostgreSQL غير صالح.'
    );
  }

  return pool.query(text, values);
}

async function transaction(callback) {
  if (typeof callback !== 'function') {
    throw createDatabaseError(
      'POSTGRES_TRANSACTION_CALLBACK_REQUIRED',
      'يجب تمرير دالة لتنفيذ المعاملة.'
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const transactionClient = {
      query: (text, values = []) => client.query(text, values),

      execute: (text, values = []) =>
        client.query(text, values),

      find: async (text, values = []) => {
        const result = await client.query(text, values);
        return result.rows;
      },

      findOne: async (text, values = []) => {
        const result = await client.query(text, values);
        return result.rows[0] || null;
      },
    };

    const result = await callback(transactionClient);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  if (!state.pool || !state.connected) {
    return {
      healthy: false,
      connected: false,
      driver: 'postgresql',
      error: 'POSTGRES_NOT_CONNECTED',
    };
  }

  try {
    const result = await state.pool.query(
      'SELECT NOW() AS server_time'
    );

    return {
      healthy: true,
      connected: true,
      driver: 'postgresql',
      serverTime: result.rows[0]?.server_time || null,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    state.lastError = error;

    return {
      healthy: false,
      connected: false,
      driver: 'postgresql',
      error: error.message,
    };
  }
}

async function disconnect() {
  if (state.pool) {
    await state.pool.end().catch(() => {});
  }

  state.pool = null;
  state.connected = false;
  state.initialized = false;
  state.connectedAt = null;

  return getState();
}

function isConnected() {
  return Boolean(state.connected && state.pool);
}

function getState() {
  return {
    initialized: state.initialized,
    connected: state.connected,
    driver: 'postgresql',
    connectedAt: state.connectedAt,
    lastError: state.lastError
      ? {
          code: state.lastError.code || null,
          message: state.lastError.message || null,
        }
      : null,
  };
}

function reset() {
  state.initialized = false;
  state.connected = false;
  state.pool = null;
  state.lastError = null;
  state.connectedAt = null;
}

module.exports = {
  connect,
  disconnect,
  query,
  transaction,
  healthCheck,
  getPool,
  getState,
  isConnected,
  normalizeConfig,
  validateConfig,
  reset,
};
