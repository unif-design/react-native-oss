module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/sdk/'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@unif/react-native-oss$': '<rootDir>/src/index.ts',
    '^@unif/react-native-oss/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native[a-z-]*|@react-native|@unif)/)',
  ],
  clearMocks: true,
  restoreMocks: true,
};
