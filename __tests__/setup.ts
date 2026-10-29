jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: {
        LibraryDir: '/fixture/library',
        DocumentDir: '/fixture/documents',
      },
    },
  },
}));
jest.mock('@dr.pogodin/react-native-fs', () => ({}));
jest.mock('@dr.pogodin/react-native-static-server', () => ({
  __esModule: true,
  default: jest.fn(),
  getActiveServer: jest.fn(),
  STATES: { ACTIVE: 'ACTIVE' },
}));
