/**
 * NestJS Application Bootstrap
 * Production-ready configuration with graceful shutdown support.
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor, TimeoutInterceptor } from './common/interceptors';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(30000),
  );

  // CORS
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, starting graceful shutdown...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, starting graceful shutdown...');
    await app.close();
    process.exit(0);
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Health check: http://localhost:${port}/health`);
  logger.log(`Metrics: http://localhost:${port}/health/metrics`);
}

bootstrap();
