import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '../../..',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
        diagnostics: {
          warnOnly: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@lib/cache(|/.*)$': '<rootDir>/libs/cache/src/$1',
    '^@lib/global(|/.*)$': '<rootDir>/libs/global/src/$1',
    '^@lib/logger(|/.*)$': '<rootDir>/libs/logger/src/$1',
    '^@lib/mail(|/.*)$': '<rootDir>/libs/mail/src/$1',
    '^@lib/object(|/.*)$': '<rootDir>/libs/object/src/$1',
    '^@lib/prisma$': '<rootDir>/libs/prisma/src/index.ts',
    '^@lib/prisma/(.*)$': '<rootDir>/libs/prisma/src/$1',
    '^@lib/redis(|/.*)$': '<rootDir>/libs/redis/src/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@gsainfoteam/nest-observability$':
      '<rootDir>/test/unit/mocks/nest-observability.ts',
  },
  globalSetup: '<rootDir>/test/e2e/config/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/e2e/config/setup/global-teardown.ts',
  preset: 'ts-jest',
  moduleDirectories: ['node_modules', '<rootDir>/libs'],
  modulePaths: ['<rootDir>/libs'],
  roots: ['<rootDir>/test/', '<rootDir>/src/'],
};

export default config;
