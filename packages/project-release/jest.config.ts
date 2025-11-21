export default {
  displayName: 'project-release',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/project-release',

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/**/types.ts',
    '!src/index.ts'
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],

  // Coverage thresholds (starting low, will increase as more comprehensive tests are added)
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 3,
      statements: 3
    }
  }
};
