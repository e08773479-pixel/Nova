"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createAttachmentController({
  attachmentService
} = {}) {
  if (!attachmentService) {
    throw new Error("Attachment service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await attachmentService.create({
          ...(req.body || {}),
          ownerId: req.user.id
        });

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getById(req, res, next) {
    try {
      const result =
        await attachmentService.getById(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function attachToMessage(req, res, next) {
    try {
      const result =
        await attachmentService.attachToMessage(
          req.params.id,
          req.body?.messageId,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function listByMessage(req, res, next) {
    try {
      const result =
        await attachmentService.listByMessage(
          req.params.messageId,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function listByConversation(req, res, next) {
    try {
      const result =
        await attachmentService.listByConversation(
          req.params.conversationId,
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

  async function accessUrl(req, res, next) {
    try {
      const result =
        await attachmentService.getAccessUrl(
          req.params.id,
          req.user.id
        );

      return success(res, {
        url: result
      });
    } catch (error) {
      return next(error);
    }
  }

  async function remove(req, res, next) {
    try {
      await attachmentService.remove(
        req.params.id,
        req.user.id
      );

      return noContent(res);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    getById,
    attachToMessage,
    listByMessage,
    listByConversation,
    accessUrl,
    remove
  });
}

module.exports = {
  createAttachmentController
};
