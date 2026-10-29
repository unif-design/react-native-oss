import { makeTransferOptions } from '../transferFixture';
import { randomUUID } from 'node:crypto';
const withTransferOptions = makeTransferOptions(randomUUID);
import * as oss from '@unif/react-native-oss';
import { uploadOssFile } from '@unif/react-native-oss/upload';
import { transferRemoteFileToOss } from '@unif/react-native-oss/transfers/transferRemoteFileToOss';
import { credential, deferred, now } from '../credentialFixture';
import type {
  OssBatchItem,
  OssBatchOptions,
  OssCredentialResult,
  OssUploadResult,
} from '@unif/react-native-oss';

jest.mock('@unif/react-native-oss/upload', () => ({
  uploadOssFile: jest.fn(),
}));
jest.mock('@unif/react-native-oss/transfers/transferRemoteFileToOss', () => ({
  transferRemoteFileToOss: jest.fn(),
}));
const upload = jest.mocked(uploadOssFile);
const transfer = jest.mocked(transferRemoteFileToOss);
const success = {
  status: 'success' as const,
  object: { bucketName: 'bucket', objectKey: 'same.jpg' },
};
const failed = {
  status: 'failed' as const,
  error: { reason: 'credential' as const, message: '凭证不可用' },
};
const sourceItems: OssBatchItem[] = [
  { kind: 'local', fileUri: 'file:///private/one.jpg', path: 'same.jpg' },
  {
    kind: 'remote',
    sourceUrl: 'https://example.test/two.jpg',
    path: 'same.jpg',
    maxBytes: 42,
  },
  { kind: 'local', fileUri: 'file:///private/three.jpg', path: 'three.jpg' },
];
const provided = () => ({
  authorization: { kind: 'provided' as const, credential: credential() },
});
async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  upload.mockReset().mockResolvedValue(success);
  transfer.mockReset().mockResolvedValue(success);
});
test('exports sequential batch through public OSS entry', () => {
  expect(typeof oss.uploadOssBatch).toBe('function');
});
test.each([false, true])(
  'empty batch returns no work even cancelled=%s',
  async (cancelled) => {
    const get = jest.fn();
    const controller = new AbortController();
    if (cancelled) controller.abort();
    expect(
      await oss.uploadOssBatch(
        [],
        withTransferOptions({
          authorization: {
            kind: 'managed',
            access: { get, dispose: jest.fn() },
            ossKey: 'osspublic',
          },
          signal: controller.signal,
        }),
      ),
    ).toEqual({ items: [] });
    expect(get).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  },
);
test('pre-cancelled batch returns all indexes without authorization or IO', async () => {
  const get = jest.fn();
  const controller = new AbortController();
  controller.abort();
  expect(
    await oss.uploadOssBatch(
      sourceItems,
      withTransferOptions({
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'osspublic',
        },
        signal: controller.signal,
      }),
    ),
  ).toEqual({
    items: sourceItems.map((item, index) => ({
      index,
      path: item.path,
      result: { status: 'not_started', reason: 'cancelled' },
    })),
  });
  expect(get).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(transfer).not.toHaveBeenCalled();
});
test.each(['failure', 'throw', 'expired'])(
  'common authorization %s marks preparation error without item calls',
  async (kind) => {
    const get = jest.fn(async () => {
      if (kind === 'throw') throw new Error('fixture-access-secret');
      return kind === 'failure'
        ? {
            status: 'failed' as const,
            error: { reason: 'unavailable' as const, message: 'secret' },
          }
        : {
            status: 'success' as const,
            credential: credential({ expiration: new Date(now).toISOString() }),
          };
    });
    const result = await oss.uploadOssBatch(
      sourceItems,
      withTransferOptions({
        authorization: {
          kind: 'managed',
          access: { get, dispose: jest.fn() },
          ossKey: 'ossprivate',
        },
      }),
    );
    expect(result).toMatchObject({
      preparationError: { reason: 'credential' },
      items: sourceItems.map((item, index) => ({
        index,
        path: item.path,
        result: { status: 'not_started', reason: 'preparation_failed' },
      })),
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('secret');
  },
);
test('one common authorization, sequential local/remote entries and partial failure preserve duplicate paths', async () => {
  const first = deferred<OssUploadResult>();
  upload.mockReturnValueOnce(first.promise).mockResolvedValueOnce(success);
  transfer.mockResolvedValue({ ...failed, stage: 'upload' });
  const get = jest.fn(async () => ({
    status: 'success' as const,
    credential: credential(),
  }));
  const result = oss.uploadOssBatch(
    sourceItems,
    withTransferOptions({
      authorization: {
        kind: 'managed',
        access: { get, dispose: jest.fn() },
        ossKey: 'ossprivate',
      },
    }),
  );
  await flush();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(transfer).not.toHaveBeenCalled();
  first.resolve(success);
  expect(await result).toEqual({
    items: [
      { index: 0, path: 'same.jpg', result: success },
      { index: 1, path: 'same.jpg', result: { ...failed, stage: 'upload' } },
      { index: 2, path: 'three.jpg', result: success },
    ],
  });
  expect(get).toHaveBeenCalledTimes(1);
  for (const [, options] of [...upload.mock.calls, ...transfer.mock.calls]) {
    expect(options.authorization).toEqual({
      kind: 'provided',
      credential: credential(),
    });
    expect(options).not.toHaveProperty('onSourceReleased');
  }
  expect(upload.mock.calls[0][0]).toEqual({
    fileUri: sourceItems[0].kind === 'local' ? sourceItems[0].fileUri : '',
    path: 'same.jpg',
  });
  expect(transfer.mock.calls[0][0]).toEqual({
    sourceUrl: 'https://example.test/two.jpg',
    path: 'same.jpg',
    maxBytes: 42,
  });
});
test('array, item inputs, callback and signal stay on initial snapshot, progress cannot escape completed item', async () => {
  const auth = deferred<OssCredentialResult>();
  const first = deferred<OssUploadResult>();
  const second = deferred<oss.OssTransferResult>();
  upload.mockReturnValueOnce(first.promise);
  transfer.mockReturnValueOnce(second.promise);
  const get = jest.fn(() => auth.promise);
  const controller = new AbortController();
  const nextController = new AbortController();
  const onProgress = jest.fn();
  const replacement = jest.fn();
  const items = sourceItems.map((item) => ({ ...item }));
  const options: OssBatchOptions = {
    authorization: {
      kind: 'managed',
      access: { get, dispose: jest.fn() },
      ossKey: 'ossprivate',
    },
    signal: controller.signal,
    onProgress,
  };
  const result = oss.uploadOssBatch(items, withTransferOptions(options));
  items[0].path = 'changed';
  if (items[1].kind === 'remote') items[1].sourceUrl = 'https://changed';
  items.reverse();
  items.push({ kind: 'local', path: 'extra', fileUri: 'file:///extra' });
  options.signal = nextController.signal;
  options.onProgress = replacement;
  nextController.abort();
  auth.resolve({ status: 'success', credential: credential() });
  await flush();
  const progress0 = upload.mock.calls[0][1].onProgress!;
  progress0({ sentBytes: 10, totalBytes: 10 });
  first.resolve(success);
  await flush();
  progress0({ sentBytes: 99 });
  transfer.mock.calls[0][1].onProgress?.({ sentBytes: 7 });
  second.resolve(success);
  const receipt = await result;
  expect(receipt.items.map((item) => [item.index, item.path])).toEqual([
    [0, 'same.jpg'],
    [1, 'same.jpg'],
    [2, 'three.jpg'],
  ]);
  expect(transfer.mock.calls[0][0]).toHaveProperty(
    'sourceUrl',
    'https://example.test/two.jpg',
  );
  expect(onProgress.mock.calls).toEqual([
    [{ index: 0, progress: { sentBytes: 10, totalBytes: 10 } }],
    [{ index: 1, progress: { sentBytes: 7 } }],
  ]);
  expect(replacement).not.toHaveBeenCalled();
  expect(upload.mock.calls[0][1].signal).toBe(controller.signal);
});
test('cancel during common authorization leaves every item unstarted', async () => {
  const controller = new AbortController();
  const pending = deferred<OssCredentialResult>();
  const result = oss.uploadOssBatch(
    sourceItems,
    withTransferOptions({
      authorization: {
        kind: 'managed',
        access: { get: () => pending.promise, dispose: jest.fn() },
        ossKey: 'ossprivate',
      },
      signal: controller.signal,
    }),
  );
  controller.abort();
  pending.resolve({ status: 'success', credential: credential() });
  expect(await result).toEqual({
    items: sourceItems.map((item, index) => ({
      index,
      path: item.path,
      result: { status: 'not_started', reason: 'cancelled' },
    })),
  });
  expect(upload).not.toHaveBeenCalled();
  expect(transfer).not.toHaveBeenCalled();
});
test.each(['success', 'cancelled'])(
  'cancel preserves earlier results and actual in-flight %s, leaving only future items unstarted',
  async (status) => {
    const current = deferred<oss.OssTransferResult>();
    const controller = new AbortController();
    transfer.mockReturnValueOnce(current.promise);
    const result = oss.uploadOssBatch(
      sourceItems,
      withTransferOptions({
        ...provided(),
        signal: controller.signal,
      }),
    );
    await flush();
    controller.abort();
    const actual =
      status === 'success' ? success : { status: 'cancelled' as const };
    current.resolve(actual);
    expect(await result).toEqual({
      items: [
        { index: 0, path: 'same.jpg', result: success },
        { index: 1, path: 'same.jpg', result: actual },
        {
          index: 2,
          path: 'three.jpg',
          result: { status: 'not_started', reason: 'cancelled' },
        },
      ],
    });
    expect(upload).toHaveBeenCalledTimes(1);
  },
);
test('later item credential failure does not reauthorize, retry, or discard previous success', async () => {
  const get = jest.fn(async () => ({
    status: 'success' as const,
    credential: credential(),
  }));
  upload.mockResolvedValueOnce(success).mockResolvedValueOnce(failed);
  const result = await oss.uploadOssBatch(
    sourceItems,
    withTransferOptions({
      authorization: {
        kind: 'managed',
        access: { get, dispose: jest.fn() },
        ossKey: 'osspublic',
      },
    }),
  );
  expect(result.items.map((item) => item.result.status)).toEqual([
    'success',
    'success',
    'failed',
  ]);
  expect(get).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
});
test('progress observer failures do not interrupt individual uploads', async () => {
  upload.mockImplementation(async (_input, options) => {
    options.onProgress?.({ sentBytes: 5 });
    return success;
  });
  expect(
    (
      await oss.uploadOssBatch(
        sourceItems,
        withTransferOptions({
          ...provided(),
          onProgress: () => {
            throw new Error('UI failure');
          },
        }),
      )
    ).items.map((item) => item.result.status),
  ).toEqual(['success', 'success', 'success']);
});
