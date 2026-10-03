/**
 * NOVA
 * Appwrite TablesDB Adapter
 *
 * هذه الطبقة هي الجسر بين NOVA و Appwrite.
 *
 * لا تضع API Key داخل هذا الملف.
 * استخدم:
 *
 * APPWRITE_ENDPOINT
 * APPWRITE_PROJECT_ID
 * APPWRITE_API_KEY
 * APPWRITE_DATABASE_ID
 */

"use strict";

const DEFAULT_ENDPOINT = "https://cloud.appwrite.io/v1";

const state = {
  configured: false,
  connected: false,
  endpoint: DEFAULT_ENDPOINT,
  projectId: null,
  databaseId: null,
  lastError: null,
  connectedAt: null
};

function createError(code, message, details = null) {
  const error = new Error(message);

  error.code = code;

  if (details !== null) {
    error.details = details;
  }

  return error;
}

function getConfig(options = {}) {
  return {
    endpoint:
      options.endpoint ||
      process.env.APPWRITE_ENDPOINT ||
      DEFAULT_ENDPOINT,

    projectId:
      options.projectId ||
      process.env.APPWRITE_PROJECT_ID ||
      null,

    apiKey:
      options.apiKey ||
      process.env.APPWRITE_API_KEY ||
      null,

    databaseId:
      options.databaseId ||
      process.env.APPWRITE_DATABASE_ID ||
      null
  };
}

function validateConfig(config) {
  const missing = [];

  if (!config.endpoint) {
    missing.push("APPWRITE_ENDPOINT");
  }

  if (!config.projectId) {
    missing.push("APPWRITE_PROJECT_ID");
  }

  if (!config.apiKey) {
    missing.push("APPWRITE_API_KEY");
  }

  if (!config.databaseId) {
    missing.push("APPWRITE_DATABASE_ID");
  }

  if (missing.length) {
    throw createError(
      "APPWRITE_CONFIG_MISSING",
      `Missing Appwrite configuration: ${missing.join(", ")}`
    );
  }

  return true;
}

function buildHeaders(config) {
  return {
    "Content-Type": "application/json",
    "X-Appwrite-Project": config.projectId,
    "X-Appwrite-Key": config.apiKey
  };
}

async function request(path, options = {}) {
  const config = getConfig(options.config || {});

  validateConfig(config);

  const url =
    `${config.endpoint.replace(/\/+$/, "")}` +
    `${path}`;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...buildHeaders(config),
      ...(options.headers || {})
    },
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body)
  });

  const raw = await response.text();

  let data = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        raw
      };
    }
  }

  if (!response.ok) {
    throw createError(
      data.code || `APPWRITE_HTTP_${response.status}`,
      data.message ||
        `Appwrite request failed with status ${response.status}`,
      data
    );
  }

  return data;
}

/* =========================================
   Connection
========================================= */

async function connect(options = {}) {
  const config = getConfig(options);

  validateConfig(config);

  state.endpoint = config.endpoint;
  state.projectId = config.projectId;
  state.databaseId = config.databaseId;
  state.configured = true;

  try {
    await request(
      `/databases/${encodeURIComponent(config.databaseId)}`,
      {
        method: "GET",
        config
      }
    );

    state.connected = true;
    state.connectedAt = new Date().toISOString();
    state.lastError = null;

    return getState();
  } catch (error) {
    state.connected = false;
    state.lastError = {
      code: error.code,
      message: error.message
    };

    throw error;
  }
}

async function disconnect() {
  state.connected = false;
  state.connectedAt = null;

  return getState();
}

function isConnected() {
  return state.connected === true;
}

function getState() {
  return {
    ...state,
    lastError: state.lastError
      ? {
          ...state.lastError
        }
      : null
  };
}

/* =========================================
   Database
========================================= */

async function getDatabase() {
  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}`
  );
}

/* =========================================
   Tables
========================================= */

async function listTables(options = {}) {
  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables`,
    {
      method: "GET",
      config: options
    }
  );
}

async function getTable(tableId) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(tableId)}`
  );
}

async function createTable({
  tableId,
  name,
  permissions = []
}) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  if (!name) {
    throw createError(
      "TABLE_NAME_REQUIRED",
      "Table name is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables`,
    {
      method: "POST",
      body: {
        tableId,
        name,
        permissions
      }
    }
  );
}

/* =========================================
   Columns
========================================= */

async function listColumns(tableId) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(tableId)}/columns`
  );
}

/* =========================================
   Rows
========================================= */

async function listRows(
  tableId,
  {
    queries = [],
    limit,
    offset,
    cursor,
    cursorDirection
  } = {}
) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  const params = new URLSearchParams();

  for (const query of queries) {
    params.append("queries[]", query);
  }

  if (limit !== undefined) {
    params.set("limit", String(limit));
  }

  if (offset !== undefined) {
    params.set("offset", String(offset));
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (cursorDirection) {
    params.set(
      "cursorDirection",
      cursorDirection
    );
  }

  const queryString = params.toString();

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(
      tableId
    )}/rows${queryString ? `?${queryString}` : ""}`
  );
}

async function getRow(tableId, rowId) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  if (!rowId) {
    throw createError(
      "ROW_ID_REQUIRED",
      "Row ID is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(
      tableId
    )}/rows/${encodeURIComponent(rowId)}`
  );
}

async function createRow(
  tableId,
  data,
  rowId = undefined
) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  if (!data || typeof data !== "object") {
    throw createError(
      "ROW_DATA_REQUIRED",
      "Row data is required."
    );
  }

  const body = {
    data
  };

  if (rowId) {
    body.rowId = rowId;
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(
      tableId
    )}/rows`,
    {
      method: "POST",
      body
    }
  );
}

async function updateRow(
  tableId,
  rowId,
  data
) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  if (!rowId) {
    throw createError(
      "ROW_ID_REQUIRED",
      "Row ID is required."
    );
  }

  if (!data || typeof data !== "object") {
    throw createError(
      "ROW_DATA_REQUIRED",
      "Row data is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(
      tableId
    )}/rows/${encodeURIComponent(rowId)}`,
    {
      method: "PATCH",
      body: {
        data
      }
    }
  );
}

async function deleteRow(
  tableId,
  rowId
) {
  if (!tableId) {
    throw createError(
      "TABLE_ID_REQUIRED",
      "Table ID is required."
    );
  }

  if (!rowId) {
    throw createError(
      "ROW_ID_REQUIRED",
      "Row ID is required."
    );
  }

  return request(
    `/databases/${encodeURIComponent(
      state.databaseId
    )}/tables/${encodeURIComponent(
      tableId
    )}/rows/${encodeURIComponent(rowId)}`,
    {
      method: "DELETE"
    }
  );
}

/* =========================================
   Compatibility Layer
========================================= */

async function query(
  tableId,
  options = {}
) {
  return listRows(tableId, options);
}

async function find(
  tableId,
  options = {}
) {
  return listRows(tableId, options);
}

async function findOne(
  tableId,
  options = {}
) {
  const result = await listRows(
    tableId,
    {
      ...options,
      limit: 1
    }
  );

  return result.rows?.[0] || null;
}

async function create(
  tableId,
  data,
  rowId
) {
  return createRow(
    tableId,
    data,
    rowId
  );
}

async function update(
  tableId,
  rowId,
  data
) {
  return updateRow(
    tableId,
    rowId,
    data
  );
}

async function remove(
  tableId,
  rowId
) {
  return deleteRow(
    tableId,
    rowId
  );
}

/* =========================================
   Health
========================================= */

async function healthCheck() {
  if (!state.configured) {
    return {
      ok: false,
      connected: false,
      reason: "NOT_CONFIGURED"
    };
  }

  try {
    await getDatabase();

    return {
      ok: true,
      connected: true,
      provider: "appwrite",
      databaseId: state.databaseId,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      connected: false,
      provider: "appwrite",
      databaseId: state.databaseId,
      error: {
        code: error.code,
        message: error.message
      },
      checkedAt: new Date().toISOString()
    };
  }
}

function reset() {
  state.configured = false;
  state.connected = false;
  state.endpoint = DEFAULT_ENDPOINT;
  state.projectId = null;
  state.databaseId = null;
  state.lastError = null;
  state.connectedAt = null;
}

/* =========================================
   Factory
========================================= */

function createAdapter(options = {}) {
  return {
    connect: () => connect(options),
    disconnect,
    isConnected,
    getState,

    getDatabase,

    listTables,
    getTable,
    createTable,

    listColumns,

    listRows,
    getRow,
    createRow,
    updateRow,
    deleteRow,

    query,
    find,
    findOne,
    create,
    update,
    delete: remove,

    healthCheck,
    reset
  };
}

/* =========================================
   Exports
========================================= */

module.exports = {
  createAdapter,

  connect,
  disconnect,
  isConnected,
  getState,

  getDatabase,

  listTables,
  getTable,
  createTable,

  listColumns,

  listRows,
  getRow,
  createRow,
  updateRow,
  deleteRow,

  query,
  find,
  findOne,
  create,
  update,
  remove,

  healthCheck,
  reset,

  getConfig,
  validateConfig
};
