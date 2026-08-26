import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { AppConfigModule } from './config/app-config.module';
import { FaceAnalysisModule } from './routes/face-analysis.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';
import { OrdersModule } from './routes/orders.module';
import { AuthModule } from './routes/auth.module';
import { UsersModule } from './routes/users.module';
import { RolesModule } from './routes/roles.module';
import { RecommendationsModule } from './routes/recommendations.module';

@Module({
  imports: [
            AppConfigModule,
            ProductsModule,
            OrdersModule,
            FaceAnalysisModule,
            AuthModule,
            UsersModule,
            RolesModule,
            RecommendationsModule,
  ],
  controllers: [HealthController],
  // Registered here (not in `main.ts`) so e2e suites building the app from
  // `AppModule` alone exercise the same error envelope as production.
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
