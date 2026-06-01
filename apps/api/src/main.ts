import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** PM2 cwd is apps/api; compiled main lives in dist/. */
function resolveApiEnvPath(): string {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '..', '.env'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

const envPath = resolveApiEnvPath();
const envResult = loadEnv({ path: envPath });
if (envResult.error && !existsSync(envPath)) {
  console.warn(`[bootstrap] No .env at ${envPath} — set DATABASE_URL and GOOGLE_DRIVE_* in the environment.`);
} else if (envResult.parsed) {
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const hasDrive =
    Boolean(process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN?.trim()) ||
    Boolean(process.env.GOOGLE_DRIVE_CREDENTIALS?.trim()) ||
    Boolean(process.env.GOOGLE_DRIVE_CREDENTIALS_PATH?.trim()) ||
    existsSync(resolve(process.cwd(), 'secure', 'google-drive-service-account.json'));
  console.log(
    `[bootstrap] Loaded ${envPath} (DATABASE_URL=${hasDb ? 'yes' : 'no'}, Google Drive=${hasDrive ? 'yes' : 'no'})`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Increase body parser limits for large template configs
  const { json, urlencoded } = require('express');
  const compression = require('compression');
  app.use(compression());
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS — allow all configured frontend origins
  app.enableCors({
    origin: true, // For development, allow all origins to bypass CORS issues
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('VB Digital ID Cards API')
    .setDescription('Multi-tenant SaaS API for School ID Card Management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 VB Digital ID Cards API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
