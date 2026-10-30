import { uploadOssFile } from '@unif/react-native-oss/upload/uploadOssFile.web';

jest.mock('react-native-blob-util', () => {
  throw new Error('Web loaded native SDK');
});

test('Web returns unsupported without obtaining credentials or loading native transport', async () => {
  const get = jest.fn();
  const release = jest.fn();
  expect(
    await uploadOssFile(
      { fileUri: 'file:///tmp/source.jpg', path: 'source.jpg' },
      {
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'ossprivate',
        },
        onSourceReleased: release,
      },
    ),
  ).toMatchObject({ status: 'failed', error: { reason: 'unsupported' } });
  expect(get).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
test('Web preserves pre-cancellation and releases unread source', async () => {
  const get = jest.fn();
  const release = jest.fn();
  const controller = new AbortController();
  controller.abort();
  expect(
    await uploadOssFile(
      { fileUri: 'file:///tmp/source.jpg', path: 'source.jpg' },
      {
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'ossprivate',
        },
        signal: controller.signal,
        onSourceReleased: release,
      },
    ),
  ).toEqual({ status: 'cancelled' });
  expect(get).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
