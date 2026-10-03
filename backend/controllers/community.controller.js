"use strict";

const {
  success,
  created
} = require("../api/response");

function createCommunityController({
  communityService
} = {}) {
  if (!communityService) {
    throw new Error("Community service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await communityService.create(
          req.body || {},
          req.user.id
        );

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getById(req, res, next) {
    try {
      const result =
        await communityService.getById(
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
        await communityService.update(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function list(req, res, next) {
    try {
      const result =
        await communityService.list({
          limit:
            Number(req.query.limit) || 20,
          offset:
            Number(req.query.offset) || 0,
          status: req.query.status,
          visibility:
            req.query.visibility || null
        });

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function search(req, res, next) {
    try {
      const result =
        await communityService.search(
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

  async function archive(req, res, next) {
    try {
      const result =
        await communityService.archive(
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
        await communityService.restore(
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
        await communityService.disable(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function join(req, res, next) {
    try {
      const result =
        await communityService.join(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function leave(req, res, next) {
    try {
      const result =
        await communityService.leave(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function membership(req, res, next) {
    try {
      const result =
        await communityService.getMembership(
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
        await communityService.listMembers(
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

  async function updateMemberRole(req, res, next) {
    try {
      const result =
        await communityService.updateMemberRole(
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

  async function ban(req, res, next) {
    try {
      const result =
        await communityService.banMember(
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
        await communityService.unbanMember(
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
    list,
    search,
    archive,
    restore,
    disable,
    join,
    leave,
    membership,
    members,
    updateMemberRole,
    ban,
    unban
  });
}

module.exports = {
  createCommunityController
};
