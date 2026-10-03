"use strict";

const {
  success,
  created
} = require("../api/response");

function createCallController({
  callService
} = {}) {
  if (!callService) {
    throw new Error("Call service is required.");
  }

  async function create(req, res, next) {
    try {
      const result =
        await callService.create({
          ...(req.body || {}),
          callerId: req.user.id
        });

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function start(req, res, next) {
    try {
      const result =
        await callService.start(
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
        await callService.join(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function leave(req, res, next) {
    try {
      const result =
        await callService.leave(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function decline(req, res, next) {
    try {
      const result =
        await callService.decline(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function cancel(req, res, next) {
    try {
      const result =
        await callService.cancel(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function end(req, res, next) {
    try {
      const result =
        await callService.end(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function participants(req, res, next) {
    try {
      const result =
        await callService.listParticipants(
          req.params.id,
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function media(req, res, next) {
    try {
      const result =
        await callService.updateMediaState(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function mine(req, res, next) {
    try {
      const result =
        await callService.listUserCalls(
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

  return Object.freeze({
    create,
    start,
    join,
    leave,
    decline,
    cancel,
    end,
    participants,
    media,
    mine
  });
}

module.exports = {
  createCallController
};
