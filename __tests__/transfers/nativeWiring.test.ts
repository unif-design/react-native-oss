import { makeTransferOptions } from '../transferFixture';
import { randomUUID } from 'node:crypto';
const withTransferOptions = makeTransferOptions(randomUUID);
import { Platform } from 'react-native';
import {
  downloadFile,
  stat,
  readFile,
  unlink,
  stopDownload,
} from '@dr.pogodin/react-native-fs';
import BlobUtil from 'react-native-blob-util';
import {
  transferRemoteFileToOss,
  uploadOssBatch,
} from '@unif/react-native-oss';
import { credential, deferred, now } from '../credentialFixture';
import type {
  OssUploadedObject,
  OssTransferOptions,
  OssBatchOptions,
  OssBatchItem,
} from '@unif/react-native-oss';
import type { DownloadFileOptionsT } from '@dr.pogodin/react-native-fs';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  downloadFile: jest.fn(),
  stopDownload: jest.fn(),
  stat: jest.fn(),
  mkdir: jest.fn(async () => undefined),
  unlink: jest.fn(),
  readFile: jest.fn(),
  copyFile: jest.fn(),
  writeFile: jest.fn(),
  readDir: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    wrap: jest.fn((path: string) => `wrapped:${path}`),
    fs: {
      dirs: {
        LibraryDir: '/app/Library %23#?',
        DocumentDir: '/app/Documents',
        CacheDir: '/cache',
      },
    },
  },
}));
const files = new Map<string, number>();
const fetch = jest.fn();
const input = {
  sourceUrl: 'https://source.example.test/file?signature=preserved%23',
  path: 'destination/data.bin',
  maxBytes: 42,
};
const provided = () => ({
  authorization: { kind: 'provided' as const, credential: credential() },
});
async function flush() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}
function nativeUpload() {
  const pending = deferred<{ info(): { status: number } }>();
  let complete: (() => void) | undefined;
  let progress: ((sent: number, total: number) => void) | undefined;
  const request = Object.assign(pending.promise, {
    uploadProgress: jest.fn((_config, callback): typeof pending.promise => {
      progress = callback;
      return request;
    }),
    onRequestComplete: jest.fn((callback): typeof pending.promise => {
      complete = callback;
      return request;
    }),
    cancel: jest.fn((): typeof pending.promise => {
      pending.reject(new Error('native cancel'));
      return request;
    }),
  });
  fetch.mockReturnValueOnce(request);
  return {
    respond: (status: number) => pending.resolve({ info: () => ({ status }) }),
    complete: () => complete?.(),
    progress: (sent: number, total: number) => progress?.(sent, total),
    request,
  };
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.replaceProperty(Platform, 'OS', 'ios');
  files.clear();
  fetch.mockReset();
  (BlobUtil.config as jest.Mock).mockReturnValue({ fetch });
  (stat as jest.Mock).mockImplementation(async (path: string) => {
    if (!files.has(path))
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return {
      size: files.get(path),
      isFile: () => true,
      isDirectory: () => false,
    };
  });
  (unlink as jest.Mock).mockImplementation(async (path: string) => {
    files.delete(path);
  });
  (downloadFile as jest.Mock).mockImplementation(
    (options: DownloadFileOptionsT) => {
      files.set(options.toFile, 17);
      return {
        jobId: 1,
        promise: Promise.resolve({
          jobId: 1,
          statusCode: 200,
          bytesWritten: 17,
        }),
      };
    },
  );
});

test('real public download and upload preserve signed URL, confirm file once, stream exact decoded target, release only on native completion', async () => {
  const native = nativeUpload();
  const onProgress = jest.fn();
  const result = transferRemoteFileToOss(
    input,
    withTransferOptions({ ...provided(), onProgress }),
  );
  await flush();
  expect(downloadFile).toHaveBeenCalledTimes(1);
  const download = (downloadFile as jest.Mock).mock.calls[0][0];
  expect(download.fromUrl).toBe(input.sourceUrl);
  expect(download.toFile).toMatch(
    /^\/app\/Library %23#\?\/PortalOssTransfers\/[0-9a-f-]+$/,
  );
  expect(download).not.toHaveProperty('connectionTimeout');
  expect(download).not.toHaveProperty('readTimeout');
  expect(stat).toHaveBeenCalledTimes(2);
  expect(readFile).not.toHaveBeenCalled();
  expect(BlobUtil.wrap).toHaveBeenCalledWith(download.toFile);
  expect(fetch).toHaveBeenCalledWith(
    'POST',
    'https://fixture-bucket.oss-cn-example.aliyuncs.com',
    expect.any(Object),
    expect.arrayContaining([
      { name: 'key', data: 'logs/destination/data.bin' },
      {
        name: 'file',
        filename: 'file',
        type: 'application/octet-stream',
        data: `wrapped:${download.toFile}`,
      },
    ]),
  );
  native.progress(17, 17);
  expect(onProgress).toHaveBeenCalledWith({ sentBytes: 17, totalBytes: 17 });
  native.respond(204);
  expect(await result).toMatchObject({
    status: 'success',
    object: { objectKey: 'logs/destination/data.bin' },
  });
  expect(files.has(download.toFile)).toBe(true);
  expect(unlink).not.toHaveBeenCalled();
  native.complete();
  await flush();
  expect(files.has(download.toFile)).toBe(false);
  expect(unlink).toHaveBeenCalledTimes(1);
});
test('real download accepts 206 but transfer refuses upload and deletes its delivered file', async () => {
  (downloadFile as jest.Mock).mockImplementation(
    (options: DownloadFileOptionsT) => {
      files.set(options.toFile, 17);
      return {
        jobId: 2,
        promise: Promise.resolve({
          jobId: 2,
          statusCode: 206,
          bytesWritten: 17,
        }),
      };
    },
  );
  expect(
    await transferRemoteFileToOss(input, withTransferOptions(provided())),
  ).toMatchObject({
    status: 'failed',
    stage: 'download',
    error: { httpStatus: 206 },
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(files.size).toBe(0);
  expect(unlink).toHaveBeenCalledTimes(1);
});
test('native HTTP 200 without landed file cannot reach real uploader', async () => {
  (downloadFile as jest.Mock).mockReturnValue({
    jobId: 3,
    promise: Promise.resolve({ jobId: 3, statusCode: 200, bytesWritten: 17 }),
  });
  expect(
    await transferRemoteFileToOss(input, withTransferOptions(provided())),
  ).toMatchObject({
    status: 'failed',
    stage: 'download',
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
});
test('real upload cancel settles before native completion and leaves temporary file until that completion', async () => {
  const native = nativeUpload();
  const controller = new AbortController();
  const result = transferRemoteFileToOss(
    input,
    withTransferOptions({
      ...provided(),
      signal: controller.signal,
    }),
  );
  await flush();
  controller.abort();
  expect(await result).toEqual({ status: 'cancelled' });
  expect(native.request.cancel).toHaveBeenCalledTimes(1);
  expect(files.size).toBe(1);
  expect(unlink).not.toHaveBeenCalled();
  native.complete();
  await flush();
  expect(files.size).toBe(0);
  expect(unlink).toHaveBeenCalledTimes(1);
});
test('real download cancel waits for its terminal cleanup and never calls upload', async () => {
  const pending = deferred<{
    jobId: number;
    statusCode: number;
    bytesWritten: number;
  }>();
  (downloadFile as jest.Mock).mockImplementation(
    (options: DownloadFileOptionsT) => {
      files.set(options.toFile, 5);
      return { jobId: 4, promise: pending.promise };
    },
  );
  const controller = new AbortController();
  let settled = false;
  const result = transferRemoteFileToOss(
    input,
    withTransferOptions({
      ...provided(),
      signal: controller.signal,
    }),
  ).then((value) => {
    settled = true;
    return value;
  });
  await flush();
  controller.abort();
  await flush();
  expect(stopDownload).toHaveBeenCalledWith(4);
  expect(settled).toBe(false);
  expect(files.size).toBe(1);
  pending.reject(new Error('native stopped'));
  expect(await result).toEqual({ status: 'cancelled' });
  expect(fetch).not.toHaveBeenCalled();
  expect(files.size).toBe(0);
  expect(unlink).toHaveBeenCalledTimes(1);
});
test('real sequential upload rechecks shared credential expiry without getting authorization again or deleting local sources', async () => {
  const native = nativeUpload();
  const get = jest.fn(async () => ({
    status: 'success' as const,
    credential: credential(),
  }));
  const result = uploadOssBatch(
    [
      { kind: 'local', fileUri: 'file:///private/one', path: 'one' },
      { kind: 'local', fileUri: 'file:///private/two', path: 'two' },
    ],
    withTransferOptions({
      authorization: {
        kind: 'managed',
        access: { get, dispose: jest.fn() },
        ossKey: 'ossprivate',
      },
    }),
  );
  await flush();
  jest.spyOn(Date, 'now').mockReturnValue(now + 280_000);
  native.respond(200);
  const receipt = await result;
  expect(receipt.items[0].result).toMatchObject({ status: 'success' });
  expect(receipt.items[1].result).toMatchObject({
    status: 'failed',
    error: { reason: 'credential' },
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(downloadFile).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
  native.complete();
});

test('真实 RN URL 下远程转存与公共下载一致接受大写 HTTPS，原签名逐字交 RNFS', async () => {
  const previous = global.URL;
  global.URL = jest.requireActual('react-native/Libraries/Blob/URL').URL;
  try {
    const native = nativeUpload();
    const sourceUrl =
      'HTTPS://source.example.test/A%2fb?signature=A%2Fb+Z#Part';
    const result = transferRemoteFileToOss(
      { ...input, sourceUrl },
      withTransferOptions(provided()),
    );
    await flush();
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(jest.mocked(downloadFile).mock.calls[0][0].fromUrl).toBe(sourceUrl);
    native.respond(204);
    await expect(result).resolves.toMatchObject({ status: 'success' });
    native.complete();
    await flush();
  } finally {
    global.URL = previous;
  }
});

function transferWithHost(
  value: Parameters<typeof transferRemoteFileToOss>[0],
  options: Omit<OssTransferOptions, 'getTransferDirectory' | 'createId'>,
) {
  return transferRemoteFileToOss(value, withTransferOptions(options));
}
function batchWithHost(
  items: readonly OssBatchItem[],
  options: Omit<OssBatchOptions, 'getTransferDirectory' | 'createId'>,
) {
  return uploadOssBatch(items, withTransferOptions(options));
}

test.each([
  [undefined, 'https://cdn.example.test/media/destination/data.bin'],
  ['configured', 'https://cdn.example.test/media/destination/data.bin'],
  [
    'origin',
    'https://fixture-bucket.oss-cn-example.aliyuncs.com/logs/destination/data.bin',
  ],
] as const)(
  '远程转存采用 urlMode=%p，并在原生发送前交付同一对象',
  async (urlMode, url) => {
    const native = nativeUpload();
    const started: {
      object: Readonly<OssUploadedObject>;
      frozen: boolean;
      sent: number;
    }[] = [];
    const result = transferWithHost(
      { ...input, urlMode },
      {
        authorization: {
          kind: 'provided',
          credential: credential({
            baseUrl: 'https://cdn.example.test/media/',
          }),
        },
        onRequestStarted: (object) => {
          started.push({
            object,
            frozen: Object.isFrozen(object),
            sent: fetch.mock.calls.length,
          });
        },
      },
    );
    native.respond(200);
    const receipt = await result;
    native.complete();
    await flush();
    expect(receipt).toStrictEqual({
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'logs/destination/data.bin',
        url,
      },
    });
    expect(started).toStrictEqual([
      {
        object: {
          bucketName: 'fixture-bucket',
          objectKey: 'logs/destination/data.bin',
          url,
        },
        frozen: true,
        sent: 0,
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(files.size).toBe(0);
  },
);
test('远程转存发送前记录失败时不上传，并释放已下载的临时文件', async () => {
  const native = nativeUpload();
  const result = transferWithHost(input, {
    ...provided(),
    onRequestStarted: () => {
      throw new Error('对象记录未保存');
    },
  });
  native.respond(200);
  const receipt = await result;
  await flush();
  expect(receipt).toMatchObject({ status: 'failed', stage: 'upload' });
  expect(fetch).not.toHaveBeenCalled();
  expect(downloadFile).toHaveBeenCalledTimes(1);
  expect(files.size).toBe(0);
  expect(unlink).toHaveBeenCalledTimes(1);
});
test('批量本地和远程项目各自采用地址模式，发送前记录归原对象且不提前释放源文件', async () => {
  const requests = [nativeUpload(), nativeUpload(), nativeUpload()];
  const started: Readonly<OssUploadedObject>[] = [];
  const result = batchWithHost(
    [
      {
        kind: 'local',
        fileUri: 'file:///private/local',
        path: 'local',
        urlMode: 'origin',
      },
      {
        kind: 'remote',
        sourceUrl: input.sourceUrl,
        path: 'remote',
        urlMode: 'origin',
      },
      {
        kind: 'local',
        fileUri: 'file:///private/configured',
        path: 'configured',
        urlMode: 'configured',
      },
    ],
    {
      authorization: {
        kind: 'provided',
        credential: credential({ baseUrl: 'https://cdn.example.test/media/' }),
      },
      onRequestStarted: (object) => {
        started.push(object);
      },
    },
  );
  for (const request of requests) request.respond(200);
  const receipt = await result;
  expect(receipt.items.map((item) => item.result)).toStrictEqual([
    {
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'logs/local',
        url: 'https://fixture-bucket.oss-cn-example.aliyuncs.com/logs/local',
      },
    },
    {
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'logs/remote',
        url: 'https://fixture-bucket.oss-cn-example.aliyuncs.com/logs/remote',
      },
    },
    {
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'logs/configured',
        url: 'https://cdn.example.test/media/configured',
      },
    },
  ]);
  expect(started.map((object) => object.objectKey)).toStrictEqual([
    'logs/local',
    'logs/remote',
    'logs/configured',
  ]);
  expect(files.size).toBe(1);
  expect(unlink).not.toHaveBeenCalled();
  for (const request of requests) request.complete();
  await flush();
  expect(unlink).toHaveBeenCalledTimes(1);
  expect(files.size).toBe(0);
});
test('批量远程项记录失败时沿转存失败结果收尾，仍处理后续项目', async () => {
  const native = nativeUpload();
  const result = batchWithHost(
    [
      { kind: 'remote', sourceUrl: input.sourceUrl, path: 'blocked' },
      { kind: 'local', fileUri: 'file:///private/next', path: 'next' },
    ],
    {
      ...provided(),
      onRequestStarted: (object) => {
        if (object.objectKey === 'logs/blocked')
          throw new Error('对象记录未保存');
      },
    },
  );
  native.respond(200);
  const receipt = await result;
  native.complete();
  await flush();
  expect(receipt.items[0].result).toMatchObject({ status: 'failed' });
  expect(receipt.items[1].result).toMatchObject({
    status: 'success',
    object: { objectKey: 'logs/next' },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][3]).toContainEqual({
    name: 'key',
    data: 'logs/next',
  });
  expect(files.size).toBe(0);
});
test('批量本地项的发送前记录异常沿单文件接口上抛，不继续发送', async () => {
  await expect(
    batchWithHost(
      [
        { kind: 'local', fileUri: 'file:///private/blocked', path: 'blocked' },
        { kind: 'local', fileUri: 'file:///private/next', path: 'next' },
      ],
      {
        ...provided(),
        onRequestStarted: () => {
          throw new Error('对象记录未保存');
        },
      },
    ),
  ).rejects.toThrow('对象记录未保存');
  expect(fetch).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
});
