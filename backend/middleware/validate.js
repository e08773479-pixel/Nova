"use strict";

/**
 * NOVA — Request Validation Middleware
 * =========================================================
 *
 * مسؤول عن التحقق من:
 * - body
 * - query
 * - params
 *
 * بدون أي بيانات وهمية أو اعتماد على قاعدة البيانات.
 *
 * التصميم يسمح لاحقًا بإضافة:
 * - قواعد API
 * - DTOs
 * - Validation Services
 * - Database-level validation
 *
 * بدون إعادة كتابة الـ Controllers.
 */


// ============================================================
// Validation Error
// ============================================================

class ValidationError extends Error {

  constructor(
    message = "بيانات الطلب غير صحيحة.",
    details = []
  ) {

    super(message);

    this.name =
      "ValidationError";

    this.code =
      "VALIDATION_ERROR";

    this.statusCode =
      400;

    this.details =
      Array.isArray(details)
        ? details
        : [];

    this.expose =
      true;

  }

}


// ============================================================
// Create Validation Error
// ============================================================

function createValidationError(
  message,
  details = []
) {

  return new ValidationError(
    message,
    details
  );

}


// ============================================================
// Helpers
// ============================================================

function isPlainObject(
  value
) {

  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function isEmptyValue(
  value
) {

  return (
    value === undefined ||
    value === null ||
    (
      typeof value === "string" &&
      value.trim() === ""
    )
  );

}


function getValue(
  source,
  path
) {

  if (
    !source ||
    !path
  ) {

    return undefined;

  }


  const parts =
    String(path)
      .split(".")
      .filter(Boolean);


  let current =
    source;


  for (
    const part of parts
  ) {

    if (
      current === null ||
      current === undefined
    ) {

      return undefined;

    }


    current =
      current[part];

  }


  return current;

}


// ============================================================
// Built-in Rules
// ============================================================

const rules = {

  required(value) {

    return !isEmptyValue(
      value
    );

  },


  string(value) {

    return (
      typeof value ===
      "string"
    );

  },


  number(value) {

    return (
      typeof value ===
        "number" &&
      Number.isFinite(
        value
      )
    );

  },


  integer(value) {

    return Number.isInteger(
      value
    );

  },


  boolean(value) {

    return (
      typeof value ===
      "boolean"
    );

  },


  object(value) {

    return isPlainObject(
      value
    );

  },


  array(value) {

    return Array.isArray(
      value
    );

  },


  email(value) {

    if (
      typeof value !==
      "string"
    ) {

      return false;

    }


    /*
     * Basic structural validation.
     * Final email verification belongs
     * to the authentication/service layer.
     */

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(
        value.trim()
      );

  },


  url(value) {

    if (
      typeof value !==
      "string"
    ) {

      return false;

    }


    try {

      new URL(
        value
      );

      return true;

    } catch {

      return false;

    }

  },


  minLength(value, limit) {

    if (
      typeof value !==
      "string"
    ) {

      return false;

    }


    return (
      value.length >=
      Number(limit)
    );

  },


  maxLength(value, limit) {

    if (
      typeof value !==
      "string"
    ) {

      return false;

    }


    return (
      value.length <=
      Number(limit)
    );

  },


  min(value, limit) {

    if (
      typeof value !==
        "number" ||
      !Number.isFinite(
        value
      )
    ) {

      return false;

    }


    return (
      value >=
      Number(limit)
    );

  },


  max(value, limit) {

    if (
      typeof value !==
        "number" ||
      !Number.isFinite(
        value
      )
    ) {

      return false;

    }


    return (
      value <=
      Number(limit)
    );

  },


  in(value, allowed) {

    if (
      !Array.isArray(
        allowed
      )
    ) {

      return false;

    }


    return allowed.includes(
      value
    );

  },


  matches(value, pattern) {

    if (
      typeof value !==
      "string"
    ) {

      return false;

    }


    if (
      !(pattern instanceof RegExp)
    ) {

      return false;

    }


    return pattern.test(
      value
    );

  }

};


// ============================================================
// Rule Resolver
// ============================================================

function resolveRule(
  ruleName
) {

  if (
    typeof ruleName !==
    "string"
  ) {

    return null;

  }


  return rules[
    ruleName
  ] || null;

}


// ============================================================
// Normalize Rule
// ============================================================

function normalizeRule(
  rule
) {

  if (
    typeof rule ===
    "string"
  ) {

    return {

      name: rule,

      args: []

    };

  }


  if (
    Array.isArray(rule)
  ) {

    return {

      name:
        rule[0],

      args:
        rule.slice(1)

    };

  }


  if (
    typeof rule ===
    "function"
  ) {

    return {

      validator:
        rule

    };

  }


  if (
    isPlainObject(rule)
  ) {

    return {

      name:
        rule.name,

      args:
        Array.isArray(
          rule.args
        )
          ? rule.args
          : [],

      validator:
        rule.validator,

      message:
        rule.message

    };

  }


  return null;

}


// ============================================================
// Validate Single Field
// ============================================================

function validateField(
  value,
  field,
  fieldRules,
  options = {}
) {

  const {

    source = "body"

  } = options;


  const normalizedRules =
    Array.isArray(
      fieldRules
    )
      ? fieldRules
      : [fieldRules];


  const errors = [];


  for (
    const rawRule of
      normalizedRules
  ) {

    const rule =
      normalizeRule(
        rawRule
      );


    if (
      !rule
    ) {

      continue;

    }


    let valid = true;


    try {

      if (
        typeof rule.validator ===
        "function"
      ) {

        valid =
          rule.validator(
            value,
            {
              field,
              source
            }
          );

      } else {

        const validator =
          resolveRule(
            rule.name
          );


        if (
          typeof validator !==
          "function"
        ) {

          errors.push({

            field,

            source,

            rule:
              rule.name,

            message:
              `قاعدة التحقق "${rule.name}" غير معروفة.`

          });

          continue;

        }


        valid =
          validator(
            value,
            ...rule.args
          );

      }

    } catch {

      valid =
        false;

    }


    if (
      !valid
    ) {

      errors.push({

        field,

        source,

        rule:
          rule.name ||
          "custom",

        message:
          rule.message ||
          `القيمة الخاصة بـ "${field}" غير صحيحة.`

      });

    }

  }


  return errors;

}


// ============================================================
// Validate Object
// ============================================================

function validateObject(
  data,
  schema,
  options = {}
) {

  const {

    source = "body",

    allowUnknown = true

  } = options;


  const errors = [];


  if (
    !isPlainObject(data)
  ) {

    return [

      {

        field: "",

        source,

        rule:
          "object",

        message:
          "بيانات الطلب يجب أن تكون كائنًا صالحًا."

      }

    ];

  }


  if (
    !isPlainObject(schema)
  ) {

    return errors;

  }


  /*
   * Validate declared fields.
   */

  for (
    const [
      field,
      fieldRules
    ] of Object.entries(
      schema
    )
  ) {

    const value =
      getValue(
        data,
        field
      );


    const fieldErrors =
      validateField(
        value,
        field,
        fieldRules,
        {
          source
        }
      );


    errors.push(
      ...fieldErrors
    );

  }


  /*
   * Unknown fields are allowed by default.
   * This prevents accidental breaking changes.
   *
   * Sensitive endpoints can set:
   * allowUnknown: false
   */

  if (
    !allowUnknown
  ) {

    const allowedFields =
      new Set(
        Object.keys(
          schema
        )
      );


    for (
      const field of
        Object.keys(data)
    ) {

      /*
       * Nested paths are handled by the
       * declared schema. Top-level unknown
       * fields are rejected.
       */

      if (
        !allowedFields.has(
          field
        )
      ) {

        errors.push({

          field,

          source,

          rule:
            "unknown",

          message:
            `الحقل "${field}" غير مسموح به.`

        });

      }

    }

  }


  return errors;

}


// ============================================================
// Main Validation Function
// ============================================================

function validateRequest(
  request,
  schemas = {},
  options = {}
) {

  const {

    body = null,

    query = null,

    params = null

  } = schemas;


  const errors = [];


  if (
    body
  ) {

    errors.push(
      ...validateObject(
        request.body || {},
        body,
        {
          ...options,
          source: "body"
        }
      )
    );

  }


  if (
    query
  ) {

    errors.push(
      ...validateObject(
        request.query || {},
        query,
        {
          ...options,
          source: "query"
        }
      )
    );

  }


  if (
    params
  ) {

    errors.push(
      ...validateObject(
        request.params || {},
        params,
        {
          ...options,
          source: "params"
        }
      )
    );

  }


  return errors;

}


// ============================================================
// Middleware Factory
// ============================================================

function validate(
  schemas = {},
  options = {}
) {

  return function validationMiddleware(
    req,
    res,
    next
  ) {

    try {

      const errors =
        validateRequest(
          req,
          schemas,
          options
        );


      if (
        errors.length > 0
      ) {

        const error =
          createValidationError(
            options.message ||
              "بيانات الطلب غير صحيحة.",
            errors
          );


        return next(
          error
        );

      }


      /*
       * Validation succeeded.
       *
       * We deliberately do not mutate
       * req.body/query/params.
       *
       * Controllers receive the original
       * request data and can later use
       * DTO/service normalization.
       */

      req.validation = {

        valid: true,

        sources: {

          body:
            Boolean(
              schemas.body
            ),

          query:
            Boolean(
              schemas.query
            ),

          params:
            Boolean(
              schemas.params
            )

        }

      };


      return next();

    } catch (error) {

      return next(
        error
      );

    }

  };

}


// ============================================================
// Body Validator
// ============================================================

function validateBody(
  schema,
  options = {}
) {

  return validate(
    {
      body:
        schema

    },
    options
  );

}


// ============================================================
// Query Validator
// ============================================================

function validateQuery(
  schema,
  options = {}
) {

  return validate(
    {
      query:
        schema

    },
    options
  );

}


// ============================================================
// Params Validator
// ============================================================

function validateParams(
  schema,
  options = {}
) {

  return validate(
    {
      params:
        schema

    },
    options
  );

}


// ============================================================
// Combined Validator
// ============================================================

function validateRequestParts(
  schemas,
  options = {}
) {

  return validate(
    schemas,
    options
  );

}


// ============================================================
// Get Validation State
// ============================================================

function getValidationState(
  req
) {

  return req?.validation ||
    null;

}


// ============================================================
// Built-in Rule Registration
// ============================================================

function registerRule(
  name,
  validator
) {

  if (
    typeof name !==
      "string" ||
    name.trim() === ""
  ) {

    throw new TypeError(
      "Validation rule name is required."
    );

  }


  if (
    typeof validator !==
    "function"
  ) {

    throw new TypeError(
      "Validation rule validator must be a function."
    );

  }


  const normalizedName =
    name.trim();


  if (
    Object.prototype.hasOwnProperty.call(
      rules,
      normalizedName
    )
  ) {

    throw new Error(
      `Validation rule "${normalizedName}" already exists.`
    );

  }


  rules[
    normalizedName
  ] =
    validator;


  return normalizedName;

}


// ============================================================
// List Rules
// ============================================================

function listRules() {

  return Object.keys(
    rules
  );

}


// ============================================================
// Exports
// ============================================================

module.exports = {

  ValidationError,

  createValidationError,

  rules,

  resolveRule,

  validateField,

  validateObject,

  validateRequest,

  validate,

  validateBody,

  validateQuery,

  validateParams,

  validateRequestParts,

  getValidationState,

  registerRule,

  listRules,

  getValue,

  isEmptyValue,

  isPlainObject

};
