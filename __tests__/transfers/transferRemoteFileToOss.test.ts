import { makeTransferOptions } from '../transferFixture';
const withTransferOptions = makeTransferOptions(() => `unique-${++mockId}`);
import { Platform } from 'react-native';
import BlobUtil from 'react-native-blob-util';
import * as oss from '@unif/react-native-oss';
import { downloadLocalFile, deleteLocalFile } from '@unif/react-native-files';
import { uploadOssFile } from '@unif/react-native-oss/upload';
import { credential, deferred, now } from '../credentialFixture';
import type { DownloadLocalFileResult } from '@unif/react-native-files';
import type {
  OssCredentialResult,
  OssUploadResult,
} from '@unif/react-native-oss';

jest.mock('@unif/react-native-files', () => ({
  downloadLocalFile: jest.fn(),
  deleteLocalFile: jest.fn(),
}));
jest.mock('@unif/react-native-oss/upload', () => ({
  uploadOssFile: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: {
        LibraryDir: '/private/Library %23#?',
        DocumentDir: '/private/Documents',
        CacheDir: '/cache',
      },
    },
  },
}));
jest.mock('@unif/react-native-logger', () => ({
  ...jest.requireActual('@unif/react-native-logger'),
  createLogger: () => ({ warn: mockWarn }),
}));
let mockId = 0;
const mockWarn = jest.fn();
const download = jest.mocked(downloadLocalFile);
const remove = jest.mocked(deleteLocalFile);
const upload = jest.mocked(uploadOssFile);
const input = {
  sourceUrl: 'https://example.test/source?signature=%23%2F',
  path: '/objects/a %?#.jpg/',
  maxBytes: 42,
};
const success = {
  status: 'success' as const,
  object: { bucketName: 'fixture-bucket', objectKey: 'logs/objects/a %?#.jpg' },
};
const provided = () => ({
  authorization: { kind: 'provided' as const, credential: credential() },
});
async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.replaceProperty(Platform, 'OS', 'ios');
  download.mockReset().mockImplementation(async (value) => ({
    status: 'success',
    uri: value.targetUri,
    statusCode: 200,
    sizeBytes: 17,
  }));
  remove.mockReset().mockResolvedValue({ status: 'success', deleted: true });
  upload.mockReset().mockResolvedValue(success);
});

test('exports remote transfer through public OSS entry', () => {
  expect(typeof oss.transferRemoteFileToOss).toBe('function');
});
test.each([
  { sourceUrl: 'file:///source' },
  { sourceUrl: 'https://' },
  { sourceUrl: ' https://example.test/a' },
  { path: '' },
  { path: 'a/../b' },
  { maxBytes: -1 },
  { mimeType: '\r\n' },
])(
  'invalid source or target stops before credential and download: %j',
  async (override) => {
    const get = jest.fn();
    const result = await oss.transferRemoteFileToOss(
      { ...input, ...override },
      withTransferOptions({
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'ossprivate',
        },
      }),
    );
    expect(result).toMatchObject({
      status: 'failed',
      stage: 'upload',
      error: { reason: 'invalid_input' },
    });
    expect(get).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  },
);
test.each([
  { expiration: new Date(now).toISOString() },
  { rootPath: '../invalid' },
  { endpoint: 'bad/path' },
])('unusable upload preparation never downloads: %j', async (override) => {
  expect(
    await oss.transferRemoteFileToOss(
      input,
      withTransferOptions({
        authorization: { kind: 'provided', credential: credential(override) },
      }),
    ),
  ).toMatchObject({
    status: 'failed',
    stage: 'upload',
    error: { reason: 'credential' },
  });
  expect(download).not.toHaveBeenCalled();
});
test('one managed authorization precedes download and supplied credential reaches upload with immutable inputs', async () => {
  const pending = deferred<OssCredentialResult>();
  const get = jest.fn(() => pending.promise);
  const original = { ...input };
  const progress = jest.fn();
  const otherProgress = jest.fn();
  const controller = new AbortController();
  const options = {
    authorization: {
      kind: 'managed' as const,
      access: { get, dispose: jest.fn() },
      ossKey: 'ossprivate' as const,
    },
    onProgress: progress,
    signal: controller.signal,
  };
  const result = oss.transferRemoteFileToOss(
    original,
    withTransferOptions(options),
  );
  original.sourceUrl = 'https://changed';
  original.path = 'changed';
  options.onProgress = otherProgress;
  options.signal = new AbortController().signal;
  expect(download).not.toHaveBeenCalled();
  pending.resolve({ status: 'success', credential: credential() });
  await flush();
  expect(await result).toEqual(success);
  expect(get).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledWith(
    {
      sourceUrl: input.sourceUrl,
      targetUri: expect.stringMatching(
        /^file:\/\/\/private\/Library%20%2523%23%3F\/PortalOssTransfers\/unique-\d+$/,
      ),
    },
    { signal: controller.signal },
  );
  expect(upload).toHaveBeenCalledWith(
    {
      fileUri: download.mock.calls[0][0].targetUri,
      path: input.path,
      maxBytes: 42,
    },
    {
      authorization: { kind: 'provided', credential: credential() },
      signal: controller.signal,
      onProgress: progress,
      onSourceReleased: expect.any(Function),
    },
  );
  expect(remove).not.toHaveBeenCalled();
});
test('concurrent transfers use distinct private targets and Android uses DocumentDir', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await Promise.all([
    oss.transferRemoteFileToOss(input, withTransferOptions(provided())),
    oss.transferRemoteFileToOss(input, withTransferOptions(provided())),
  ]);
  const targets = download.mock.calls.map(([value]) => value.targetUri);
  expect(new Set(targets).size).toBe(2);
  expect(targets[0]).toMatch(
    /^file:\/\/\/private\/Documents\/PortalOssTransfers\//,
  );
});
test('missing native root is unsupported before authorization', async () => {
  jest.replaceProperty(BlobUtil.fs.dirs, 'LibraryDir', '');
  const get = jest.fn();
  expect(
    await oss.transferRemoteFileToOss(
      input,
      withTransferOptions({
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'osspublic',
        },
      }),
    ),
  ).toMatchObject({ stage: 'upload', error: { reason: 'unsupported' } });
  expect(get).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});
test.each([201, 204, 206, 0])(
  'delivered HTTP %s is rejected and its delivered URI released without upload',
  async (statusCode) => {
    download.mockResolvedValue({
      status: 'success',
      uri: 'file:///private/delivered',
      statusCode,
      sizeBytes: 17,
    });
    const result = await oss.transferRemoteFileToOss(
      input,
      withTransferOptions(provided()),
    );
    expect(result).toMatchObject({ status: 'failed', stage: 'download' });
    if (statusCode)
      expect(result).toMatchObject({ error: { httpStatus: statusCode } });
    expect(upload).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('file:///private/delivered');
  },
);
test.each(['http', 'io', 'throw', 'cancelled'])(
  'download %s does not delete an undelivered target or upload',
  async (kind) => {
    if (kind === 'throw')
      download.mockRejectedValue(new Error(input.sourceUrl));
    else if (kind === 'cancelled')
      download.mockResolvedValue({ status: 'cancelled' });
    else
      download.mockResolvedValue({
        status: 'failed',
        error:
          kind === 'http'
            ? { reason: 'http', statusCode: 403, message: input.sourceUrl }
            : { reason: 'io', message: input.sourceUrl },
      });
    const result = await oss.transferRemoteFileToOss(
      input,
      withTransferOptions(provided()),
    );
    expect(result).toMatchObject(
      kind === 'cancelled'
        ? { status: 'cancelled' }
        : { status: 'failed', stage: 'download' },
    );
    if (kind === 'http')
      expect(result).toMatchObject({ error: { httpStatus: 403 } });
    expect(JSON.stringify(result)).not.toContain(input.sourceUrl);
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);
test.each(['before', 'credential', 'download'])(
  'abort during %s prevents upload and preserves cleanup ownership',
  async (stage) => {
    const controller = new AbortController();
    const auth = deferred<OssCredentialResult>();
    const file = deferred<DownloadLocalFileResult>();
    const get = jest.fn(() =>
      stage === 'credential'
        ? auth.promise
        : Promise.resolve({
            status: 'success' as const,
            credential: credential(),
          }),
    );
    download.mockReturnValue(file.promise);
    if (stage === 'before') controller.abort();
    const result = oss.transferRemoteFileToOss(
      input,
      withTransferOptions({
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'ossprivate',
        },
        signal: controller.signal,
      }),
    );
    await flush();
    controller.abort();
    auth.resolve({ status: 'success', credential: credential() });
    file.resolve({ status: 'cancelled' });
    expect(await result).toEqual({ status: 'cancelled' });
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    if (stage === 'before') expect(get).not.toHaveBeenCalled();
  },
);
test('abort after download delivered but before upload releases original file directly', async () => {
  const controller = new AbortController();
  download.mockImplementation(async (value) => {
    controller.abort();
    return {
      status: 'success',
      uri: value.targetUri,
      statusCode: 200,
      sizeBytes: 17,
    };
  });
  expect(
    await oss.transferRemoteFileToOss(
      input,
      withTransferOptions({
        ...provided(),
        signal: controller.signal,
      }),
    ),
  ).toEqual({ status: 'cancelled' });
  expect(upload).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
});
test.each(['cancelled', 'failed', 'throw', 'success'])(
  'upload %s keeps file until source release, with late callback at most once',
  async (kind) => {
    const pending = deferred<OssUploadResult>();
    const controller = new AbortController();
    upload.mockReturnValue(pending.promise);
    const result = oss.transferRemoteFileToOss(
      input,
      withTransferOptions({
        ...provided(),
        signal: controller.signal,
      }),
    );
    await flush();
    const release = upload.mock.calls[0][1].onSourceReleased!;
    if (kind === 'throw') pending.reject(new Error('secret'));
    else
      pending.resolve(
        kind === 'success'
          ? success
          : kind === 'cancelled'
            ? { status: 'cancelled' }
            : {
                status: 'failed',
                error: { reason: 'unconfirmed', message: '未确认' },
              },
      );
    controller.abort();
    const receipt = await result;
    expect(receipt).toMatchObject(
      kind === 'success'
        ? success
        : kind === 'cancelled'
          ? { status: 'cancelled' }
          : { status: 'failed', stage: 'upload' },
    );
    expect(remove).not.toHaveBeenCalled();
    await release();
    await release();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(download.mock.calls[0][0].targetUri);
  },
);
test.each(['result', 'throw'])(
  'cleanup failure %s is safe structured diagnostic and cannot rewrite success',
  async (mode) => {
    if (mode === 'throw')
      remove.mockRejectedValue(
        new Error(`${input.sourceUrl} fixture-access-secret`),
      );
    else
      remove.mockResolvedValue({
        status: 'failed',
        error: { reason: 'io', message: input.sourceUrl },
      });
    upload.mockImplementation(async (_value, options) => {
      await options.onSourceReleased?.();
      return success;
    });
    expect(
      await oss.transferRemoteFileToOss(input, withTransferOptions(provided())),
    ).toEqual(success);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        phase: 'cleanup',
        outcome: 'failed',
        code: expect.any(String),
      }),
    );
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
      /signature|fixture-access-secret|file:\/\/\//,
    );
  },
);

test('显式宿主目录与文件名逐字交给公共下载，不回落到默认目录', async () => {
  const createId = jest.fn(() => 'host-unique-id');
  await oss.transferRemoteFileToOss(input, {
    ...provided(),
    transferDirectory: 'file:///private/host-transfers',
    createId,
  });
  expect(createId).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0][0].targetUri).toBe(
    'file:///private/host-transfers/host-unique-id',
  );
});
