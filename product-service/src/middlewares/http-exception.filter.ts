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
 * Payload of the unified error envelope. `details` is always `{field: [messages]}` — one
 * shape everywhere (NFR4), only ever filled in by the validation pipe.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Fallback `code` per status for errors thrown WITHOUT one — framework/library errors
 * (`ParseUUIDPipe`, unknown route, body-parser). Business errors carry their own code in the
 * exception payload (`new NotFoundException({ code, message })`) and never reach this map.
 */
const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'MALFORMED_REQUEST',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'FILE_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'THROTTLED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

/** Plain numbers (not `HttpStatus` members) — statuses here are arbitrary integers. */
const LOWEST_ERROR_STATUS = 400;
const LOWEST_SERVER_ERROR_STATUS = 500;
const HIGHEST_STATUS = 599;

/** Shape of a business error thrown as `new HttpException({ code, message }, status)`. */
interface CodedExceptionResponse {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Global error envelope: every failure leaves this service as
 * `{"error": {"code", "message", "details"?}}` with the HTTP status as the authority.
 * Non-HTTP errors (a thrown `Error`, a DB driver failure) become 500 `INTERNAL_ERROR` and
 * are logged — their raw message never reaches the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.resolveStatus(exception);

    if (status >= LOWEST_SERVER_ERROR_STATUS) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response
      .status(status)
      .json({ error: this.toErrorBody(exception, status) });
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    // body-parser rejects an unparseable JSON body with a plain `SyntaxError` carrying a
    // `status` — it never becomes an HttpException, so read it here.
    const status = (exception as { status?: unknown })?.status;
    if (
      typeof status === 'number' &&
      status >= LOWEST_ERROR_STATUS &&
      status <= HIGHEST_STATUS
    ) {
      return status;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toErrorBody(exception: unknown, status: number): ApiErrorBody {
    const isServerError = status >= LOWEST_SERVER_ERROR_STATUS;
    const fallbackCode =
      DEFAULT_CODES[status] ??
      (isServerError ? 'INTERNAL_ERROR' : 'MALFORMED_REQUEST');

    if (!(exception instanceof HttpException)) {
      return {
        code: fallbackCode,
        message: isServerError ? 'Internal server error' : 'Malformed request',
      };
    }

    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return { code: fallbackCode, message: payload };
    }

    const coded = payload as Partial<CodedExceptionResponse> & {
      message?: string | string[];
    };
    return {
      code: typeof coded.code === 'string' ? coded.code : fallbackCode,
      message: this.toMessage(coded.message, exception.message),
      ...(coded.details ? { details: coded.details } : {}),
    };
  }

  /** Nest's built-in exceptions put one string OR a list of strings in `message`. */
  private toMessage(
    message: string | string[] | undefined,
    fallback: string,
  ): string {
    if (Array.isArray(message)) return message.join('; ');
    return message ?? fallback;
  }
}
