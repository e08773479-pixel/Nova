"use strict";

const {
  success,
  noContent
} = require("../api/response");

function createNotificationController({
  notificationService
} = {}) {
  if (!notificationService) {
    throw new Error(
      "Notification service is required."
    );
  }

  async function list(req, res, next) {
    try {
      const result =
        await notificationService.list(
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 30,
            offset:
              Number(req.query.offset) || 0,
            unreadOnly:
              req.query.unreadOnly === "true"
          }
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getById(req, res, next) {
    try {
      const result =
        await notificationService.getById(
          req.params.id
        );

      if (result.userId !== req.user.id) {
        const error = new Error(
          "لا يمكنك الوصول إلى هذا الإشعار."
        );
        error.statusCode = 403;
        throw error;
      }

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function unreadCount(req, res, next) {
    try {
      const count =
        await notificationService.unreadCount(
          req.user.id
        );

      return success(res, { count });
    } catch (error) {
      return next(error);
    }
  }

  async function markRead(req, res, next) {
    try {
      const result =
        await notificationService.markRead(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function markAllRead(req, res, next) {
    try {
      const result =
        await notificationService.markAllRead(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function remove(req, res, next) {
    try {
      await notificationService.remove(
        req.params.id,
        req.user.id
      );

      return noContent(res);
    } catch (error) {
      return next(error);
    }
  }

  async function removeAll(req, res, next) {
    try {
      await notificationService.removeAll(
        req.user.id
      );

      return noContent(res);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    list,
    getById,
    unreadCount,
    markRead,
    markAllRead,
    remove,
    removeAll
  });
}

module.exports = {
  createNotificationController
};
