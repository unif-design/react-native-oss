const config = require('./jest.config.cjs');
module.exports = {
  ...config,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/__tests__/sdk/**/*.test.ts'],
};
