"use strict";

/**
 * NOVA — Call Service
 * =========================================================
 *
 * مسؤول عن منطق المكالمات:
 * - إنشاء المكالمة
 * - بدء المكالمة
 * - الانضمام
 * - مغادرة المكالمة
 * - إنهاء المكالمة
 * - رفض المكالمة
 * - إلغاء المكالمة
 * - تحديث حالة المشاركين
 * - جلب المكالمات
 * - التحقق من صلاحية المشاركة
 *
 * لا يتعامل مباشرة مع Express أو قاعدة البيانات.
 * يعتمد على repositories وservices يتم حقنها.
 *
 * لا توجد بيانات وهمية.
 */

class CallServiceError extends Error {
  constructor(
    code,
    message,
    statusCode = 400,
    details = null
  ) {
    super(message);

    this.name = "CallServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}


// ============================================================
// Constants
// ============================================================

const CALL_TYPES = Object.freeze({
  VOICE: "voice",
  VIDEO: "video"
});


const CALL_STATUS = Object.freeze({
  RINGING: "ringing",
  ACTIVE: "active",
  ENDED: "ended",
  DECLINED: "declined",
  MISSED: "missed",
  CANCELLED: "cancelled",
  FAILED: "failed"
});


const PARTICIPANT_STATUS = Object.freeze({
  INVITED: "invited",
  RINGING: "ringing",
  JOINED: "joined",
  LEFT: "left",
  DECLINED: "declined",
  REMOVED: "removed"
});


const MEDIA_STATE = Object.freeze({
  ENABLED: "enabled",
  DISABLED: "disabled"
});


const VALID_CALL_TYPES = Object.freeze(
  Object.values(CALL_TYPES)
);

const VALID_CALL_STATUSES = Object.freeze(
  Object.values(CALL_STATUS)
);

const VALID_PARTICIPANT_STATUSES = Object.freeze(
  Object.values(PARTICIPANT_STATUS)
);

const DEFAULT_MAX_PARTICIPANTS = 2;


// ============================================================
// Errors
// ============================================================

function callNotFound() {
  return new CallServiceError(
    "CALL_NOT_FOUND",
    "المكالمة غير موجودة.",
    404
  );
}


function callRepositoryUnavailable() {
  return new CallServiceError(
    "CALL_REPOSITORY_NOT_CONFIGURED",
    "خدمة المكالمات غير مهيأة.",
    503
  );
}


function participantRepositoryUnavailable() {
  return new CallServiceError(
    "CALL_PARTICIPANT_REPOSITORY_NOT_CONFIGURED",
    "خدمة مشاركي المكالمات غير مهيأة.",
    503
  );
}


function callAccessDenied() {
  return new CallServiceError(
    "CALL_ACCESS_DENIED",
    "لا تملك صلاحية الوصول إلى هذه المكالمة.",
    403
  );
}


// ============================================================
// Helpers
// ============================================================

function normalizeId(
  value,
  field = "المعرّف"
) {
  if (
    value === null ||
    value === undefined
  ) {
    throw new CallServiceError(
      "INVALID_ID",
      `${field} مطلوب.`,
      400
    );
  }

  const normalized =
    String(value).trim();

  if (!normalized) {
    throw new CallServiceError(
      "INVALID_ID",
      `${field} غير صالح.`,
      400
    );
  }

  return normalized;
}


function normalizeText(
  value,
  {
    nullable = true,
    maxLength = 500
  } = {}
) {
  if (
    value === null ||
    value === undefined
  ) {
    if (nullable) {
      return null;
    }

    throw new CallServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (
    typeof value !== "string"
  ) {
    throw new CallServiceError(
      "INVALID_TEXT",
      "القيمة النصية غير صالحة.",
      400
    );
  }

  const normalized =
    value.trim();

  if (
    !nullable &&
    !normalized
  ) {
    throw new CallServiceError(
      "REQUIRED_TEXT",
      "القيمة النصية مطلوبة.",
      400
    );
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new CallServiceError(
      "TEXT_TOO_LONG",
      "النص يتجاوز الحد المسموح.",
      400
    );
  }

  return normalized || null;
}


function normalizeEnum(
  value,
  allowed,
  field
) {
  const normalized =
    normalizeText(
      value,
      {
        nullable: false,
        maxLength: 100
      }
    );

  if (
    !allowed.includes(
      normalized
    )
  ) {
    throw new CallServiceError(
      "INVALID_ENUM_VALUE",
      `${field} غير مدعوم.`,
      400
    );
  }

  return normalized;
}


function normalizeBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    value === "true" ||
    value === "1" ||
    value === 1
  ) {
    return true;
  }

  if (
    value === "false" ||
    value === "0" ||
    value === 0
  ) {
    return false;
  }

  throw new CallServiceError(
    "INVALID_BOOLEAN",
    "القيمة المنطقية غير صالحة.",
    400
  );
}


function normalizeLimit(
  value,
  fallback = 50,
  maximum = 100
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(parsed),
      1
    ),
    maximum
  );
}


function normalizeOffset(
  value
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return 0;
  }

  return Math.max(
    Math.floor(parsed),
    0
  );
}


// ============================================================
// Sanitization
// ============================================================

const INTERNAL_FIELDS = Object.freeze([
  "internalNotes",
  "securityToken",
  "privateToken",
  "providerSecret",
  "providerMetadata"
]);


function sanitizeCall(call) {
  if (
    !call ||
    typeof call !== "object"
  ) {
    return null;
  }

  const safe = {
    ...call
  };

  for (
    const field of INTERNAL_FIELDS
  ) {
    delete safe[field];
  }

  return safe;
}


function sanitizeParticipant(
  participant
) {
  if (
    !participant ||
    typeof participant !== "object"
  ) {
    return null;
  }

  const safe = {
    ...participant
  };

  for (
    const field of INTERNAL_FIELDS
  ) {
    delete safe[field];
  }

  return safe;
}


// ============================================================
// Service Factory
// ============================================================

function createCallService(
  dependencies = {}
) {
  const {
    callRepository = null,

    participantRepository = null,

    userRepository = null,

    contactService = null,

    realtimeService = null,

    clock = () => new Date()
  } = dependencies;


  // ==========================================================
  // Repository Requirements
  // ==========================================================

  function requireCallRepository() {
    if (
      !callRepository ||
      typeof callRepository.findOne !==
        "function"
    ) {
      throw callRepositoryUnavailable();
    }
  }


  function requireParticipantRepository() {
    if (
      !participantRepository ||
      typeof participantRepository.findOne !==
        "function"
    ) {
      throw participantRepositoryUnavailable();
    }
  }


  // ==========================================================
  // Get Call
  // ==========================================================

  async function getById(
    callId,
    options = {}
  ) {
    requireCallRepository();

    const id =
      normalizeId(
        callId,
        "معرّف المكالمة"
      );

    const call =
      await callRepository.findOne({
        where: {
          id
        }
      });

    if (!call) {
      if (
        options.required === false
      ) {
        return null;
      }

      throw callNotFound();
    }

    return sanitizeCall(
      call
    );
  }


  // ==========================================================
  // Participant
  // ==========================================================

  async function getParticipant(
    callId,
    userId
  ) {
    requireParticipantRepository();

    const normalizedCallId =
      normalizeId(
        callId,
        "معرّف المكالمة"
      );

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const participant =
      await participantRepository.findOne({
        where: {
          callId:
            normalizedCallId,

          userId:
            normalizedUserId
        }
      });

    return participant
      ? sanitizeParticipant(
          participant
        )
      : null;
  }


  async function requireParticipant(
    callId,
    userId
  ) {
    const participant =
      await getParticipant(
        callId,
        userId
      );

    if (!participant) {
      throw callAccessDenied();
    }

    return participant;
  }


  // ==========================================================
  // Create Call
  // ==========================================================

  async function create(
    input = {},
    initiatorUserId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const initiatorId =
      normalizeId(
        initiatorUserId,
        "معرّف المتصل"
      );

    const type =
      normalizeEnum(
        input.type ||
          CALL_TYPES.VOICE,
        VALID_CALL_TYPES,
        "نوع المكالمة"
      );


    const targetUserIds =
      Array.isArray(
        input.targetUserIds
      )
        ? input.targetUserIds
        : [];


    const uniqueTargetIds =
      [
        ...new Set(
          targetUserIds.map(
            id =>
              normalizeId(
                id,
                "معرّف المستخدم"
              )
          )
        )
      ].filter(
        id =>
          String(id) !==
          String(initiatorId)
      );


    if (
      uniqueTargetIds.length === 0
    ) {
      throw new CallServiceError(
        "CALL_TARGET_REQUIRED",
        "يجب تحديد مستخدم واحد على الأقل للمكالمة.",
        400
      );
    }


    const maxParticipants =
      Number.isFinite(
        Number(
          input.maxParticipants
        )
      )
        ? Math.max(
            Number(
              input.maxParticipants
            ),
            2
          )
        : Math.max(
            uniqueTargetIds.length + 1,
            DEFAULT_MAX_PARTICIPANTS
          );


    if (
      uniqueTargetIds.length + 1 >
      maxParticipants
    ) {
      throw new CallServiceError(
        "CALL_PARTICIPANT_LIMIT_EXCEEDED",
        "عدد المشاركين يتجاوز الحد المسموح.",
        400
      );
    }


    if (
      userRepository &&
      typeof userRepository.findOne ===
        "function"
    ) {
      for (
        const targetId of uniqueTargetIds
      ) {
        const target =
          await userRepository.findOne({
            where: {
              id:
                targetId
            }
          });

        if (!target) {
          throw new CallServiceError(
            "CALL_TARGET_NOT_FOUND",
            "أحد مستخدمي المكالمة غير موجود.",
            404
          );
        }
      }
    }


    if (
      contactService &&
      typeof contactService.isBlocked ===
        "function"
    ) {
      for (
        const targetId of uniqueTargetIds
      ) {
        const blocked =
          await contactService.isBlocked(
            initiatorId,
            targetId
          );

        if (blocked) {
          throw new CallServiceError(
            "CALL_BLOCKED",
            "لا يمكن بدء المكالمة مع أحد المستخدمين المحددين.",
            403
          );
        }
      }
    }


    const now =
      clock();

    const callData = {
      type,

      status:
        CALL_STATUS.RINGING,

      initiatorId,

      maxParticipants,

      createdAt:
        now,

      updatedAt:
        now,

      startedAt:
        null,

      endedAt:
        null
    };


    const call =
      await callRepository.create(
        callData
      );


    if (!call) {
      throw new CallServiceError(
        "CALL_CREATE_FAILED",
        "تعذر إنشاء المكالمة.",
        500
      );
    }


    const participants = [];


    const initiatorParticipant =
      await participantRepository.create({
        callId:
          call.id,

        userId:
          initiatorId,

        status:
          PARTICIPANT_STATUS.JOINED,

        joinedAt:
          now,

        leftAt:
          null,

        microphone:
          MEDIA_STATE.ENABLED,

        camera:
          type === CALL_TYPES.VIDEO
            ? MEDIA_STATE.ENABLED
            : MEDIA_STATE.DISABLED,

        createdAt:
          now,

        updatedAt:
          now
      });


    if (
      !initiatorParticipant
    ) {
      throw new CallServiceError(
        "CALL_INITIATOR_PARTICIPANT_FAILED",
        "تعذر تسجيل المتصل.",
        500
      );
    }


    participants.push(
      sanitizeParticipant(
        initiatorParticipant
      )
    );


    for (
      const targetId of uniqueTargetIds
    ) {
      const participant =
        await participantRepository.create({
          callId:
            call.id,

          userId:
            targetId,

          status:
            PARTICIPANT_STATUS.RINGING,

          joinedAt:
            null,

          leftAt:
            null,

          microphone:
            MEDIA_STATE.ENABLED,

          camera:
            type === CALL_TYPES.VIDEO
              ? MEDIA_STATE.ENABLED
              : MEDIA_STATE.DISABLED,

          createdAt:
            now,

          updatedAt:
            now
        });


      if (!participant) {
        throw new CallServiceError(
          "CALL_PARTICIPANT_CREATE_FAILED",
          "تعذر إضافة أحد المشاركين إلى المكالمة.",
          500
        );
      }


      participants.push(
        sanitizeParticipant(
          participant
        )
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.created",
        {
          call:
            sanitizeCall(call),

          participants
        }
      );
    }


    return {
      call:
        sanitizeCall(call),

      participants
    };
  }


  // ==========================================================
  // Start Call
  // ==========================================================

  async function start(
    callId,
    userId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const participant =
      await requireParticipant(
        call.id,
        userId
      );


    if (
      participant.status !==
        PARTICIPANT_STATUS.JOINED &&
      participant.userId !==
        String(userId)
    ) {
      throw new CallServiceError(
        "INVALID_CALL_PARTICIPANT_STATE",
        "حالة مشارك المكالمة غير صالحة للبدء.",
        400
      );
    }


    if (
      call.status ===
      CALL_STATUS.ACTIVE
    ) {
      return call;
    }


    if (
      call.status !==
      CALL_STATUS.RINGING
    ) {
      throw new CallServiceError(
        "CALL_CANNOT_START",
        "لا يمكن بدء المكالمة في حالتها الحالية.",
        400
      );
    }


    const now =
      clock();


    const updated =
      await callRepository.update(
        call.id,
        {
          status:
            CALL_STATUS.ACTIVE,

          startedAt:
            now,

          updatedAt:
            now
        }
      );


    if (!updated) {
      throw new CallServiceError(
        "CALL_START_FAILED",
        "تعذر بدء المكالمة.",
        500
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.started",
        {
          call:
            sanitizeCall(updated)
        }
      );
    }


    return sanitizeCall(
      updated
    );
  }


  // ==========================================================
  // Join Call
  // ==========================================================

  async function join(
    callId,
    userId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const participant =
      await getParticipant(
        call.id,
        userId
      );


    if (!participant) {
      throw callAccessDenied();
    }


    if (
      participant.status ===
      PARTICIPANT_STATUS.DECLINED
    ) {
      throw new CallServiceError(
        "CALL_INVITATION_DECLINED",
        "تم رفض دعوة المكالمة.",
        403
      );
    }


    if (
      participant.status ===
      PARTICIPANT_STATUS.LEFT
    ) {
      throw new CallServiceError(
        "CALL_PARTICIPANT_LEFT",
        "لقد غادرت هذه المكالمة.",
        400
      );
    }


    if (
      participant.status ===
      PARTICIPANT_STATUS.REMOVED
    ) {
      throw new CallServiceError(
        "CALL_PARTICIPANT_REMOVED",
        "تمت إزالتك من المكالمة.",
        403
      );
    }


    if (
      participant.status ===
      PARTICIPANT_STATUS.JOINED
    ) {
      return {
        call:
          sanitizeCall(call),

        participant
      };
    }


    if (
      call.status ===
      CALL_STATUS.ENDED ||
      call.status ===
      CALL_STATUS.CANCELLED ||
      call.status ===
      CALL_STATUS.DECLINED
    ) {
      throw new CallServiceError(
        "CALL_ALREADY_CLOSED",
        "المكالمة انتهت.",
        400
      );
    }


    if (
      typeof participantRepository.count ===
      "function"
    ) {
      const joinedCount =
        await participantRepository.count({
          where: {
            callId:
              call.id,

            status:
              PARTICIPANT_STATUS.JOINED
          }
        });


      if (
        joinedCount >=
        call.maxParticipants
      ) {
        throw new CallServiceError(
          "CALL_FULL",
          "المكالمة ممتلئة حاليًا.",
          409
        );
      }
    }


    const now =
      clock();


    const updatedParticipant =
      await participantRepository.update(
        participant.id,
        {
          status:
            PARTICIPANT_STATUS.JOINED,

          joinedAt:
            now,

          leftAt:
            null,

          updatedAt:
            now
        }
      );


    if (
      !updatedParticipant
    ) {
      throw new CallServiceError(
        "CALL_JOIN_FAILED",
        "تعذر الانضمام إلى المكالمة.",
        500
      );
    }


    if (
      call.status ===
      CALL_STATUS.RINGING
    ) {
      await callRepository.update(
        call.id,
        {
          status:
            CALL_STATUS.ACTIVE,

          startedAt:
            call.startedAt ||
            now,

          updatedAt:
            now
        }
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.participant.joined",
        {
          callId:
            call.id,

          participant:
            sanitizeParticipant(
              updatedParticipant
            )
        }
      );
    }


    const updatedCall =
      await getById(
        call.id
      );


    return {
      call:
        updatedCall,

      participant:
        sanitizeParticipant(
          updatedParticipant
        )
    };
  }


  // ==========================================================
  // Leave Call
  // ==========================================================

  async function leave(
    callId,
    userId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const participant =
      await requireParticipant(
        call.id,
        userId
      );


    if (
      participant.status ===
      PARTICIPANT_STATUS.LEFT
    ) {
      return participant;
    }


    const now =
      clock();


    const updated =
      await participantRepository.update(
        participant.id,
        {
          status:
            PARTICIPANT_STATUS.LEFT,

          leftAt:
            now,

          updatedAt:
            now
        }
      );


    if (!updated) {
      throw new CallServiceError(
        "CALL_LEAVE_FAILED",
        "تعذر مغادرة المكالمة.",
        500
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.participant.left",
        {
          callId:
            call.id,

          participant:
            sanitizeParticipant(
              updated
            )
        }
      );
    }


    return sanitizeParticipant(
      updated
    );
  }


  // ==========================================================
  // Decline Call
  // ==========================================================

  async function decline(
    callId,
    userId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const participant =
      await requireParticipant(
        call.id,
        userId
      );


    if (
      participant.status ===
      PARTICIPANT_STATUS.JOINED
    ) {
      throw new CallServiceError(
        "CALL_ALREADY_JOINED",
        "لا يمكن رفض المكالمة بعد الانضمام إليها.",
        400
      );
    }


    const now =
      clock();


    const updated =
      await participantRepository.update(
        participant.id,
        {
          status:
            PARTICIPANT_STATUS.DECLINED,

          declinedAt:
            now,

          updatedAt:
            now
        }
      );


    if (!updated) {
      throw new CallServiceError(
        "CALL_DECLINE_FAILED",
        "تعذر رفض المكالمة.",
        500
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.participant.declined",
        {
          callId:
            call.id,

          participant:
            sanitizeParticipant(
              updated
            )
        }
      );
    }


    return sanitizeParticipant(
      updated
    );
  }


  // ==========================================================
  // Cancel Call
  // ==========================================================

  async function cancel(
    callId,
    userId
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const initiatorId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );


    if (
      String(call.initiatorId) !==
      String(initiatorId)
    ) {
      throw callAccessDenied();
    }


    if (
      call.status !==
      CALL_STATUS.RINGING
    ) {
      throw new CallServiceError(
        "CALL_CANNOT_CANCEL",
        "لا يمكن إلغاء المكالمة في حالتها الحالية.",
        400
      );
    }


    const now =
      clock();


    const updated =
      await callRepository.update(
        call.id,
        {
          status:
            CALL_STATUS.CANCELLED,

          endedAt:
            now,

          updatedAt:
            now
        }
      );


    if (!updated) {
      throw new CallServiceError(
        "CALL_CANCEL_FAILED",
        "تعذر إلغاء المكالمة.",
        500
      );
    }


    if (
      typeof participantRepository.query ===
      "function"
    ) {
      await participantRepository.query({
        type:
          "closePendingParticipants",

        callId:
          call.id,

        status:
          PARTICIPANT_STATUS.REMOVED,

        updatedAt:
          now
      });
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.cancelled",
        {
          call:
            sanitizeCall(updated)
        }
      );
    }


    return sanitizeCall(
      updated
    );
  }


  // ==========================================================
  // End Call
  // ==========================================================

  async function end(
    callId,
    userId,
    reason = null
  ) {
    requireCallRepository();
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    const actor =
      await requireParticipant(
        call.id,
        userId
      );


    if (
      actor.status !==
      PARTICIPANT_STATUS.JOINED
    ) {
      throw new CallServiceError(
        "ACTIVE_PARTICIPANT_REQUIRED",
        "يجب أن تكون مشاركًا نشطًا لإنهاء المكالمة.",
        403
      );
    }


    if (
      call.status ===
      CALL_STATUS.ENDED
    ) {
      return call;
    }


    const normalizedReason =
      reason
        ? normalizeText(
            reason,
            {
              maxLength: 300
            }
          )
        : null;


    const now =
      clock();


    const updated =
      await callRepository.update(
        call.id,
        {
          status:
            CALL_STATUS.ENDED,

          endedAt:
            now,

          endReason:
            normalizedReason,

          endedBy:
            normalizeId(
              userId,
              "معرّف المنهي"
            ),

          updatedAt:
            now
        }
      );


    if (!updated) {
      throw new CallServiceError(
        "CALL_END_FAILED",
        "تعذر إنهاء المكالمة.",
        500
      );
    }


    if (
      typeof participantRepository.query ===
      "function"
    ) {
      await participantRepository.query({
        type:
          "closeActiveParticipants",

        callId:
          call.id,

        status:
          PARTICIPANT_STATUS.LEFT,

        leftAt:
          now,

        updatedAt:
          now
      });
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.ended",
        {
          call:
            sanitizeCall(updated)
        }
      );
    }


    return sanitizeCall(
      updated
    );
  }


  // ==========================================================
  // Update Media State
  // ==========================================================

  async function updateMediaState(
    callId,
    userId,
    changes = {}
  ) {
    requireParticipantRepository();

    const participant =
      await requireParticipant(
        callId,
        userId
      );


    if (
      participant.status !==
      PARTICIPANT_STATUS.JOINED
    ) {
      throw new CallServiceError(
        "ACTIVE_PARTICIPANT_REQUIRED",
        "يجب أن تكون داخل المكالمة لتغيير إعدادات الوسائط.",
        403
      );
    }


    const updateData = {};


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "microphone"
      )
    ) {
      updateData.microphone =
        normalizeBoolean(
          changes.microphone
        )
          ? MEDIA_STATE.ENABLED
          : MEDIA_STATE.DISABLED;
    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "camera"
      )
    ) {
      updateData.camera =
        normalizeBoolean(
          changes.camera
        )
          ? MEDIA_STATE.ENABLED
          : MEDIA_STATE.DISABLED;
    }


    if (
      Object.keys(updateData).length === 0
    ) {
      throw new CallServiceError(
        "NO_MEDIA_CHANGES",
        "لم يتم إرسال أي تغيير.",
        400
      );
    }


    updateData.updatedAt =
      clock();


    const updated =
      await participantRepository.update(
        participant.id,
        updateData
      );


    if (!updated) {
      throw new CallServiceError(
        "MEDIA_STATE_UPDATE_FAILED",
        "تعذر تحديث إعدادات المكالمة.",
        500
      );
    }


    if (
      realtimeService &&
      typeof realtimeService.emitCallEvent ===
        "function"
    ) {
      await realtimeService.emitCallEvent(
        "call.participant.media.updated",
        {
          callId:
            callId,

          participant:
            sanitizeParticipant(
              updated
            )
        }
      );
    }


    return sanitizeParticipant(
      updated
    );
  }


  // ==========================================================
  // List Participants
  // ==========================================================

  async function listParticipants(
    callId,
    userId,
    options = {}
  ) {
    requireParticipantRepository();

    const call =
      await getById(
        callId
      );

    await requireParticipant(
      call.id,
      userId
    );


    const limit =
      normalizeLimit(
        options.limit,
        100,
        200
      );

    const offset =
      normalizeOffset(
        options.offset
      );


    const result =
      await participantRepository.findMany({
        where: {
          callId:
            call.id
        },

        limit,

        offset,

        sort: {
          createdAt: "asc"
        }
      });


    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return {
      items:
        items.map(
          sanitizeParticipant
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // List User Calls
  // ==========================================================

  async function listForUser(
    userId,
    options = {}
  ) {
    requireCallRepository();

    const normalizedUserId =
      normalizeId(
        userId,
        "معرّف المستخدم"
      );

    const limit =
      normalizeLimit(
        options.limit
      );

    const offset =
      normalizeOffset(
        options.offset
      );


    if (
      typeof callRepository.query !==
      "function"
    ) {
      throw new CallServiceError(
        "CALL_HISTORY_UNAVAILABLE",
        "سجل المكالمات غير مهيأ.",
        503
      );
    }


    const result =
      await callRepository.query({
        type:
          "listCallsForUser",

        userId:
          normalizedUserId,

        status:
          options.status || null,

        type:
          options.type || null,

        limit,

        offset
      });


    const items =
      Array.isArray(result)
        ? result
        : result?.items || [];


    return {
      items:
        items.map(
          sanitizeCall
        ),

      limit,

      offset,

      total:
        result?.total ?? null
    };
  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {
    getById,

    getParticipant,

    requireParticipant,

    create,

    start,

    join,

    leave,

    decline,

    cancel,

    end,

    updateMediaState,

    listParticipants,

    listForUser,

    sanitizeCall,

    sanitizeParticipant
  };
}


// ============================================================
// Exports
// ============================================================

module.exports = {
  CallServiceError,

  createCallService,

  callNotFound,

  callRepositoryUnavailable,

  participantRepositoryUnavailable,

  callAccessDenied,

  normalizeId,

  normalizeText,

  normalizeEnum,

  normalizeBoolean,

  normalizeLimit,

  normalizeOffset,

  sanitizeCall,

  sanitizeParticipant,

  CALL_TYPES,

  CALL_STATUS,

  PARTICIPANT_STATUS,

  MEDIA_STATE,

  VALID_CALL_TYPES,

  VALID_CALL_STATUSES,

  VALID_PARTICIPANT_STATUSES,

  DEFAULT_MAX_PARTICIPANTS
};
