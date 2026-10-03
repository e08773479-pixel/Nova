"use strict";

const {
  success,
  created,
  noContent
} = require("../api/response");

function createProfileController({
  profileService
} = {}) {
  if (!profileService) {
    throw new Error("Profile service is required.");
  }

  async function getByUserId(req, res, next) {
    try {
      const result =
        await profileService.getByUserId(
          req.params.userId
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getMine(req, res, next) {
    try {
      const result =
        await profileService.getByUserId(
          req.user.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function create(req, res, next) {
    try {
      const result =
        await profileService.create({
          ...req.body,
          userId: req.user.id
        });

      return created(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function update(req, res, next) {
    try {
      const result =
        await profileService.update(
          req.params.userId || req.user.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function updateAvatar(req, res, next) {
    try {
      const result =
        await profileService.updateAvatar(
          req.user.id,
          req.body?.avatar
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function updateCover(req, res, next) {
    try {
      const result =
        await profileService.updateCover(
          req.user.id,
          req.body?.cover
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function updateVisibility(req, res, next) {
    try {
      const result =
        await profileService.updateVisibility(
          req.user.id,
          req.body?.visibility
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function getPublic(req, res, next) {
    try {
      const result =
        await profileService.getPublicProfile(
          req.params.userId,
          req.user?.id
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    getByUserId,
    getMine,
    create,
    update,
    updateAvatar,
    updateCover,
    updateVisibility,
    getPublic
  });
}

module.exports = {
  createProfileController
};
