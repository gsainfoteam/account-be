import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '../../..',
  testEnvironment: 'node',
  testRegex: '\\.spec\\.ts$',
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
  },
  preset: 'ts-jest',
  moduleDirectories: ['node_modules', '<rootDir>/libs'],
  modulePaths: ['<rootDir>/libs'],
  roots: ['<rootDir>/src/'],
};

export default config;
