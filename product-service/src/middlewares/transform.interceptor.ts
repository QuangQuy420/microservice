import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, map } from 'rxjs';
import { PaginatedResponseDto } from '../routes/dto/paginated-response.dto';

/** Ops probe — stays raw `{"status":"ok"}`, deliberately outside the envelope. */
const HEALTH_PATH = '/health';

/**
 * Global success envelope: `{"data": ...}` for a single resource or a plain list, plus a
 * `meta` sibling for a paginated one. The saga consumer isn't HTTP, so it never passes
 * through here.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === HEALTH_PATH) return next.handle();

    return next
      .handle()
      .pipe(map((payload: unknown) => this.envelope(payload)));
  }

  private envelope(payload: unknown): unknown {
    // A 204 handler (every DELETE here) returns `undefined` — wrapping it would turn an
    // empty body into `{}`.
    if (payload === undefined) return payload;
    if (payload instanceof PaginatedResponseDto) {
      return { data: payload.items, meta: payload.meta };
    }
    return { data: payload };
  }
}
