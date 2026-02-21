/**
 * Logging interceptor for request/response tracking.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const correlationId = request.get('x-correlation-id') || this.generateId();

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const { statusCode } = response;

          this.logger.log(
            `${method} ${url} ${statusCode} - ${duration}ms`,
            {
              method,
              url,
              statusCode,
              duration,
              ip,
              userAgent: userAgent.substring(0, 50),
              correlationId,
            },
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;

          this.logger.error(
            `${method} ${url} ERROR - ${duration}ms: ${error.message}`,
            {
              method,
              url,
              duration,
              ip,
              correlationId,
              error: error.message,
            },
          );
        },
      }),
    );
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
