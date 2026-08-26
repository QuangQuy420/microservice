import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorBody, apiError, isApiErrorBody } from './api-error';

/**
 * Fallback code per status, used only for gateway-authored failures that
 * carry no code of their own (framework 404s, Nest's default exceptions,
 * anything unhandled).
 */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'MALFORMED_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'INVALID_TOKEN',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'THROTTLED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'UPSTREAM_UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'UPSTREAM_TIMEOUT',
};

/**
 * Normalises GATEWAY-AUTHORED errors to the unified envelope
 * (`{"error": {code, message}}`) so no framework-default body
 * (`{statusCode, message, error}`) ever leaks out of the edge.
 *
 * Proxied failures are NOT touched: the proxy services wrap the downstream
 * body in an `HttpException` as-is, and every backend already emits the
 * envelope, so a body that already contains an `error` object is written back
 * verbatim — codes and messages stay owned by the service that raised them.
 * Successful proxied bodies never reach a filter, so they pass through by
 * construction (no success interceptor here on purpose), and `/health` keeps
 * its raw `{"status": "ok"}` shape.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled gateway error: ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );

      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json(apiError('INTERNAL_ERROR', 'Internal server error'));
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    response
      .status(status)
      .json(isApiErrorBody(body) ? body : this.toEnvelope(status, body, exception));
  }

  private toEnvelope(
    status: number,
    body: unknown,
    exception: HttpException,
  ): ApiErrorBody {
    const code =
      CODE_BY_STATUS[status] ??
      (status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'HTTP_ERROR');

    return apiError(code, this.extractMessage(body, exception));
  }

  private extractMessage(body: unknown, exception: HttpException): string {
    if (typeof body === 'string') {
      return body;
    }

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return message.join('; ');
      }
    }

    return exception.message;
  }
}
