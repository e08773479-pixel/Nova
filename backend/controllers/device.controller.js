"use strict";

const {
  success,
  created
} = require("../api/response");

function createDeviceController({
  deviceService
} = {}) {
  if (!deviceService) {
    throw new Error("Device service is required.");
  }

  async function register(req, res, next) {
    try {
      const result =
        await deviceService.register({
          ...(req.body || {}),
          userId: req.user.id
        });

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getById(req, res, next) {
    try {
      const result =
        await deviceService.getById(
          req.params.id
        );

      if (result.userId !== req.user.id) {
        const error = new Error(
          "لا يمكنك الوصول إلى هذا الجهاز."
        );
        error.statusCode = 403;
        throw error;
      }

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function list(req, res, next) {
    try {
      const result =
        await deviceService.list(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function update(req, res, next) {
    try {
      const result =
        await deviceService.update(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function touch(req, res, next) {
    try {
      const result =
        await deviceService.touch(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function revoke(req, res, next) {
    try {
      const result =
        await deviceService.revoke(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function revokeAllExcept(req, res, next) {
    try {
      const result =
        await deviceService.revokeAllExcept(
          req.user.id,
          req.body?.currentDeviceId || null
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function pushToken(req, res, next) {
    try {
      const result =
        await deviceService.setPushToken(
          req.params.id,
          req.user.id,
          req.body?.pushToken
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    register,
    getById,
    list,
    update,
    touch,
    revoke,
    revokeAllExcept,
    pushToken
  });
}

module.exports = {
  createDeviceController
};
