'use strict';

/**
 * ============================================================
 * NOVA — Central Backend Setup
 * ============================================================
 *
 * هذا الملف هو نقطة الربط المركزية للـBackend قبل قاعدة البيانات.
 *
 * مهم:
 * - لا ينشئ بيانات وهمية.
 * - لا ينشئ مستخدمين تجريبيين.
 * - لا يتصل بقاعدة بيانات من نفسه.
 * - لا يكرر Services أو Controllers الموجودة.
 * - يجمع الاعتماديات في مكان مركزي واحد.
 * - يجهز Routes وServices وControllers للاستخدام.
 *
 * بعد إضافة قاعدة البيانات الحقيقية في المرحلة الأخيرة،
 * سيتم توصيل Database Adapter بهذا الملف.
 * ============================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = __dirname;

const paths = Object.freeze({
  api: path.join(ROOT, 'api'),
  controllers: path.join(ROOT, 'controllers'),
  services: path.join(ROOT, 'services'),
  middleware: path.join(ROOT, 'middleware'),
  database: path.join(ROOT, 'database'),
  routes: path.join(ROOT, 'routes'),
  providers: path.join(ROOT, 'providers'),
  realtime: path.join(ROOT, 'realtime'),
  tests: path.join(ROOT, 'tests'),
});

const state = {
  initialized: false,
  routesInitialized: false,
  servicesInitialized: false,
  controllersInitialized: false,
  providersInitialized: false,
  databaseReady: false,
  lastError: null,
};

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function load(modulePath, required = true) {
  try {
    return require(modulePath);
  } catch (error) {
    if (!required && error.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    error.message =
      `NOVA setup failed while loading ${modulePath}\n` +
      error.message;

    throw error;
  }
}

function ensureDirectories() {
  const requiredDirectories = [
    paths.routes,
    paths.providers,
    paths.realtime,
    paths.tests,
  ];

  for (const directory of requiredDirectories) {
    if (!exists(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  return true;
}

/* ============================================================
 * Core Modules
 * ============================================================ */

function loadCore() {
  return {
    database: load('./database/database'),
    connection: load('./database/connection'),
    databaseAdapter: load('./database/adapter'),
    repository: load('./database/repository'),
    schema: load('./database/schema'),
    migrations: load('./database/migrations'),

    response: load('./api/response'),

    requestContext: load('./middleware/request-context'),
    errorHandler: load('./middleware/error-handler'),
    authenticate: load('./middleware/authenticate'),
    authorize: load('./middleware/authorize'),
    validate: load('./middleware/validate'),
  };
}

/* ============================================================
 * Providers
 * ============================================================ */

function createPasswordProvider() {
  let crypto;

  try {
    crypto = require('crypto');
  } catch {
    crypto = null;
  }

  if (!crypto) {
    return null;
  }

  return {
    async hash(password) {
      if (typeof password !== 'string' || !password) {
        throw new Error('PASSWORD_REQUIRED');
      }

      const salt = crypto.randomBytes(16).toString('hex');

      const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          64,
          (error, key) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(key.toString('hex'));
          }
        );
      });

      return `${salt}:${derivedKey}`;
    },

    async verify(password, storedPassword) {
      if (
        typeof password !== 'string' ||
        typeof storedPassword !== 'string'
      ) {
        return false;
      }

      const parts = storedPassword.split(':');

      if (parts.length !== 2) {
        return false;
      }

      const [salt, storedHash] = parts;

      const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          64,
          (error, key) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(key.toString('hex'));
          }
        );
      });

      const left = Buffer.from(derivedKey, 'hex');
      const right = Buffer.from(storedHash, 'hex');

      if (left.length !== right.length) {
        return false;
      }

      return crypto.timingSafeEqual(left, right);
    },
  };
}

function createTokenProvider() {
  /*
   * يتم ترك إنشاء JWT الحقيقي لمرحلة Auth configuration.
   *
   * لا نضع SECRET داخل الكود.
   * SECRET سيأتي من .env.
   */

  let jwt = null;

  try {
    jwt = require('jsonwebtoken');
  } catch {
    jwt = null;
  }

  return {
    available: Boolean(jwt),

    createAccessToken(payload, options = {}) {
      if (!jwt) {
        const error = new Error(
          'JWT_PROVIDER_NOT_INSTALLED'
        );

        error.code = 'JWT_PROVIDER_NOT_INSTALLED';

        throw error;
      }

      const secret =
        options.secret ||
        process.env.JWT_SECRET;

      if (!secret) {
        const error = new Error(
          'JWT_SECRET_NOT_CONFIGURED'
        );

        error.code = 'JWT_SECRET_NOT_CONFIGURED';

        throw error;
      }

      return jwt.sign(
        payload,
        secret,
        {
          expiresIn:
            options.expiresIn ||
            process.env.JWT_EXPIRES_IN ||
            '7d',
        }
      );
    },

    verifyAccessToken(token, options = {}) {
      if (!jwt) {
        const error = new Error(
          'JWT_PROVIDER_NOT_INSTALLED'
        );

        error.code = 'JWT_PROVIDER_NOT_INSTALLED';

        throw error;
      }

      const secret =
        options.secret ||
        process.env.JWT_SECRET;

      if (!secret) {
        const error = new Error(
          'JWT_SECRET_NOT_CONFIGURED'
        );

        error.code = 'JWT_SECRET_NOT_CONFIGURED';

        throw error;
      }

      return jwt.verify(token, secret);
    },
  };
}

function createSessionProvider() {
  /*
   * Session persistence will be connected to the database
   * in the final database phase.
   *
   * No in-memory fake sessions are created here.
   */

  return {
    available: false,

    async create() {
      const error = new Error(
        'SESSION_PROVIDER_NOT_CONFIGURED'
      );

      error.code = 'SESSION_PROVIDER_NOT_CONFIGURED';

      throw error;
    },

    async get() {
      return null;
    },

    async revoke() {
      const error = new Error(
        'SESSION_PROVIDER_NOT_CONFIGURED'
      );

      error.code = 'SESSION_PROVIDER_NOT_CONFIGURED';

      throw error;
    },
  };
}

function createVerificationProvider() {
  /*
   * Email / phone verification will use a real provider
   * once the external delivery mechanism is configured.
   */

  return {
    available: false,

    async send() {
      const error = new Error(
        'VERIFICATION_PROVIDER_NOT_CONFIGURED'
      );

      error.code =
        'VERIFICATION_PROVIDER_NOT_CONFIGURED';

      throw error;
    },

    async verify() {
      return false;
    },
  };
}

function createProviders() {
  state.providersInitialized = true;

  return {
    password: createPasswordProvider(),
    token: createTokenProvider(),
    session: createSessionProvider(),
    verification: createVerificationProvider(),
  };
}

/* ============================================================
 * Repository Registry
 * ============================================================ */

function createRepositoryContainer(core) {
  const registry = new Map();

  const repositoryApi = core.repository;

  return {
    register(name, repository) {
      if (!name || !repository) {
        throw new Error(
          'INVALID_REPOSITORY_REGISTRATION'
        );
      }

      registry.set(name, repository);

      if (
        repositoryApi &&
        typeof repositoryApi.registerRepository ===
          'function'
      ) {
        repositoryApi.registerRepository(
          name,
          repository
        );
      }

      return repository;
    },

    get(name) {
      if (registry.has(name)) {
        return registry.get(name);
      }

      if (
        repositoryApi &&
        typeof repositoryApi.getRepository ===
          'function'
      ) {
        return repositoryApi.getRepository(name);
      }

      return null;
    },

    has(name) {
      return registry.has(name);
    },

    list() {
      return [...registry.keys()];
    },
  };
}

/* ============================================================
 * Services
 * ============================================================ */

const SERVICE_FILES = Object.freeze({
  auth: './services/auth.service',
  user: './services/user.service',
  profile: './services/profile.service',
  contact: './services/contact.service',
  attachment: './services/attachment.service',
  group: './services/group.service',
  call: './services/call.service',
  conversation: './services/conversation.service',
  community: './services/community.service',
  message: './services/message.service',
  notification: './services/notification.service',
  status: './services/status.service',
  device: './services/device.service',
  security: './services/security.service',
});

function createServices({
  repositories,
  providers,
  core,
}) {
  const loaded = {};

  for (const [name, file] of Object.entries(
    SERVICE_FILES
  )) {
    loaded[name] = load(file);
  }

  /*
   * Services are intentionally not constructed here
   * until their required repositories are available.
   *
   * This prevents the application from silently creating
   * fake/in-memory persistence.
   */

  const services = {};

  function factory(name) {
    const module = loaded[name];

    if (!module) {
      return null;
    }

    if (typeof module === 'function') {
      return module;
    }

    if (
      typeof module[`create${capitalize(name)}Service`] ===
      'function'
    ) {
      return module[
        `create${capitalize(name)}Service`
      ];
    }

    if (
      typeof module.default === 'function'
    ) {
      return module.default;
    }

    return module;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /*
   * Generic dependency resolution.
   *
   * The actual repository instances are supplied by the
   * final database wiring phase.
   */

  for (const name of Object.keys(SERVICE_FILES)) {
    services[name] = {
      factory: factory(name),
      instance: null,
    };
  }

  state.servicesInitialized = true;

  return {
    definitions: services,

    instantiate(name, dependencies = {}) {
      const definition = services[name];

      if (!definition || !definition.factory) {
        throw new Error(
          `SERVICE_FACTORY_NOT_FOUND:${name}`
        );
      }

      if (typeof definition.factory !== 'function') {
        throw new Error(
          `SERVICE_FACTORY_INVALID:${name}`
        );
      }

      const instance =
        definition.factory(dependencies);

      definition.instance = instance;

      return instance;
    },

    get(name) {
      return services[name]?.instance || null;
    },

    list() {
      return Object.keys(services);
    },
  };
}

/* ============================================================
 * Controllers
 * ============================================================ */

const CONTROLLER_FILES = Object.freeze({
  auth: './controllers/auth.controller',
  user: './controllers/user.controller',
  profile: './controllers/profile.controller',
  contact: './controllers/contact.controller',
  conversation: './controllers/conversation.controller',
  message: './controllers/message.controller',
  attachment: './controllers/attachment.controller',
  group: './controllers/group.controller',
  community: './controllers/community.controller',
  status: './controllers/status.controller',
  call: './controllers/call.controller',
  notification: './controllers/notification.controller',
  device: './controllers/device.controller',
  privacy: './controllers/privacy.controller',
  security: './controllers/security.controller',
  upload: './controllers/upload.controller',
});

function createControllers() {
  const definitions = {};

  for (const [name, file] of Object.entries(
    CONTROLLER_FILES
  )) {
    definitions[name] = load(file);
  }

  state.controllersInitialized = true;

  return {
    definitions,

    create(name, dependencies = {}) {
      const definition = definitions[name];

      if (!definition) {
        throw new Error(
          `CONTROLLER_NOT_FOUND:${name}`
        );
      }

      if (typeof definition === 'function') {
        return definition(dependencies);
      }

      const factoryName =
        `create${name.charAt(0).toUpperCase() + name.slice(1)}Controller`;

      if (
        typeof definition[factoryName] ===
        'function'
      ) {
        return definition[factoryName](
          dependencies
        );
      }

      if (
        typeof definition.default ===
        'function'
      ) {
        return definition.default(dependencies);
      }

      throw new Error(
        `CONTROLLER_FACTORY_NOT_FOUND:${name}`
      );
    },

    list() {
      return Object.keys(definitions);
    },
  };
}

/* ============================================================
 * Route Manifest
 * ============================================================ */

const ROUTE_MANIFEST = Object.freeze([
  ['auth', '/auth', 'auth.routes'],
  ['users', '/users', 'users.routes'],
  ['profiles', '/profiles', 'profiles.routes'],
  ['contacts', '/contacts', 'contacts.routes'],
  [
    'conversations',
    '/conversations',
    'conversations.routes',
  ],
  ['messages', '/messages', 'messages.routes'],
  [
    'attachments',
    '/attachments',
    'attachments.routes',
  ],
  ['groups', '/groups', 'groups.routes'],
  [
    'communities',
    '/communities',
    'communities.routes',
  ],
  ['statuses', '/statuses', 'statuses.routes'],
  ['calls', '/calls', 'calls.routes'],
  [
    'notifications',
    '/notifications',
    'notifications.routes',
  ],
  ['devices', '/devices', 'devices.routes'],
  ['privacy', '/privacy', 'privacy.routes'],
  ['security', '/security', 'security.routes'],
  ['uploads', '/uploads', 'uploads.routes'],
]);

function loadRoutes() {
  const routes = {};

  for (const [name, routePath, file] of ROUTE_MANIFEST) {
    const fullPath = path.join(paths.routes, file);

    if (exists(`${fullPath}.js`)) {
      routes[name] = {
        path: routePath,
        module: load(fullPath),
      };
    } else {
      routes[name] = {
        path: routePath,
        module: null,
      };
    }
  }

  state.routesInitialized = true;

  return routes;
}

/* ============================================================
 * Database Bridge
 * ============================================================ */

function createDatabaseBridge(core) {
  return {
    getStatus() {
      if (
        core.database &&
        typeof core.database.getStatus ===
          'function'
      ) {
        return core.database.getStatus();
      }

      return {
        initialized: false,
        connected: false,
        driver: null,
      };
    },

    isConnected() {
      if (
        core.database &&
        typeof core.database.getStatus ===
          'function'
      ) {
        return Boolean(
          core.database.getStatus()?.connected
        );
      }

      return false;
    },

    async initialize() {
      /*
       * لا يتم الاتصال تلقائيًا بقاعدة البيانات هنا.
       *
       * السبب:
       * قاعدة البيانات النهائية لم يتم إعدادها بعد.
       *
       * بعد إضافة PostgreSQL سيتم استدعاء
       * database.initialize() من bootstrap.
       */

      return this.getStatus();
    },

    async shutdown() {
      if (
        core.connection &&
        typeof core.connection.disconnect ===
          'function'
      ) {
        return core.connection.disconnect();
      }

      if (
        core.database &&
        typeof core.database.disconnect ===
          'function'
      ) {
        return core.database.disconnect();
      }

      return null;
    },
  };
}

/* ============================================================
 * Health
 * ============================================================ */

function getSystemStatus({
  core,
  repositories,
  services,
  controllers,
  routes,
}) {
  const databaseStatus =
    core.database &&
    typeof core.database.getStatus === 'function'
      ? core.database.getStatus()
      : {
          initialized: false,
          connected: false,
        };

  return {
    name: 'NOVA',
    environment:
      process.env.NODE_ENV || 'development',

    initialized: state.initialized,

    database: {
      initialized:
        Boolean(databaseStatus.initialized),
      connected:
        Boolean(databaseStatus.connected),
      driver:
        databaseStatus.driver || null,
    },

    backend: {
      services:
        services.list().length,
      controllers:
        controllers.list().length,
      routes:
        Object.keys(routes).length,
      repositories:
        repositories.list().length,
    },

    capabilities: {
      realPersistence:
        Boolean(databaseStatus.connected),

      realtime:
        process.env.REALTIME_ENABLED === 'true',

      uploads:
        Boolean(
          process.env.UPLOAD_DIRECTORY
        ),

      authentication:
        Boolean(
          process.env.JWT_SECRET
        ),
    },

    timestamp: new Date().toISOString(),
  };
}

/* ============================================================
 * Main Setup
 * ============================================================ */

function setup() {
  if (state.initialized) {
    return module.exports.runtime;
  }

  try {
    ensureDirectories();

    const core = loadCore();

    const providers =
      createProviders();

    const repositories =
      createRepositoryContainer(core);

    const services =
      createServices({
        repositories,
        providers,
        core,
      });

    const controllers =
      createControllers();

    const routes =
      loadRoutes();

    const database =
      createDatabaseBridge(core);

    const runtime = {
      name: 'NOVA',

      root: ROOT,
      paths,

      core,

      providers,

      repositories,

      services,

      controllers,

      routes,

      database,

      state,

      getStatus() {
        return getSystemStatus({
          core,
          repositories,
          services,
          controllers,
          routes,
        });
      },

      isReady() {
        return Boolean(
          state.initialized
        );
      },

      isDatabaseReady() {
        return database.isConnected();
      },

      async shutdown() {
        await database.shutdown();

        state.initialized = false;
        state.databaseReady = false;

        return true;
      },
    };

    state.initialized = true;
    state.lastError = null;

    module.exports.runtime = runtime;

    return runtime;
  } catch (error) {
    state.lastError = error;
    throw error;
  }
}

/* ============================================================
 * Exports
 * ============================================================ */

module.exports = {
  setup,

  getRuntime() {
    return module.exports.runtime || setup();
  },

  getState() {
    return {
      ...state,
      lastError: state.lastError
        ? {
            code:
              state.lastError.code || null,
            message:
              state.lastError.message || null,
          }
        : null,
    };
  },

  paths,

  ROUTE_MANIFEST,

  SERVICE_FILES,

  CONTROLLER_FILES,

  runtime: null,
};


/* ============================================================
 * Direct execution
 * ============================================================ */

if (require.main === module) {
  try {
    const runtime = setup();

    console.log('');
    console.log('====================================');
    console.log(' NOVA BACKEND SETUP');
    console.log('====================================');
    console.log('');
    console.log(
      JSON.stringify(
        runtime.getStatus(),
        null,
        2
      )
    );
    console.log('');
    console.log(
      'Setup completed successfully.'
    );
    console.log(
      'Database connection is intentionally pending.'
    );
    console.log('');
  } catch (error) {
    console.error('');
    console.error(
      '===================================='
    );
    console.error(
      ' NOVA BACKEND SETUP ERROR'
    );
    console.error(
      '===================================='
    );
    console.error('');
    console.error(
      error.message
    );
    console.error('');
    process.exitCode = 1;
  }
}
