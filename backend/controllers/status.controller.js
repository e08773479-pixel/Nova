"use strict";

const {
  success,
  created
} = require("../api/response");

function createStatusController({
  statusService
} = {}) {
  if (!statusService) {
    throw new Error("Status service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await statusService.create({
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
        await statusService.getById(
          req.params.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function mine(req, res, next) {
    try {
      const result =
        await statusService.listUserStatuses(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function visible(req, res, next) {
    try {
      const result =
        await statusService.listVisibleStatuses(
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 50,
            offset:
              Number(req.query.offset) || 0
          }
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function update(req, res, next) {
    try {
      const result =
        await statusService.update(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function remove(req, res, next) {
    try {
      const result =
        await statusService.remove(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function viewed(req, res, next) {
    try {
      const result =
        await statusService.markViewed(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function viewers(req, res, next) {
    try {
      const result =
        await statusService.listViewers(
          req.params.id,
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 100,
            offset:
              Number(req.query.offset) || 0
          }
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    getById,
    mine,
    visible,
    update,
    remove,
    viewed,
    viewers
  });
}

module.exports = {
  createStatusController
};
