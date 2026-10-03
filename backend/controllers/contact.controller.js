"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createContactController({
  contactService
} = {}) {
  if (!contactService) {
    throw new Error("Contact service is required.");
  }

  async function sendRequest(req, res, next) {
    try {
      const result =
        await contactService.sendRequest(
          req.user.id,
          req.body?.userId
        );

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function accept(req, res, next) {
    try {
      const result =
        await contactService.acceptRequest(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function reject(req, res, next) {
    try {
      const result =
        await contactService.rejectRequest(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function cancel(req, res, next) {
    try {
      const result =
        await contactService.cancelRequest(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function remove(req, res, next) {
    try {
      await contactService.removeContact(
        req.user.id,
        req.params.userId
      );

      return noContent(res);
    } catch (error) {
      return next(error);
    }
  }

  async function block(req, res, next) {
    try {
      const result =
        await contactService.blockUser(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function unblock(req, res, next) {
    try {
      const result =
        await contactService.unblockUser(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function list(req, res, next) {
    try {
      const result =
        await contactService.listContacts(
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

  async function pending(req, res, next) {
    try {
      const result =
        await contactService.listPendingRequests(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function blocked(req, res, next) {
    try {
      const result =
        await contactService.listBlockedUsers(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function relationship(req, res, next) {
    try {
      const result =
        await contactService.getRelationshipStatus(
          req.user.id,
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    sendRequest,
    accept,
    reject,
    cancel,
    remove,
    block,
    unblock,
    list,
    pending,
    blocked,
    relationship
  });
}

module.exports = {
  createContactController
};
