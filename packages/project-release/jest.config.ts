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

  // Coverage thresholds (Phase 1 & 2 partially completed)
  // Phase 1: Utility functions (ci-detection, checksum, commit-parser, markdown-generator)
  // Phase 2: Executors (changelog, publish completed; project-release, version pending)
  coverageThreshold: {
    global: {
      branches: 23,
      functions: 30,
      lines: 29,
      statements: 30
    }
  }
};
