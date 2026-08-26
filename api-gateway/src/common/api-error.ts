import { UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * The single error shape every service in this stack answers with:
 * `{"error": {"code", "message", "details"?}}`. `code` is the stable,
 * machine-readable key `web` translates; `message` is English developer-facing
 * text, used as the display fallback for codes `web` doesn't know yet.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, string[]>,
): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/**
 * True when a body already carries the envelope. Proxied downstream failures
 * are recognised this way and forwarded verbatim — backends own their own
 * codes and messages, the gateway must never rewrite them.
 */
export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }

  const { error } = body as { error: unknown };
  return typeof error === 'object' && error !== null;
}

/**
 * `ValidationPipe` factory for gateway-authored validation failures: 422
 * `VALIDATION_ERROR` with `details` keyed by field, values ALWAYS arrays of
 * messages (one shape everywhere, NFR4).
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): UnprocessableEntityException {
  const details: Record<string, string[]> = {};
  collectDetails(errors, '', details);

  return new UnprocessableEntityException(
    apiError('VALIDATION_ERROR', 'Invalid input', details),
  );
}

function collectDetails(
  errors: ValidationError[],
  prefix: string,
  details: Record<string, string[]>,
): void {
  for (const error of errors) {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});

    if (messages.length > 0) {
      details[field] = [...(details[field] ?? []), ...messages];
    }

    if (error.children && error.children.length > 0) {
      collectDetails(error.children, field, details);
    }
  }
}
