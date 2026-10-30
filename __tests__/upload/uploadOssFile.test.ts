import Utf8 from 'crypto-js/enc-utf8';
import BlobUtil from 'react-native-blob-util';
import * as oss from '@unif/react-native-oss';
import { credential, deferred, now } from '../credentialFixture';
import type { OssCredentialResult } from '@unif/react-native-oss';

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    wrap: jest.fn((path: string) => `wrapped:${path}`),
    fs: { stat: jest.fn(), unlink: jest.fn() },
  },
}));
jest.mock('@unif/react-native-logger', () => ({
  ...jest.requireActual('@unif/react-native-logger'),
  createLogger: () => ({ warn: mockWarn }),
}));
const mockWarn = jest.fn();
const fetch = jest.fn();
const input = { fileUri: 'file:///private/photo%20one.jpg', path: 'photo.jpg' };
const provided = () => ({
  kind: 'provided' as const,
  credential: credential(),
});
function task() {
  const pending = deferred<{ info(): { status: number } }>();
  let complete: (() => void) | undefined;
  let progress: ((sent: number, total: number) => void) | undefined;
  const request = Object.assign(pending.promise, {
    cancel: jest.fn((): typeof pending.promise => {
      pending.reject(new Error('cancel contains /private/secret'));
      return request;
    }),
    uploadProgress: jest.fn(
      (
        optionsOrCallback: { interval: number } | typeof progress,
        callback?: typeof progress,
      ): typeof pending.promise => {
        progress =
          typeof optionsOrCallback === 'function'
            ? optionsOrCallback
            : callback;
        return request;
      },
    ),
    onRequestComplete: jest.fn(
      (callback: () => void): typeof pending.promise => {
        complete = callback;
        return request;
      },
    ),
  });
  fetch.mockReturnValue(request);
  return {
    ...pending,
    request,
    complete: () => complete?.(),
    progress: (sent: number, total: number) => progress?.(sent, total),
    respond: (status: number) => pending.resolve({ info: () => ({ status }) }),
  };
}
async function started() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  (BlobUtil.config as jest.Mock).mockReturnValue({ fetch });
  fetch.mockReset();
});

test('POST V1 uses independently fixed signature, declared maximum and file last', async () => {
  const native = task();
  const result = oss.uploadOssFile(
    { ...input, maxBytes: 42 },
    { authorization: provided() },
  );
  await started();
  expect(BlobUtil.config).toHaveBeenCalledWith({ followRedirect: false });
  const [method, url, headers, form] = fetch.mock.calls[0];
  expect([method, url, headers]).toEqual([
    'POST',
    'https://fixture-bucket.oss-cn-example.aliyuncs.com',
    { 'Content-Type': 'multipart/form-data' },
  ]);
  expect(form).toEqual([
    { name: 'key', data: 'logs/photo.jpg' },
    { name: 'success_action_status', data: '200' },
    { name: 'x-oss-content-type', data: 'image/jpeg' },
    { name: 'x-oss-security-token', data: 'fixture-security-token' },
    { name: 'OSSAccessKeyId', data: 'fixture-access-id' },
    {
      name: 'Policy',
      data: 'eyJleHBpcmF0aW9uIjoiMjAyNi0wOS0xNlQwMjowNTowMC4wMDBaIiwiY29uZGl0aW9ucyI6W3sia2V5IjoibG9ncy9waG90by5qcGcifSx7InN1Y2Nlc3NfYWN0aW9uX3N0YXR1cyI6IjIwMCJ9LFsiY29udGVudC1sZW5ndGgtcmFuZ2UiLDAsNDJdXX0=',
    },
    { name: 'Signature', data: 'DJ+LvEvaPIjgAUcwp8rktDe2XJA=' },
    {
      name: 'file',
      filename: 'file',
      type: 'image/jpeg',
      data: 'wrapped:/private/photo one.jpg',
    },
  ]);
  native.respond(200);
  expect(await result).toEqual({
    status: 'success',
    object: {
      bucketName: 'fixture-bucket',
      objectKey: 'logs/photo.jpg',
      url: 'https://fixture-bucket.oss-cn-example.aliyuncs.com/logs/photo.jpg',
    },
  });
  expect(BlobUtil.fs.stat).not.toHaveBeenCalled();
  expect(BlobUtil.fs.unlink).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([200, 204])(
  'accepts empty %s and keeps success after late abort',
  async (status) => {
    const native = task();
    const controller = new AbortController();
    const result = oss.uploadOssFile(input, {
      authorization: provided(),
      signal: controller.signal,
    });
    await started();
    native.respond(status);
    controller.abort();
    expect((await result).status).toBe('success');
  },
);
test.each([
  [403, 'rejected'],
  [500, 'rejected'],
  [201, 'unconfirmed'],
  [302, 'unconfirmed'],
  [0, 'unconfirmed'],
])('maps status %s to %s without retries', async (status, reason) => {
  const native = task();
  const result = oss.uploadOssFile(input, { authorization: provided() });
  await started();
  native.respond(status as number);
  expect(await result).toMatchObject({ status: 'failed', error: { reason } });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('transport exception stays unconfirmed and does not expose cause', async () => {
  const native = task();
  const result = oss.uploadOssFile(input, { authorization: provided() });
  await started();
  native.reject(new Error('fixture-access-secret /private/photo.jpg'));
  const response = await result;
  expect(response).toMatchObject({
    status: 'failed',
    error: { reason: 'unconfirmed' },
  });
  expect(JSON.stringify([response, mockWarn.mock.calls])).not.toMatch(
    /fixture-access-secret|\/private\/photo/,
  );
});

test.each([
  { fileUri: 'https://example.test/photo' },
  { fileUri: 'content://photo' },
  { fileUri: 'file:///bad%ZZ' },
  { fileUri: 'file://other-host/path' },
  { path: '' },
  { path: '/' },
  { path: 'a/../b' },
  { path: './a' },
  { maxBytes: -1 },
  { maxBytes: 0.5 },
  { maxBytes: NaN },
])(
  'invalid input %j prevents authorization and releases once',
  async (override) => {
    const get = jest.fn();
    const release = jest.fn();
    expect(
      await oss.uploadOssFile(
        { ...input, ...override },
        {
          authorization: {
            kind: 'managed',
            access: { get, dispose: jest.fn() },
            ossKey: 'ossprivate',
          },
          onSourceReleased: release,
        },
      ),
    ).toMatchObject({ status: 'failed', error: { reason: 'invalid_input' } });
    expect(get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  },
);
test('managed authorization is explicit, snapshotted and revalidated after preparation', async () => {
  const native = task();
  const pending = deferred<OssCredentialResult>();
  const get = jest.fn(() => pending.promise);
  const requestInput = { ...input };
  const authorization = {
    kind: 'managed' as const,
    access: { get, dispose: jest.fn() },
    ossKey: 'ossprivate' as const,
  };
  const result = oss.uploadOssFile(requestInput, { authorization });
  requestInput.path = 'changed';
  expect(get).toHaveBeenCalledWith('ossprivate', { signal: undefined });
  pending.resolve({ status: 'success', credential: credential() });
  await started();
  native.respond(204);
  expect(await result).toMatchObject({
    object: { objectKey: 'logs/photo.jpg' },
  });
});
test('expired explicit credential prevents POST and releases source', async () => {
  const release = jest.fn();
  expect(
    await oss.uploadOssFile(input, {
      authorization: {
        kind: 'provided',
        credential: credential({ expiration: new Date(now).toISOString() }),
      },
      onSourceReleased: release,
    }),
  ).toMatchObject({ error: { reason: 'credential' } });
  expect(fetch).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
test('already cancelled never requests credentials', async () => {
  const controller = new AbortController();
  controller.abort();
  const get = jest.fn();
  const release = jest.fn();
  expect(
    await oss.uploadOssFile(input, {
      authorization: {
        kind: 'managed',
        access: { get, dispose: jest.fn() },
        ossKey: 'ossprivate',
      },
      signal: controller.signal,
      onSourceReleased: release,
    }),
  ).toEqual({ status: 'cancelled' });
  expect(get).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
test('abort during preparation cannot start a late upload', async () => {
  const controller = new AbortController();
  const pending = deferred<OssCredentialResult>();
  const release = jest.fn();
  const result = oss.uploadOssFile(input, {
    authorization: {
      kind: 'managed',
      access: { get: () => pending.promise, dispose: jest.fn() },
      ossKey: 'ossprivate',
    },
    signal: controller.signal,
    onSourceReleased: release,
  });
  controller.abort();
  pending.resolve({ status: 'success', credential: credential() });
  expect(await result).toEqual({ status: 'cancelled' });
  expect(fetch).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
test('cancel settlement does not release until independent native completion, at most once', async () => {
  const native = task();
  const controller = new AbortController();
  const release = jest.fn();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
    onSourceReleased: release,
  });
  await started();
  controller.abort();
  expect(await result).toEqual({ status: 'cancelled' });
  expect(native.request.cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  native.complete();
  native.complete();
  expect(release).toHaveBeenCalledTimes(1);
});
test('missing native completion support conservatively retains source even on success', async () => {
  const native = task();
  delete (native.request as Partial<typeof native.request>).onRequestComplete;
  const release = jest.fn();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    onSourceReleased: release,
  });
  await started();
  native.respond(200);
  expect((await result).status).toBe('success');
  expect(release).not.toHaveBeenCalled();
});
test.each([false, true])(
  'cleanup callback failure cannot change receipt or leak cause (async=%s)',
  async (asyncFailure) => {
    const native = task();
    const release = jest.fn(() => {
      const error = new Error('fixture-security-token /private/source');
      if (asyncFailure) return Promise.reject(error);
      throw error;
    });
    const result = oss.uploadOssFile(input, {
      authorization: provided(),
      onSourceReleased: release,
    });
    await started();
    native.complete();
    native.respond(200);
    expect((await result).status).toBe('success');
    await started();
    expect(mockWarn).toHaveBeenCalled();
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
      /fixture-security-token|\/private\/source/,
    );
  },
);
test('reports actual valid bytes, omits unknown total, and waits for OSS even at full progress', async () => {
  const native = task();
  const progress = jest.fn();
  let settled = false;
  const result = oss
    .uploadOssFile(input, { authorization: provided(), onProgress: progress })
    .then((value) => {
      settled = true;
      return value;
    });
  await started();
  expect(native.request.uploadProgress).toHaveBeenCalledWith(
    { interval: 50 },
    expect.any(Function),
  );
  native.progress(10, 100);
  native.progress(100, 100);
  native.progress(120, -1);
  native.progress(-1, 4);
  native.progress(NaN, 4);
  expect(progress.mock.calls).toEqual([
    [{ sentBytes: 10, totalBytes: 100 }],
    [{ sentBytes: 100, totalBytes: 100 }],
    [{ sentBytes: 120 }],
  ]);
  expect(settled).toBe(false);
  native.respond(200);
  await result;
});
test.each([
  [
    undefined,
    'https://fixture-bucket.oss-cn-example.aliyuncs.com/root/a//%E4%B8%AD%20%25%3F%23.png',
  ],
  [
    'https://cdn.example.test/prefix/',
    'https://cdn.example.test/prefix/a//%E4%B8%AD%20%25%3F%23.png',
  ],
  ['bad URL', undefined],
  ['https://cdn.example.test/path?token=secret', undefined],
])(
  'preserves object names and constructs only known access URLs: %s',
  async (baseUrl, url) => {
    const native = task();
    const result = oss.uploadOssFile(
      { ...input, path: '/a//中 %?#.png/' },
      {
        authorization: {
          kind: 'provided',
          credential: credential({ rootPath: '/root/', baseUrl }),
        },
      },
    );
    await started();
    native.respond(200);
    expect(await result).toEqual({
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'root/a//中 %?#.png',
        ...(url ? { url } : {}),
      },
    });
    const form = fetch.mock.calls[0][3];
    expect(
      JSON.parse(
        Buffer.from(
          form.find((field: { name: string }) => field.name === 'Policy').data,
          'base64',
        ).toString(),
      ).conditions,
    ).toEqual([
      { key: 'root/a//中 %?#.png' },
      { success_action_status: '200' },
    ]);
  },
);

test('accepts native SDK decimal byte strings and rejects malformed bytes', async () => {
  const native = task();
  const progress = jest.fn();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    onProgress: progress,
  });
  await started();
  const emit = native.progress as (sent: unknown, total: unknown) => void;
  emit('3', '10');
  emit('10', '-1');
  emit('', '10');
  emit('NaN', '10');
  emit('3.2', '10');
  expect(progress.mock.calls).toEqual([
    [{ sentBytes: 3, totalBytes: 10 }],
    [{ sentBytes: 10 }],
  ]);
  native.respond(204);
  await result;
});

test.each(['throw', 'failed', 'cancelled'])(
  'managed credential %s cannot start transport',
  async (outcome) => {
    const release = jest.fn();
    const get = jest.fn(async () => {
      if (outcome === 'throw')
        throw new Error('fixture-access-secret /private/file');
      return outcome === 'failed'
        ? {
            status: 'failed' as const,
            error: {
              reason: 'rejected' as const,
              message: 'fixture-security-token',
            },
          }
        : { status: 'cancelled' as const };
    });
    const result = await oss.uploadOssFile(input, {
      authorization: {
        kind: 'managed',
        access: { get, dispose: jest.fn() },
        ossKey: 'ossprivate',
      },
      onSourceReleased: release,
    });
    expect(result).toMatchObject(
      outcome === 'cancelled'
        ? { status: 'cancelled' }
        : { status: 'failed', error: { reason: 'credential' } },
    );
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-access-secret|fixture-security-token|\/private/,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  },
);
test('explicit MIME is kept, zero limit is enforced, and unknown extension uses binary type', async () => {
  for (const mimeType of [undefined, 'custom/type']) {
    const native = task();
    const result = oss.uploadOssFile(
      { ...input, path: 'blob.unknown', maxBytes: 0, mimeType },
      { authorization: provided() },
    );
    await started();
    const form = fetch.mock.calls[fetch.mock.calls.length - 1][3];
    expect(
      form.find(
        (field: { name: string }) => field.name === 'x-oss-content-type',
      ).data,
    ).toBe(mimeType ?? 'application/octet-stream');
    expect(
      JSON.parse(
        Buffer.from(
          form.find((field: { name: string }) => field.name === 'Policy').data,
          'base64',
        ).toString(),
      ).conditions,
    ).toContainEqual(['content-length-range', 0, 0]);
    native.respond(200);
    await result;
  }
});

test('signing failure is sanitized, releases unread source and never starts SDK', async () => {
  jest.spyOn(Utf8, 'parse').mockImplementationOnce(() => {
    throw new Error('fixture-access-secret /private/file');
  });
  const release = jest.fn();
  const result = await oss.uploadOssFile(input, {
    authorization: provided(),
    onSourceReleased: release,
  });
  expect(result).toMatchObject({
    status: 'failed',
    error: { reason: 'signing' },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /fixture-access-secret|\/private\/file/,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.failed',
    expect.objectContaining({
      context: expect.objectContaining({ operationId: expect.any(String) }),
      phase: 'signing',
      fields: expect.objectContaining({
        operation: 'upload',
        errorType: 'Error',
      }),
    }),
  );
});

test('native preparation logs its safe cause without starting transfer', async () => {
  jest.mocked(BlobUtil.config).mockImplementationOnce(() => {
    throw Object.assign(new Error('private-token /private/source'), {
      code: 'ETIMEDOUT',
    });
  });
  const result = await oss.uploadOssFile(input, { authorization: provided() });
  expect(result).toMatchObject({
    status: 'failed',
    error: { reason: 'unsupported' },
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.failed',
    expect.objectContaining({
      phase: 'native_prepare',
      fields: expect.objectContaining({
        reason: 'timeout',
        sourceCode: 'ETIMEDOUT',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
    /private-token|\/private\/source/,
  );
});

test('transfer failure preserves the cause and HTTP rejection preserves only valid status', async () => {
  const native = task();
  const result = oss.uploadOssFile(input, { authorization: provided() });
  await started();
  native.reject(
    Object.assign(new Error('fixture-security-token'), { code: 'ECONNRESET' }),
  );
  expect(await result).toMatchObject({
    status: 'failed',
    error: { reason: 'unconfirmed' },
  });
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.failed',
    expect.objectContaining({
      phase: 'transfer',
      fields: expect.objectContaining({
        reason: 'connection_reset',
        sourceCode: 'ECONNRESET',
      }),
    }),
  );
  const rejected = task();
  const failure = oss.uploadOssFile(input, { authorization: provided() });
  await started();
  rejected.respond(403);
  expect(await failure).toMatchObject({
    status: 'failed',
    error: { reason: 'rejected', httpStatus: 403 },
  });
  expect(mockWarn).toHaveBeenLastCalledWith(
    'oss.upload.failed',
    expect.objectContaining({
      phase: 'response',
      httpStatus: 403,
      fields: { operation: 'upload', reason: 'rejected' },
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(
    'fixture-security-token',
  );
});

test('managed authorization exceptions log once and cancellation remains quiet', async () => {
  const controller = new AbortController();
  const get = jest.fn(async () => {
    throw Object.assign(new Error('private-credential'), { code: 'ETIMEDOUT' });
  });
  const authorization = {
    kind: 'managed' as const,
    access: { get, dispose: jest.fn() },
    ossKey: 'osspublic' as const,
  };
  expect(await oss.uploadOssFile(input, { authorization })).toMatchObject({
    status: 'failed',
    error: { reason: 'credential' },
  });
  expect(mockWarn).toHaveBeenCalledTimes(1);
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.authorization_failed',
    expect.objectContaining({
      phase: 'credential',
      fields: expect.objectContaining({
        operation: 'authorize',
        sourceCode: 'ETIMEDOUT',
      }),
    }),
  );
  mockWarn.mockClear();
  const native = task();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
  });
  await started();
  controller.abort();
  expect(await result).toEqual({ status: 'cancelled' });
  native.complete();
  expect(mockWarn).not.toHaveBeenCalled();
});

test('observer and source release exceptions have separate diagnostics without changing receipt', async () => {
  const native = task();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    onProgress: () => {
      throw new TypeError('private-progress');
    },
    onSourceReleased: () =>
      Promise.reject(
        Object.assign(new Error('private-release'), { code: 'EIO' }),
      ),
  });
  await started();
  native.progress(1, 2);
  native.complete();
  native.complete();
  native.respond(200);
  expect((await result).status).toBe('success');
  await started();
  expect(mockWarn).toHaveBeenCalledTimes(2);
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.observer_failed',
    expect.objectContaining({
      phase: 'callback',
      fields: expect.objectContaining({
        operation: 'progress',
        errorType: 'TypeError',
      }),
    }),
  );
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.source_release_failed',
    expect.objectContaining({
      context: expect.objectContaining({ operationId: expect.any(String) }),
      phase: 'cleanup',
      fields: expect.objectContaining({
        operation: 'release',
        sourceCode: 'EIO',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
    /private-progress|private-release/,
  );
});

test('native cancellation exception is diagnosed while settlement still belongs to native completion', async () => {
  const native = task();
  native.request.cancel.mockImplementationOnce(() => {
    throw new Error('private-cancel');
  });
  const controller = new AbortController();
  const release = jest.fn();
  const result = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
    onSourceReleased: release,
  });
  await started();
  controller.abort();
  expect(native.request.cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  expect(mockWarn).toHaveBeenCalledWith(
    'oss.upload.cancel_failed',
    expect.objectContaining({
      phase: 'cleanup',
      fields: expect.objectContaining({
        operation: 'cancel',
        errorType: 'Error',
      }),
    }),
  );
  native.respond(200);
  expect((await result).status).toBe('success');
  native.complete();
  expect(release).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('private-cancel');
});

test('authorization rejection after cancellation releases the unread source without warning', async () => {
  const pending = deferred<OssCredentialResult>();
  const controller = new AbortController();
  const release = jest.fn();
  const get = jest.fn(() => pending.promise);
  const waiting = oss.uploadOssFile(input, {
    authorization: {
      kind: 'managed',
      access: { get, dispose: jest.fn() },
      ossKey: 'ossprivate',
    },
    signal: controller.signal,
    onSourceReleased: release,
  });
  controller.abort();
  pending.reject(new Error('private-late-authorization'));
  expect(await waiting).toEqual({ status: 'cancelled' });
  expect(get).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockWarn).not.toHaveBeenCalled();
});

test('cancellation during SDK preparation releases before native reading without warning', async () => {
  const controller = new AbortController();
  const release = jest.fn();
  (BlobUtil.config as jest.Mock).mockImplementationOnce(() => {
    controller.abort();
    return { fetch };
  });
  expect(
    await oss.uploadOssFile(input, {
      authorization: provided(),
      signal: controller.signal,
      onSourceReleased: release,
    }),
  ).toEqual({ status: 'cancelled' });
  expect(fetch).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockWarn).not.toHaveBeenCalled();
});

test('cancellation before abort subscription stops native transfer once and waits for its release event', async () => {
  const controller = new AbortController();
  const native = task();
  const release = jest.fn();
  fetch.mockImplementationOnce(() => {
    controller.abort();
    return native.request;
  });
  const waiting = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
    onSourceReleased: release,
  });
  expect(await waiting).toEqual({ status: 'cancelled' });
  expect(native.request.cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  native.complete();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockWarn).not.toHaveBeenCalled();
});

test('an unconfirmed native response after cancellation stays cancelled and is not logged as failure', async () => {
  const controller = new AbortController();
  const native = task();
  native.request.cancel.mockImplementationOnce(() => native.request);
  const release = jest.fn();
  const waiting = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
    onSourceReleased: release,
  });
  await started();
  controller.abort();
  native.respond(0);
  expect(await waiting).toEqual({ status: 'cancelled' });
  expect(native.request.cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  native.complete();
  expect(release).toHaveBeenCalledTimes(1);
  expect(mockWarn).not.toHaveBeenCalled();
});

test('a retained abort callback after settlement cannot cancel the completed upload or add warnings', async () => {
  const controller = new AbortController();
  const subscribe = jest.spyOn(controller.signal, 'addEventListener');
  const native = task();
  const waiting = oss.uploadOssFile(input, {
    authorization: provided(),
    signal: controller.signal,
  });
  await started();
  const callback = subscribe.mock.calls.find(
    ([name]) => name === 'abort',
  )![1] as EventListener;
  native.respond(200);
  expect((await waiting).status).toBe('success');
  callback(new Event('abort'));
  expect(native.request.cancel).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
});

test('object names never become multipart filename headers', async () => {
  const native = task();
  const result = oss.uploadOssFile(
    { ...input, path: 'unsafe"\r\nInjected: value.jpg' },
    { authorization: provided() },
  );
  await started();
  const form = fetch.mock.calls[0][3];
  expect(form[form.length - 1].filename).toBe('file');
  expect(form[0].data).toBe('logs/unsafe"\r\nInjected: value.jpg');
  native.respond(200);
  expect((await result).status).toBe('success');
});

test.each(['blob.constructor', 'blob.__proto__', 'json', 'folder.json/json'])(
  'uses binary MIME for unknown or absent extension in %s',
  async (path) => {
    const native = task();
    const result = oss.uploadOssFile(
      { ...input, path },
      { authorization: provided() },
    );
    await started();
    const form = fetch.mock.calls[0][3];
    expect(
      form.find(
        (field: { name: string }) => field.name === 'x-oss-content-type',
      ).data,
    ).toBe('application/octet-stream');
    expect(form[form.length - 1].type).toBe('application/octet-stream');
    native.respond(200);
    expect((await result).status).toBe('success');
  },
);

test.each([
  ['folder/data.JSON', undefined, 'application/json'],
  ['blob.constructor', 'custom/type', 'custom/type'],
  ['json', 'custom/type', 'custom/type'],
])(
  'preserves known or explicit MIME for %s',
  async (path, mimeType, expected) => {
    const native = task();
    const result = oss.uploadOssFile(
      { ...input, path: path!, mimeType },
      { authorization: provided() },
    );
    await started();
    const form = fetch.mock.calls[0][3];
    expect(
      form.find(
        (field: { name: string }) => field.name === 'x-oss-content-type',
      ).data,
    ).toBe(expected);
    expect(form[form.length - 1].type).toBe(expected);
    native.respond(200);
    expect((await result).status).toBe('success');
  },
);

test('需要源文件地址时使用实际上传端点和对象键，保留配置访问地址的默认规则', async () => {
  const native = task();
  const result = oss.uploadOssFile(
    { ...input, path: 'chat/原图.png', urlMode: 'origin' },
    {
      authorization: {
        kind: 'provided',
        credential: credential({
          rootPath: '/root/',
          baseUrl: 'https://cdn.example.test/prefix/',
        }),
      },
    },
  );
  await started();
  native.respond(200);
  expect(await result).toEqual({
    status: 'success',
    object: {
      bucketName: 'fixture-bucket',
      objectKey: 'root/chat/原图.png',
      url: 'https://fixture-bucket.oss-cn-example.aliyuncs.com/root/chat/%E5%8E%9F%E5%9B%BE.png',
    },
  });
});
