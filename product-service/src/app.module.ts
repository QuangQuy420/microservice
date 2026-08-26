import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm-options';
import { CatalogModule } from './catalog.module';
import { HealthModule } from './health.module';
import { HttpExceptionFilter } from './middlewares/http-exception.filter';
import { TransformInterceptor } from './middlewares/transform.interceptor';
import { createValidationPipe } from './middlewares/validation.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmOptions(process.env),
    }),
    CatalogModule,
    HealthModule,
  ],
  // Registered here rather than in `main.ts` so the supertest e2e app (which boots
  // `AppModule` directly) answers with exactly the same envelope as the running service.
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
