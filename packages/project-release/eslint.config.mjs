import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          // rxjs is used in version executor for post-target execution with observables
          // Optional dependencies are used via dynamic imports in specific executors
          ignoredDependencies: [
            'rxjs',
            '@aws-sdk/client-s3',
            'archiver',
            '@types/archiver',
            'tar',
            '@types/tar'
          ]
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  {
    files: ['**/package.json'],
    rules: {
      '@nx/nx-plugin-checks': 'error'
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  }
];
