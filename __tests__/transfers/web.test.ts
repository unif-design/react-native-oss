jest.mock('react-native-blob-util', () => {
  throw new Error('Web loaded BlobUtil');
});
jest.mock('@dr.pogodin/react-native-fs', () => {
  throw new Error('Web loaded RNFS');
});
jest.mock(
  'react-native-quick-crypto',
  () => {
    throw new Error('Web loaded native crypto');
  },
  { virtual: true },
);

const get = jest.fn();
const options = {
  authorization: {
    kind: 'managed' as const,
    access: { get, dispose: jest.fn() },
    ossKey: 'ossprivate' as const,
  },
};
const remote = { sourceUrl: 'https://example.test/file', path: 'file' };

test('Web transfer returns unsupported with no native SDK or needless authorization', async () => {
  const {
    transferRemoteFileToOss,
  } = require('@unif/react-native-oss/transfers/transferRemoteFileToOss.web');
  expect(await transferRemoteFileToOss(remote, options)).toMatchObject({
    status: 'failed',
    stage: 'upload',
    error: { reason: 'unsupported' },
  });
  expect(get).not.toHaveBeenCalled();
});
test('Web batch returns common unsupported preparation with all indexes and no authorization', async () => {
  const {
    uploadOssBatch,
  } = require('@unif/react-native-oss/transfers/uploadOssBatch.web');
  expect(
    await uploadOssBatch(
      [
        { kind: 'remote', ...remote },
        { kind: 'local', path: 'file', fileUri: 'file:///tmp/file' },
      ],
      options,
    ),
  ).toMatchObject({
    items: [
      {
        index: 0,
        path: 'file',
        result: { status: 'not_started', reason: 'preparation_failed' },
      },
      {
        index: 1,
        path: 'file',
        result: { status: 'not_started', reason: 'preparation_failed' },
      },
    ],
    preparationError: { reason: 'unsupported' },
  });
  expect(get).not.toHaveBeenCalled();
});
test('Web empty and precancelled calls preserve contract without I/O', async () => {
  const {
    uploadOssBatch,
  } = require('@unif/react-native-oss/transfers/uploadOssBatch.web');
  const {
    transferRemoteFileToOss,
  } = require('@unif/react-native-oss/transfers/transferRemoteFileToOss.web');
  const controller = new AbortController();
  controller.abort();
  const cancelled = { ...options, signal: controller.signal };
  expect(await uploadOssBatch([], options)).toEqual({ items: [] });
  expect(
    await uploadOssBatch([{ kind: 'remote', ...remote }], cancelled),
  ).toEqual({
    items: [
      {
        index: 0,
        path: 'file',
        result: { status: 'not_started', reason: 'cancelled' },
      },
    ],
  });
  expect(await transferRemoteFileToOss(remote, cancelled)).toEqual({
    status: 'cancelled',
  });
  expect(get).not.toHaveBeenCalled();
});
