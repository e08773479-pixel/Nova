"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createMessageController({
  messageService
} = {}) {
  if (!messageService) {
    throw new Error("Message service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await messageService.create({
          ...(req.body || {}),
          conversationId:
            req.params.conversationId ||
            req.body?.conversationId,
          senderId: req.user.id
        });

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getById(req, res, next) {
    try {
      const message =
        await messageService.getById(
          req.params.id
        );

      return success(res, message);
    } catch (error) {
      return next(error);
    }
  }

  async function list(req, res, next) {
    try {
      const result =
        await messageService.list(
          req.params.conversationId,
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 50,
            offset:
              Number(req.query.offset) || 0,
            before: req.query.before || null,
            after: req.query.after || null
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
        await messageService.updateText(
          req.params.id,
          req.user.id,
          req.body?.text
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function remove(req, res, next) {
    try {
      const result =
        await messageService.remove(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function delivered(req, res, next) {
    try {
      const result =
        await messageService.markDelivered(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function read(req, res, next) {
    try {
      const result =
        await messageService.markRead(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function readConversation(req, res, next) {
    try {
      const result =
        await messageService.markConversationRead(
          req.params.conversationId,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function search(req, res, next) {
    try {
      const result =
        await messageService.search(
          req.params.conversationId,
          req.user.id,
          req.query.q,
          {
            limit:
              Number(req.query.limit) || 20,
            offset:
              Number(req.query.offset) || 0
          }
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function replyChain(req, res, next) {
    try {
      const result =
        await messageService.getReplyChain(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    getById,
    list,
    update,
    remove,
    delivered,
    read,
    readConversation,
    search,
    replyChain
  });
}

module.exports = {
  createMessageController
};
