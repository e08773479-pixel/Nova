"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createConversationController({
  conversationService
} = {}) {
  if (!conversationService) {
    throw new Error("Conversation service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await conversationService.create({
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
        await conversationService.getById(
          req.params.id
        );

      await conversationService.getMembership(
        req.params.id,
        req.user.id
      );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function listMine(req, res, next) {
    try {
      const result =
        await conversationService.listUserConversations(
          req.user.id,
          {
            limit:
              Number(req.query.limit) || 30,
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
        await conversationService.update(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function archive(req, res, next) {
    try {
      const result =
        await conversationService.archive(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function restore(req, res, next) {
    try {
      const result =
        await conversationService.restore(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function disable(req, res, next) {
    try {
      const result =
        await conversationService.disable(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function addMember(req, res, next) {
    try {
      const result =
        await conversationService.addMember(
          req.params.id,
          req.user.id,
          req.body?.userId,
          req.body?.role
        );

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function removeMember(req, res, next) {
    try {
      const result =
        await conversationService.removeMember(
          req.params.id,
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function leave(req, res, next) {
    try {
      const result =
        await conversationService.leave(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function members(req, res, next) {
    try {
      const result =
        await conversationService.listMembers(
          req.params.id,
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

  async function updateMemberRole(req, res, next) {
    try {
      const result =
        await conversationService.updateMemberRole(
          req.params.id,
          req.user.id,
          req.params.userId,
          req.body?.role
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function mute(req, res, next) {
    try {
      const result =
        await conversationService.muteConversation(
          req.params.id,
          req.user.id,
          req.body?.muted !== false
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function pin(req, res, next) {
    try {
      const result =
        await conversationService.pinConversation(
          req.params.id,
          req.user.id,
          req.body?.pinned !== false
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    getById,
    listMine,
    update,
    archive,
    restore,
    disable,
    addMember,
    removeMember,
    leave,
    members,
    updateMemberRole,
    mute,
    pin
  });
}

module.exports = {
  createConversationController
};
