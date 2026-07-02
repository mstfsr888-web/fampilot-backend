// force rebuild 2026-07-02-v5 (decisive trigger after source fix)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[boot] 1/4 creating Nest application...');
  const app = await NestFactory.create(AppModule);

  console.log('[boot] 2/4 app created, applying config...');
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN || '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT || 3000);
  console.log(`[boot] 3/4 calling listen on 0.0.0.0:${port} ...`);
  await app.listen(port, '0.0.0.0');

  console.log(`[boot] 4/4 FamPilot API UP on :${port}/api/v1`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[boot] FATAL during bootstrap:', err);
  process.exit(1);
});
