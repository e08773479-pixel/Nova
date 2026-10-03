// ============================================================
// NOVA — API Entry Point
// File: backend/api/index.js
// ============================================================

"use strict";

/*
 * This file is the central API entry point.
 *
 * Important:
 * - No fake users.
 * - No fake messages.
 * - No fake balances.
 * - No mock database records.
 *
 * Database integration is intentionally kept behind the
 * service/model layers so the API contract does not need
 * to change when the real database is connected.
 */

const express = require("express");

const router = express.Router();


// ============================================================
// API Metadata
// ============================================================

const API_VERSION = "v1";


// ============================================================
// Health / API Information
// ============================================================

router.get("/", (req, res) => {

  res.status(200).json({
    success: true,
    name: "NOVA API",
    version: API_VERSION,
    status: "online",
    environment:
      process.env.NODE_ENV || "development"
  });

});


router.get("/health", (req, res) => {

  res.status(200).json({
    success: true,
    service: "api",
    status: "healthy",
    timestamp: new Date().toISOString()
  });

});


// ============================================================
// Route Loader
// ============================================================

/*
 * Routers are loaded conditionally.
 *
 * This keeps this file responsible only for assembling
 * the API rather than putting business logic inside it.
 */

function mountRoute(path, modulePath) {

  try {

    const routeModule = require(modulePath);

    if (typeof routeModule === "function") {

      router.use(path, routeModule);

      return true;

    }

    if (
      routeModule &&
      typeof routeModule.router === "function"
    ) {

      router.use(path, routeModule.router);

      return true;

    }

    console.warn(
      `[NOVA API] Invalid router export: ${modulePath}`
    );

  } catch (error) {

    /*
     * During the initial architecture stage some route files
     * may not exist yet. We don't create fake endpoints here.
     *
     * Once a route module exists, it is mounted automatically.
     */

    if (error.code !== "MODULE_NOT_FOUND") {

      console.error(
        `[NOVA API] Failed loading ${modulePath}`,
        error
      );

    }

  }

  return false;
}


// ============================================================
// API Route Registry
// ============================================================

const routeRegistry = [

  {
    path: "/auth",
    module: "../routes/auth"
  },

  {
    path: "/users",
    module: "../routes/users"
  },

  {
    path: "/profiles",
    module: "../routes/profiles"
  },

  {
    path: "/contacts",
    module: "../routes/contacts"
  },

  {
    path: "/conversations",
    module: "../routes/conversations"
  },

  {
    path: "/messages",
    module: "../routes/messages"
  },

  {
    path: "/attachments",
    module: "../routes/attachments"
  },

  {
    path: "/groups",
    module: "../routes/groups"
  },

  {
    path: "/communities",
    module: "../routes/communities"
  },

  {
    path: "/statuses",
    module: "../routes/statuses"
  },

  {
    path: "/calls",
    module: "../routes/calls"
  },

  {
    path: "/notifications",
    module: "../routes/notifications"
  },

  {
    path: "/devices",
    module: "../routes/devices"
  },

  {
    path: "/privacy",
    module: "../routes/privacy"
  },

  {
    path: "/security",
    module: "../routes/security"
  },

  {
    path: "/uploads",
    module: "../routes/uploads"
  }

];


// ============================================================
// Mount Existing Routes
// ============================================================

const mountedRoutes = [];

for (const route of routeRegistry) {

  const mounted = mountRoute(
    route.path,
    route.module
  );

  if (mounted) {
    mountedRoutes.push(route.path);
  }

}


// ============================================================
// API Route Discovery
// ============================================================

router.get("/routes", (req, res) => {

  res.status(200).json({
    success: true,
    version: API_VERSION,
    routes: routeRegistry.map((route) => ({
      path: `/api/${API_VERSION}${route.path}`,
      mounted: mountedRoutes.includes(route.path)
    }))
  });

});


// ============================================================
// 404 API Handler
// ============================================================

router.use((req, res) => {

  res.status(404).json({
    success: false,
    error: {
      code: "API_ROUTE_NOT_FOUND",
      message: "مسار API غير موجود."
    }
  });

});


// ============================================================
// Export
// ============================================================

module.exports = router;
