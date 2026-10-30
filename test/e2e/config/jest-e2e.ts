import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '../../..',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': [
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
    '^@lib/([^/]+)$': '<rootDir>/libs/$1/src',
    '^@lib/([^/]+)/(.*)$': '<rootDir>/libs/$1/src/$2',
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
