"use strict";

const {
  success
} = require("../api/response");

function createSecurityController({
  securityService
} = {}) {
  if (!securityService) {
    throw new Error(
      "Security service is required."
    );
  }

  async function getSettings(req, res, next) {
    try {
      const result =
        await securityService.getSettings(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function updateSettings(req, res, next) {
    try {
      const result =
        await securityService.updateSettings(
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function events(req, res, next) {
    try {
      const result =
        await securityService.listEvents(
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 50,
            offset:
              Number(req.query.offset) || 0,
            type:
              req.query.type || null
          }
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function changePassword(req, res, next) {
    try {
      const result =
        await securityService.changePassword({
          userId: req.user.id,
          currentPassword:
            req.body?.currentPassword,
          newPassword:
            req.body?.newPassword
        });

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function revokeSession(req, res, next) {
    try {
      const result =
        await securityService.revokeSession(
          req.user.id,
          req.params.sessionId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function revokeOtherSessions(
    req,
    res,
    next
  ) {
    try {
      const result =
        await securityService.revokeAllOtherSessions(
          req.user.id,
          req.body?.currentSessionId || null
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function revokeDevice(req, res, next) {
    try {
      const result =
        await securityService.revokeDevice(
          req.user.id,
          req.params.deviceId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    getSettings,
    updateSettings,
    events,
    changePassword,
    revokeSession,
    revokeOtherSessions,
    revokeDevice
  });
}

module.exports = {
  createSecurityController
};
