import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  // The global validation pipe, error filter and success-envelope interceptor are
  // registered as APP_* providers in `AppModule`.
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT') ?? 3002;

  await app.listen(port);
}

void bootstrap();
