import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Default `error.code` per HTTP status, used when the thrower didn't pick a more specific
 * one. 400 covers protocol-level breakage only (a malformed UUID in the path, an unparseable
 * body); field/business validation would be 422 — this service has no request bodies today,
 * but the mapping stays so the envelope is identical to the other services'.
 */
const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'MALFORMED_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'INVALID_TOKEN',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'THROTTLED',
};

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/** Shape a thrower can pass to a Nest exception to override the default code/details. */
interface HttpExceptionPayload {
  code?: string;
  message?: string | string[];
  details?: Record<string, string[]>;
}

/**
 * Global filter turning every failure into the unified envelope
 * `{"error": {"code", "message", "details"?}}` with an English message. Callers pick a
 * business code by throwing a Nest exception with an object payload (e.g.
 * `new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: '...' })`); anything else —
 * pipe failures, framework 404s, unexpected errors — falls back to the status map above.
 * Health stays raw (`{"status":"ok"}`) because it never throws.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        'Unhandled exception while serving a request',
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        } satisfies ErrorBody,
      });
      return;
    }

    const status = exception.getStatus();
    response
      .status(status)
      .json({ error: this.toErrorBody(exception, status) });
  }

  private toErrorBody(exception: HttpException, status: number): ErrorBody {
    const code = DEFAULT_CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR';
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { code, message: payload };
    }

    const {
      code: payloadCode,
      message,
      details,
    } = payload as HttpExceptionPayload;
    return {
      code: payloadCode ?? code,
      message: Array.isArray(message)
        ? message.join('; ')
        : (message ?? exception.message),
      ...(details ? { details } : {}),
    };
  }
}
