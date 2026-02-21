/**
 * Global HTTP exception filter for standardized error responses.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { IntegrationError } from '../exceptions';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string;
  error?: string;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | undefined;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        error = resp.error as string;
        details = resp.details;
      }
    } else if (exception instanceof IntegrationError) {
      statusCode = exception.retryable
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.BAD_REQUEST;
      message = exception.message;
      error = exception.category;
      details = exception.toJSON();
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    };

    if (error) {
      errorResponse.error = error;
    }
    if (details !== undefined) {
      errorResponse.details = details;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${statusCode}: ${message}`);
    }

    response.status(statusCode).json(errorResponse);
  }
}
