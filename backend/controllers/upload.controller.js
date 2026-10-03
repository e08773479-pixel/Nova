"use strict";

const {
  success,
  created
} = require("../api/response");

function createUploadController({
  attachmentService,
  uploadProvider = null
} = {}) {
  if (!attachmentService) {
    throw new Error(
      "Attachment service is required."
    );
  }

  async function create(req, res, next) {
    try {
      if (!uploadProvider?.upload) {
        const error = new Error(
          "Upload provider is not configured."
        );

        error.statusCode = 503;
        error.code = "UPLOAD_PROVIDER_REQUIRED";

        throw error;
      }

      const file =
        req.file ||
        (Array.isArray(req.files)
          ? req.files[0]
          : null);

      if (!file) {
        const error = new Error(
          "لم يتم إرسال ملف."
        );

        error.statusCode = 400;
        error.code = "FILE_REQUIRED";

        throw error;
      }

      const uploaded =
        await uploadProvider.upload(file, {
          userId: req.user.id,
          requestId: req.requestId
        });

      const attachment =
        await attachmentService.create({
          ownerId: req.user.id,
          type:
            req.body?.type ||
            uploaded.type ||
            "file",
          name:
            req.body?.name ||
            uploaded.name ||
            file.originalname,
          mimeType:
            uploaded.mimeType ||
            file.mimetype,
          size:
            uploaded.size ||
            file.size,
          storageKey:
            uploaded.storageKey,
          url:
            uploaded.url || null,
          metadata:
            uploaded.metadata || null
        });

      return created(res, attachment);
    } catch (error) {
      return next(error);
    }
  }

  async function complete(req, res, next) {
    try {
      if (
        typeof attachmentService.markReady !==
        "function"
      ) {
        const error = new Error(
          "Attachment completion is not configured."
        );

        error.statusCode = 503;
        error.code =
          "ATTACHMENT_COMPLETION_UNAVAILABLE";

        throw error;
      }

      const result =
        await attachmentService.markReady(
          req.params.id,
          req.user.id,
          req.body || {}
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async function fail(req, res, next) {
    try {
      if (
        typeof attachmentService.markFailed !==
        "function"
      ) {
        const error = new Error(
          "Attachment failure handling is not configured."
        );

        error.statusCode = 503;
        error.code =
          "ATTACHMENT_FAILURE_UNAVAILABLE";

        throw error;
      }

      const result =
        await attachmentService.markFailed(
          req.params.id,
          req.user.id,
          req.body?.reason || null
        );

      return success(res, result);
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    create,
    complete,
    fail
  });
}

module.exports = {
  createUploadController
};
