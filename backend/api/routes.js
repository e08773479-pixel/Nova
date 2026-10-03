"use strict";

/**
 * NOVA — Central API Routes
 * ---------------------------------------------------------
 * هذا الملف يجمع مسارات الـAPI الخاصة بالمنصة.
 *
 * لا توجد هنا:
 * - بيانات وهمية
 * - استعلامات قاعدة بيانات
 * - منطق أعمال
 *
 * المسارات فقط تربط:
 *
 * Request
 *    ↓
 * Route
 *    ↓
 * Controller
 *    ↓
 * Service
 *    ↓
 * Database Layer
 */

const express = require("express");

const router = express.Router();


// ============================================================
// Route Registry
// ============================================================

const routes = {

  auth: "/auth",

  users: "/users",

  profiles: "/profiles",

  contacts: "/contacts",

  conversations: "/conversations",

  messages: "/messages",

  attachments: "/attachments",

  groups: "/groups",

  communities: "/communities",

  statuses: "/statuses",

  calls: "/calls",

  notifications: "/notifications",

  devices: "/devices",

  privacy: "/privacy",

  security: "/security",

  uploads: "/uploads"

};


// ============================================================
// Router Loader
// ============================================================

function mountRouter(path, modulePath) {

  try {

    const routeModule = require(modulePath);

    const routeRouter =
      routeModule?.router ||
      routeModule;

    if (
      typeof routeRouter === "function"
    ) {

      router.use(
        path,
        routeRouter
      );

      return true;

    }

    console.warn(
      `[NOVA API] Router is invalid: ${modulePath}`
    );

  } catch (error) {

    /*
     * Route modules are created in later Backend phases.
     *
     * We intentionally do not create fake endpoints here.
     */

    if (
      error.code !== "MODULE_NOT_FOUND"
    ) {

      console.error(
        `[NOVA API] Failed to load ${modulePath}`,
        error
      );

    }

  }

  return false;
}


// ============================================================
// Route Modules
// ============================================================

const routeModules = [

  {
    key: "auth",
    path: routes.auth,
    module: "../routes/auth"
  },

  {
    key: "users",
    path: routes.users,
    module: "../routes/users"
  },

  {
    key: "profiles",
    path: routes.profiles,
    module: "../routes/profiles"
  },

  {
    key: "contacts",
    path: routes.contacts,
    module: "../routes/contacts"
  },

  {
    key: "conversations",
    path: routes.conversations,
    module: "../routes/conversations"
  },

  {
    key: "messages",
    path: routes.messages,
    module: "../routes/messages"
  },

  {
    key: "attachments",
    path: routes.attachments,
    module: "../routes/attachments"
  },

  {
    key: "groups",
    path: routes.groups,
    module: "../routes/groups"
  },

  {
    key: "communities",
    path: routes.communities,
    module: "../routes/communities"
  },

  {
    key: "statuses",
    path: routes.statuses,
    module: "../routes/statuses"
  },

  {
    key: "calls",
    path: routes.calls,
    module: "../routes/calls"
  },

  {
    key: "notifications",
    path: routes.notifications,
    module: "../routes/notifications"
  },

  {
    key: "devices",
    path: routes.devices,
    module: "../routes/devices"
  },

  {
    key: "privacy",
    path: routes.privacy,
    module: "../routes/privacy"
  },

  {
    key: "security",
    path: routes.security,
    module: "../routes/security"
  },

  {
    key: "uploads",
    path: routes.uploads,
    module: "../routes/uploads"
  }

];


// ============================================================
// Mount Available Routes
// ============================================================

const mountedRoutes = [];

for (const route of routeModules) {

  if (
    mountRouter(
      route.path,
      route.module
    )
  ) {

    mountedRoutes.push(route.key);

  }

}


// ============================================================
// API Route Information
// ============================================================

router.get("/routes", (req, res) => {

  res.status(200).json({

    success: true,

    version:
      process.env.API_VERSION || "v1",

    routes:
      routeModules.map((route) => ({

        key: route.key,

        path: `/api/${
          process.env.API_VERSION || "v1"
        }${route.path}`,

        mounted:
          mountedRoutes.includes(
            route.key
          )

      }))

  });

});


// ============================================================
// Export
// ============================================================

module.exports = router;
