// Application logger. Structured JSON in production, pretty in dev.
//
// Usage:
//   import { logger } from '@/lib/logger';
//   logger.info({ userId }, 'request received');
//
// Child loggers give every module a stable `module` tag for filtering:
//   const log = logger.child({ module: 'payments' });

import pino, { type Logger } from 'pino';

const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
const level = process.env.LOG_LEVEL ?? (appEnv === 'production' ? 'info' : 'debug');

const isDev = appEnv !== 'production' && appEnv !== 'staging';

export const logger: Logger = pino({
  level,
  base: {
    env: appEnv,
    service: 'joinmytable',
  },
  redact: {
    paths: [
      'password',
      'token',
      '*.password',
      '*.token',
      'authorization',
      'headers.authorization',
      'headers.cookie',
      '*.card',
      '*.cardNumber',
    ],
    censor: '[redacted]',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname,service,env',
          },
        },
      }
    : {}),
});

export type AppLogger = typeof logger;
