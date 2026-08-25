module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.int-spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-int.ts'],
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'js', 'json'],
}
