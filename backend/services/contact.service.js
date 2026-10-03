"use strict";

/**
 * NOVA — Contact Service
 * =========================================================
 *
 * طبقة منطق جهات الاتصال والعلاقات الأساسية بين المستخدمين.
 *
 * المسؤوليات:
 * - إضافة جهة اتصال
 * - إزالة جهة اتصال
 * - قبول/رفض طلبات الاتصال
 * - حظر مستخدم
 * - إلغاء الحظر
 * - جلب جهات الاتصال
 * - البحث في العلاقات
 * - التحقق من حالة العلاقة
 *
 * لا يحتوي على:
 * - بيانات وهمية
 * - Express
 * - SQL
 * - MongoDB
 * - اتصال مباشر بقاعدة البيانات
 *
 * التخزين يمر عبر Contact Repository.
 */


// ============================================================
// Errors
// ============================================================

class ContactServiceError extends Error {

  constructor(
    code,
    message,
    statusCode = 400,
    details = null
  ) {

    super(message);

    this.name =
      "ContactServiceError";

    this.code =
      code;

    this.statusCode =
      statusCode;

    this.details =
      details;

    this.expose =
      true;

  }

}


function contactNotFound() {

  return new ContactServiceError(
    "CONTACT_NOT_FOUND",
    "العلاقة غير موجودة.",
    404
  );

}


function repositoryUnavailable() {

  return new ContactServiceError(
    "CONTACT_REPOSITORY_NOT_CONFIGURED",
    "خدمة جهات الاتصال غير مهيأة.",
    503
  );

}


// ============================================================
// Constants
// ============================================================

const RELATIONSHIP_STATUS = Object.freeze({

  PENDING: "pending",

  ACCEPTED: "accepted",

  REJECTED: "rejected",

  BLOCKED: "blocked",

  DECLINED: "declined"

});


const RELATIONSHIP_TYPES = Object.freeze({

  CONTACT: "contact",

  FRIEND: "friend",

  BLOCK: "block"

});


const VALID_STATUSES =
  Object.freeze(
    Object.values(
      RELATIONSHIP_STATUS
    )
  );


// ============================================================
// Helpers
// ============================================================

function normalizeUserId(
  userId
) {

  if (
    userId === null ||
    userId === undefined
  ) {

    throw new ContactServiceError(
      "INVALID_USER_ID",
      "معرّف المستخدم مطلوب.",
      400
    );

  }


  const value =
    String(
      userId
    ).trim();


  if (
    value.length === 0
  ) {

    throw new ContactServiceError(
      "INVALID_USER_ID",
      "معرّف المستخدم غير صالح.",
      400
    );

  }


  return value;

}


function normalizeStatus(
  status
) {

  if (
    typeof status !==
    "string"
  ) {

    throw new ContactServiceError(
      "INVALID_RELATIONSHIP_STATUS",
      "حالة العلاقة غير صالحة.",
      400
    );

  }


  const normalized =
    status.trim().toLowerCase();


  if (
    !VALID_STATUSES.includes(
      normalized
    )
  ) {

    throw new ContactServiceError(
      "INVALID_RELATIONSHIP_STATUS",
      "حالة العلاقة غير مدعومة.",
      400
    );

  }


  return normalized;

}


function ensureDifferentUsers(
  firstUserId,
  secondUserId
) {

  if (
    String(firstUserId) ===
    String(secondUserId)
  ) {

    throw new ContactServiceError(
      "SELF_RELATIONSHIP_NOT_ALLOWED",
      "لا يمكن إنشاء علاقة مع حسابك نفسه.",
      400
    );

  }

}


// ============================================================
// Safe Contact
// ============================================================

const INTERNAL_FIELDS = [

  "secret",

  "privateKey",

  "internalNotes"

];


function sanitizeContact(
  contact
) {

  if (
    !contact ||
    typeof contact !==
    "object"
  ) {

    return null;

  }


  const safeContact = {
    ...contact
  };


  for (
    const field of
      INTERNAL_FIELDS
  ) {

    delete safeContact[field];

  }


  return safeContact;

}


// ============================================================
// Service Factory
// ============================================================

function createContactService(
  dependencies = {}
) {

  const {

    contactRepository = null,

    userRepository = null,

    clock = () => new Date()

  } =
    dependencies;


  // ==========================================================
  // Repository
  // ==========================================================

  function requireRepository() {

    if (
      !contactRepository ||
      typeof contactRepository.findOne !==
      "function"
    ) {

      throw repositoryUnavailable();

    }

  }


  // ==========================================================
  // Find Relationship
  // ==========================================================

  async function findRelationship(
    userId,
    targetUserId,
    options = {}
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    /*
     * The repository is responsible for
     * resolving database-specific relation
     * queries.
     */

    const relationship =
      await contactRepository.findOne({

        where: {

          userId:
            sourceId,

          contactUserId:
            targetId

        },

        includeBlocked:
          options.includeBlocked === true

      });


    return relationship
      ? sanitizeContact(
          relationship
        )
      : null;

  }


  // ==========================================================
  // Find Either Direction
  // ==========================================================

  async function findBetweenUsers(
    firstUserId,
    secondUserId
  ) {

    requireRepository();


    const firstId =
      normalizeUserId(
        firstUserId
      );


    const secondId =
      normalizeUserId(
        secondUserId
      );


    ensureDifferentUsers(
      firstId,
      secondId
    );


    const direct =
      await contactRepository.findOne({

        where: {

          userId:
            firstId,

          contactUserId:
            secondId

        }

      });


    if (
      direct
    ) {

      return sanitizeContact(
        direct
      );

    }


    const reverse =
      await contactRepository.findOne({

        where: {

          userId:
            secondId,

          contactUserId:
            firstId

        }

      });


    return reverse
      ? sanitizeContact(
          reverse
        )
      : null;

  }


  // ==========================================================
  // Send Contact Request
  // ==========================================================

  async function sendRequest(
    userId,
    targetUserId,
    metadata = {}
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    /*
     * Optional existence check.
     */

    if (
      userRepository &&
      typeof userRepository.findOne ===
      "function"
    ) {

      const target =
        await userRepository.findOne({

          where: {

            id:
              targetId

          }

        });


      if (
        !target
      ) {

        throw new ContactServiceError(
          "TARGET_USER_NOT_FOUND",
          "المستخدم المطلوب غير موجود.",
          404
        );

      }

    }


    const existing =
      await findBetweenUsers(
        sourceId,
        targetId
      );


    if (
      existing
    ) {

      if (
        existing.status ===
        RELATIONSHIP_STATUS.ACCEPTED
      ) {

        throw new ContactServiceError(
          "ALREADY_CONNECTED",
          "المستخدم موجود بالفعل ضمن جهات الاتصال.",
          409
        );

      }


      if (
        existing.status ===
        RELATIONSHIP_STATUS.PENDING
      ) {

        throw new ContactServiceError(
          "REQUEST_ALREADY_EXISTS",
          "يوجد طلب اتصال قائم بالفعل.",
          409
        );

      }


      if (
        existing.status ===
        RELATIONSHIP_STATUS.BLOCKED
      ) {

        throw new ContactServiceError(
          "RELATIONSHIP_BLOCKED",
          "لا يمكن إرسال الطلب بسبب وجود حظر.",
          403
        );

      }

    }


    const data = {

      userId:
        sourceId,

      contactUserId:
        targetId,

      type:
        RELATIONSHIP_TYPES.CONTACT,

      status:
        RELATIONSHIP_STATUS.PENDING,

      createdAt:
        clock(),

      updatedAt:
        clock()

    };


    if (
      metadata &&
      typeof metadata ===
      "object"
    ) {

      if (
        metadata.source
      ) {

        data.source =
          String(
            metadata.source
          );

      }

    }


    const created =
      await contactRepository.create(
        data
      );


    if (
      !created
    ) {

      throw new ContactServiceError(
        "CONTACT_REQUEST_FAILED",
        "تعذر إرسال طلب الاتصال.",
        500
      );

    }


    return sanitizeContact(
      created
    );

  }


  // ==========================================================
  // Accept Request
  // ==========================================================

  async function acceptRequest(
    userId,
    requesterUserId
  ) {

    requireRepository();


    const targetId =
      normalizeUserId(
        userId
      );


    const requesterId =
      normalizeUserId(
        requesterUserId
      );


    ensureDifferentUsers(
      targetId,
      requesterId
    );


    const request =
      await contactRepository.findOne({

        where: {

          userId:
            requesterId,

          contactUserId:
            targetId,

          status:
            RELATIONSHIP_STATUS.PENDING

        }

      });


    if (
      !request
    ) {

      throw contactNotFound();

    }


    const updated =
      await contactRepository.update(
        request.id,
        {

          status:
            RELATIONSHIP_STATUS.ACCEPTED,

          acceptedAt:
            clock(),

          updatedAt:
            clock()

        }
      );


    if (
      !updated
    ) {

      throw new ContactServiceError(
        "ACCEPT_REQUEST_FAILED",
        "تعذر قبول طلب الاتصال.",
        500
      );

    }


    /*
     * Some database designs store both directions.
     * If the repository supports it, create the
     * reciprocal accepted relationship.
     *
     * This is optional and intentionally delegated
     * to the repository/database design.
     */

    if (
      typeof contactRepository.findOne ===
      "function" &&
      typeof contactRepository.create ===
      "function"
    ) {

      const reciprocal =
        await contactRepository.findOne({

          where: {

            userId:
              targetId,

            contactUserId:
              requesterId

          }

        });


      if (
        !reciprocal
      ) {

        await contactRepository.create({

          userId:
            targetId,

          contactUserId:
            requesterId,

          type:
            RELATIONSHIP_TYPES.CONTACT,

          status:
            RELATIONSHIP_STATUS.ACCEPTED,

          acceptedAt:
            clock(),

          createdAt:
            clock(),

          updatedAt:
            clock()

        });

      } else if (
        reciprocal.status !==
        RELATIONSHIP_STATUS.ACCEPTED
      ) {

        await contactRepository.update(
          reciprocal.id,
          {

            status:
              RELATIONSHIP_STATUS.ACCEPTED,

            acceptedAt:
              clock(),

            updatedAt:
              clock()

          }
        );

      }

    }


    return sanitizeContact(
      updated
    );

  }


  // ==========================================================
  // Reject Request
  // ==========================================================

  async function rejectRequest(
    userId,
    requesterUserId
  ) {

    requireRepository();


    const targetId =
      normalizeUserId(
        userId
      );


    const requesterId =
      normalizeUserId(
        requesterUserId
      );


    ensureDifferentUsers(
      targetId,
      requesterId
    );


    const request =
      await contactRepository.findOne({

        where: {

          userId:
            requesterId,

          contactUserId:
            targetId,

          status:
            RELATIONSHIP_STATUS.PENDING

        }

      });


    if (
      !request
    ) {

      throw contactNotFound();

    }


    const updated =
      await contactRepository.update(
        request.id,
        {

          status:
            RELATIONSHIP_STATUS.REJECTED,

          rejectedAt:
            clock(),

          updatedAt:
            clock()

        }
      );


    if (
      !updated
    ) {

      throw new ContactServiceError(
        "REJECT_REQUEST_FAILED",
        "تعذر رفض طلب الاتصال.",
        500
      );

    }


    return sanitizeContact(
      updated
    );

  }


  // ==========================================================
  // Cancel Request
  // ==========================================================

  async function cancelRequest(
    userId,
    targetUserId
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    const request =
      await contactRepository.findOne({

        where: {

          userId:
            sourceId,

          contactUserId:
            targetId,

          status:
            RELATIONSHIP_STATUS.PENDING

        }

      });


    if (
      !request
    ) {

      throw contactNotFound();

    }


    if (
      typeof contactRepository.delete ===
      "function"
    ) {

      await contactRepository.delete(
        request.id
      );

      return {

        cancelled:
          true,

        userId:
          sourceId,

        targetUserId:
          targetId

      };

    }


    const updated =
      await contactRepository.update(
        request.id,
        {

          status:
            RELATIONSHIP_STATUS.DECLINED,

          updatedAt:
            clock()

        }
      );


    return {

      cancelled:
        true,

      relationship:
        sanitizeContact(
          updated
        )

    };

  }


  // ==========================================================
  // Remove Contact
  // ==========================================================

  async function removeContact(
    userId,
    targetUserId
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    const relationship =
      await findBetweenUsers(
        sourceId,
        targetId
      );


    if (
      !relationship
    ) {

      throw contactNotFound();

    }


    if (
      typeof contactRepository.delete !==
      "function"
    ) {

      throw new ContactServiceError(
        "REMOVE_NOT_SUPPORTED",
        "إزالة جهة الاتصال غير مدعومة.",
        503
      );

    }


    await contactRepository.delete(
      relationship.id
    );


    return {

      removed:
        true,

      userId:
        sourceId,

      targetUserId:
        targetId

    };

  }


  // ==========================================================
  // Block User
  // ==========================================================

  async function blockUser(
    userId,
    targetUserId
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    const existing =
      await contactRepository.findOne({

        where: {

          userId:
            sourceId,

          contactUserId:
            targetId

        }

      });


    if (
      existing
    ) {

      const updated =
        await contactRepository.update(
          existing.id,
          {

            type:
              RELATIONSHIP_TYPES.BLOCK,

            status:
              RELATIONSHIP_STATUS.BLOCKED,

            blockedAt:
              clock(),

            updatedAt:
              clock()

          }
        );


      return sanitizeContact(
        updated
      );

    }


    const created =
      await contactRepository.create({

        userId:
          sourceId,

        contactUserId:
          targetId,

        type:
          RELATIONSHIP_TYPES.BLOCK,

        status:
          RELATIONSHIP_STATUS.BLOCKED,

        blockedAt:
          clock(),

        createdAt:
          clock(),

        updatedAt:
          clock()

      });


    if (
      !created
    ) {

      throw new ContactServiceError(
        "BLOCK_FAILED",
        "تعذر حظر المستخدم.",
        500
      );

    }


    return sanitizeContact(
      created
    );

  }


  // ==========================================================
  // Unblock User
  // ==========================================================

  async function unblockUser(
    userId,
    targetUserId
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    const relationship =
      await contactRepository.findOne({

        where: {

          userId:
            sourceId,

          contactUserId:
            targetId,

          type:
            RELATIONSHIP_TYPES.BLOCK,

          status:
            RELATIONSHIP_STATUS.BLOCKED

        }

      });


    if (
      !relationship
    ) {

      throw contactNotFound();

    }


    if (
      typeof contactRepository.delete !==
      "function"
    ) {

      throw new ContactServiceError(
        "UNBLOCK_NOT_SUPPORTED",
        "إلغاء الحظر غير مدعوم.",
        503
      );

    }


    await contactRepository.delete(
      relationship.id
    );


    return {

      unblocked:
        true,

      userId:
        sourceId,

      targetUserId:
        targetId

    };

  }


  // ==========================================================
  // List Contacts
  // ==========================================================

  async function listContacts(
    userId,
    options = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const limit =
      Math.min(
        Math.max(
          Number(
            options.limit
          ) || 20,
          1
        ),
        100
      );


    const offset =
      Math.max(
        Number(
          options.offset
        ) || 0,
        0
      );


    const result =
      await contactRepository.findMany({

        where: {

          userId:
            id,

          status:
            options.status
              ? normalizeStatus(
                  options.status
                )
              : RELATIONSHIP_STATUS.ACCEPTED

        },

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
          sanitizeContact
        ),

      limit,

      offset,

      total:
        result?.total ??
        null

    };

  }


  // ==========================================================
  // List Pending Requests
  // ==========================================================

  async function listPendingRequests(
    userId,
    options = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const limit =
      Math.min(
        Math.max(
          Number(
            options.limit
          ) || 20,
          1
        ),
        100
      );


    const offset =
      Math.max(
        Number(
          options.offset
        ) || 0,
        0
      );


    const result =
      await contactRepository.findMany({

        where: {

          contactUserId:
            id,

          status:
            RELATIONSHIP_STATUS.PENDING

        },

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
          sanitizeContact
        ),

      limit,

      offset,

      total:
        result?.total ??
        null

    };

  }


  // ==========================================================
  // List Blocked Users
  // ==========================================================

  async function listBlockedUsers(
    userId,
    options = {}
  ) {

    requireRepository();


    const id =
      normalizeUserId(
        userId
      );


    const limit =
      Math.min(
        Math.max(
          Number(
            options.limit
          ) || 20,
          1
        ),
        100
      );


    const offset =
      Math.max(
        Number(
          options.offset
        ) || 0,
        0
      );


    const result =
      await contactRepository.findMany({

        where: {

          userId:
            id,

          type:
            RELATIONSHIP_TYPES.BLOCK,

          status:
            RELATIONSHIP_STATUS.BLOCKED

        },

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
          sanitizeContact
        ),

      limit,

      offset,

      total:
        result?.total ??
        null

    };

  }


  // ==========================================================
  // Relationship Status
  // ==========================================================

  async function getRelationshipStatus(
    userId,
    targetUserId
  ) {

    const relationship =
      await findBetweenUsers(
        userId,
        targetUserId
      );


    if (
      !relationship
    ) {

      return {

        status:
          "none",

        relationship:
          null

      };

    }


    return {

      status:
        relationship.status ||
        "none",

      relationship

    };

  }


  // ==========================================================
  // Check Contact
  // ==========================================================

  async function isContact(
    userId,
    targetUserId
  ) {

    const result =
      await getRelationshipStatus(
        userId,
        targetUserId
      );


    return (
      result.status ===
      RELATIONSHIP_STATUS.ACCEPTED
    );

  }


  // ==========================================================
  // Check Block
  // ==========================================================

  async function isBlocked(
    userId,
    targetUserId
  ) {

    requireRepository();


    const sourceId =
      normalizeUserId(
        userId
      );


    const targetId =
      normalizeUserId(
        targetUserId
      );


    ensureDifferentUsers(
      sourceId,
      targetId
    );


    const relationship =
      await contactRepository.findOne({

        where: {

          userId:
            sourceId,

          contactUserId:
            targetId,

          type:
            RELATIONSHIP_TYPES.BLOCK,

          status:
            RELATIONSHIP_STATUS.BLOCKED

        }

      });


    return Boolean(
      relationship
    );

  }


  // ==========================================================
  // Public API
  // ==========================================================

  return {

    findRelationship,

    findBetweenUsers,

    sendRequest,

    acceptRequest,

    rejectRequest,

    cancelRequest,

    removeContact,

    blockUser,

    unblockUser,

    listContacts,

    listPendingRequests,

    listBlockedUsers,

    getRelationshipStatus,

    isContact,

    isBlocked,

    sanitizeContact

  };

}


// ============================================================
// Exports
// ============================================================

module.exports = {

  ContactServiceError,

  createContactService,

  contactNotFound,

  repositoryUnavailable,

  normalizeUserId,

  normalizeStatus,

  ensureDifferentUsers,

  sanitizeContact,

  RELATIONSHIP_STATUS,

  RELATIONSHIP_TYPES,

  VALID_STATUSES

};
