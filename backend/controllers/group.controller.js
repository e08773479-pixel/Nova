"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createGroupController({
  groupService
} = {}) {
  if (!groupService) {
    throw new Error("Group service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await groupService.create({
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
        await groupService.getById(
          req.params.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function update(req, res, next) {
    try {
      const result =
        await groupService.update(
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
        await groupService.archive(
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
        await groupService.restore(
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
        await groupService.addMember(
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
        await groupService.removeMember(
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
        await groupService.leave(
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
        await groupService.listMembers(
          req.params.id,
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

  async function userGroups(req, res, next) {
    try {
      const result =
        await groupService.listUserGroups(
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

  async function search(req, res, next) {
    try {
      const result =
        await groupService.searchGroups(
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

  async function updateMemberRole(req, res, next) {
    try {
      const result =
        await groupService.updateMemberRole(
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

  async function transferOwnership(req, res, next) {
    try {
      const result =
        await groupService.transferOwnership(
          req.params.id,
          req.user.id,
          req.body?.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function ban(req, res, next) {
    try {
      const result =
        await groupService.banMember(
          req.params.id,
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function unban(req, res, next) {
    try {
      const result =
        await groupService.unbanMember(
          req.params.id,
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    getById,
    update,
    archive,
    restore,
    addMember,
    removeMember,
    leave,
    members,
    userGroups,
    search,
    updateMemberRole,
    transferOwnership,
    ban,
    unban
  });
}

module.exports = {
  createGroupController
};
