export function extractErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "unknown";
  }

  const withMessage = error as {
    message?: unknown;
    body?: {
      message?: unknown;
    };
  };

  if (typeof withMessage.body?.message === "string") {
    return withMessage.body.message;
  }

  if (typeof withMessage.message === "string") {
    return withMessage.message;
  }

  return "unknown";
}

function extractErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const withCode = error as {
    code?: unknown;
    body?: {
      code?: unknown;
    };
  };

  if (typeof withCode.body?.code === "string") {
    return withCode.body.code.toUpperCase();
  }

  if (typeof withCode.code === "string") {
    return withCode.code.toUpperCase();
  }

  return null;
}

const INVALID_RESET_TOKEN_CODES = new Set([
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "TOKEN_USED",
  "VERIFICATION_NOT_FOUND",
]);

const INVALID_RESET_TOKEN_PATTERNS = [
  "invalid_token",
  "invalid token",
  "token_expired",
  "token expired",
  "expired token",
  "already used",
  "token used",
  "verification not found",
];

export function isInvalidResetTokenError(error: unknown): boolean {
  const code = extractErrorCode(error);
  if (code && INVALID_RESET_TOKEN_CODES.has(code)) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return INVALID_RESET_TOKEN_PATTERNS.some((pattern) => message.includes(pattern));
}
