"use strict";

const {
  success,
  created
} = require("../api/response");

function createPrivacyController({
  privacyService
} = {}) {
  if (!privacyService) {
    throw new Error(
      "Privacy service is required."
    );
  }

  async function get(req, res, next) {
    try {
      const result =
        await privacyService.getSettings(
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
        await privacyService.updateSettings(
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getVisibility(req, res, next) {
    try {
      const result =
        await privacyService.getVisibility(
          req.user.id,
          req.params.field
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function setVisibility(req, res, next) {
    try {
      const result =
        await privacyService.setVisibility(
          req.user.id,
          req.params.field,
          req.body?.visibility
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    get,
    update,
    getVisibility,
    setVisibility
  });
}

module.exports = {
  createPrivacyController
};
