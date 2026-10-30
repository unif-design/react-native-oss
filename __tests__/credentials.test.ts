import * as logging from '@unif/react-native-logger';
import { createOssCredentialAccess } from '@unif/react-native-oss';
import type {
  OssCredential,
  OssCredentialRequest,
  OssCredentialResult,
} from '@unif/react-native-oss';
import { credential, deferred, now } from './credentialFixture';

jest.mock('@unif/react-native-logger', () => ({
  ...jest.requireActual('@unif/react-native-logger'),
  createLogger: jest.fn(
    jest.requireActual('@unif/react-native-logger').createLogger,
  ),
}));

beforeEach(() => jest.useFakeTimers().setSystemTime(now));
afterEach(() => jest.useRealTimers());

test('有效缓存按 ossKey 复用，到期才再请求；外部对象变化不能改写缓存', async () => {
  const input = credential();
  const request = jest.fn(async (): Promise<OssCredentialResult> => ({
    status: 'success',
    credential: input as OssCredential,
  }));
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  const first = await access.get('osspublic');
  input.accessKeySecret = 'mutated';
  const second = await access.get('osspublic');
  expect(request).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
  if (second.status === 'success')
    expect(second.credential.accessKeySecret).toBe('fixture-access-secret');
  await access.get('ossprivate');
  expect(request).toHaveBeenCalledTimes(2);
  jest.setSystemTime(now + 270_000);
  await expect(access.get('osspublic')).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'invalid_credential' },
  });
  expect(request).toHaveBeenCalledTimes(3);
});

test('失败只请求一次，不调度刷新；另一对象不共享缓存', async () => {
  const request = jest.fn(async (): Promise<OssCredentialResult> => ({
    status: 'failed',
    error: { reason: 'unavailable', message: '服务不可用' },
  }));
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  await expect(access.get('osspublic')).resolves.toMatchObject({
    status: 'failed',
  });
  jest.runOnlyPendingTimers();
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValue({
    status: 'success',
    credential: credential() as OssCredential,
  });
  await access.get('osspublic');
  await createOssCredentialAccess(request, ['osspublic', 'ossprivate']).get(
    'osspublic',
  );
  expect(request).toHaveBeenCalledTimes(3);
});

test('并发冷请求各执行一次，不隐式合并', async () => {
  const request = jest.fn(async (): Promise<OssCredentialResult> => ({
    status: 'success',
    credential: credential() as OssCredential,
  }));
  await Promise.all([
    createOssCredentialAccess(request, ['osspublic', 'ossprivate']).get(
      'osspublic',
    ),
  ]);
  request.mockClear();
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  await Promise.all([access.get('osspublic'), access.get('osspublic')]);
  expect(request).toHaveBeenCalledTimes(2);
});

test('dispose 清空缓存并拒绝后续和迟到响应，不交给新的访问对象', async () => {
  const pending = deferred<OssCredentialResult>();
  const request = jest.fn<
    ReturnType<OssCredentialRequest>,
    Parameters<OssCredentialRequest>
  >(() => pending.promise);
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  const reading = access.get('ossprivate');
  access.dispose();
  pending.resolve({
    status: 'success',
    credential: credential() as OssCredential,
  });
  await expect(reading).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'access' },
  });
  await expect(access.get('ossprivate')).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'access' },
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test('取消或意外请求异常不缓存、不抛出敏感原文', async () => {
  const pending = deferred<OssCredentialResult>();
  const request = jest.fn(() => pending.promise);
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  const controller = new AbortController();
  const reading = access.get('osspublic', { signal: controller.signal });
  controller.abort();
  pending.resolve({
    status: 'success',
    credential: credential() as OssCredential,
  });
  await expect(reading).resolves.toEqual({ status: 'cancelled' });
  request.mockRejectedValueOnce(new Error('fixture-access-secret'));
  const failed = await access.get('osspublic');
  expect(failed).toMatchObject({
    status: 'failed',
    error: { reason: 'unavailable' },
  });
  expect(JSON.stringify(failed)).not.toContain('fixture-access-secret');
  expect(request).toHaveBeenCalledTimes(2);
});
test('凭据访问转换原异常时记录安全诊断，失效后的迟到异常不告警', async () => {
  const warn = jest.fn();
  jest.spyOn(logging, 'createLogger').mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error: jest.fn(),
    captureError: jest.fn(),
  });
  const failure = Object.assign(new Error('private-credential'), {
    code: 'ETIMEDOUT',
  });
  const request = jest.fn().mockRejectedValueOnce(failure);
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  expect(await access.get('osspublic')).toMatchObject({
    status: 'failed',
    error: { reason: 'unavailable' },
  });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    'credential.request_failed',
    expect.objectContaining({
      phase: 'credential',
      fields: expect.objectContaining({
        operation: 'request',
        sourceCode: 'ETIMEDOUT',
        reason: 'timeout',
      }),
    }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private-credential');
  warn.mockClear();
  const pending = deferred<OssCredentialResult>();
  request.mockReturnValueOnce(pending.promise);
  const waiting = access.get('osspublic');
  access.dispose();
  pending.reject(failure);
  expect(await waiting).toMatchObject({
    status: 'failed',
    error: { reason: 'access' },
  });
  expect(warn).not.toHaveBeenCalled();
});

test('上游成功但 OSS 凭据校验失败由访问层记录，凭据内容不进入日志', async () => {
  const warn = jest.fn();
  jest.spyOn(logging, 'createLogger').mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error: jest.fn(),
    captureError: jest.fn(),
  });
  const request = jest.fn(async (): Promise<OssCredentialResult> => ({
    status: 'success',
    credential: credential({ accessKeyId: '' }) as OssCredential,
  }));
  expect(
    await createOssCredentialAccess(request, ['osspublic', 'ossprivate']).get(
      'osspublic',
    ),
  ).toMatchObject({
    status: 'failed',
    error: { reason: 'invalid_credential' },
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    'credential.invalid',
    expect.objectContaining({
      phase: 'validate',
      code: 'oss.credentials.invalid_credential',
      fields: { operation: 'read_credential', reason: 'invalid_credential' },
    }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(
    /fixture-access-secret|fixture-security-token|fixture-bucket/,
  );
});

test('OSS 凭据入口取消不请求，等待取消后的异常也不生成失败日志', async () => {
  const warn = jest.fn();
  jest.spyOn(logging, 'createLogger').mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error: jest.fn(),
    captureError: jest.fn(),
  });
  const pending = deferred<OssCredentialResult>();
  const request = jest.fn(() => pending.promise);
  const access = createOssCredentialAccess(request, [
    'osspublic',
    'ossprivate',
  ]);
  const early = new AbortController();
  early.abort();
  expect(await access.get('osspublic', { signal: early.signal })).toEqual({
    status: 'cancelled',
  });
  expect(request).not.toHaveBeenCalled();
  const controller = new AbortController();
  const waiting = access.get('osspublic', { signal: controller.signal });
  controller.abort();
  pending.reject(new Error('private-late-credential'));
  expect(await waiting).toEqual({ status: 'cancelled' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled();
});

test('宿主 key 白名单限制请求与缓存，创建后外部变更不能扩权', async () => {
  const keys = ['private-media'];
  const request = jest.fn(async (): Promise<OssCredentialResult> => ({
    status: 'success',
    credential: credential(),
  }));
  const access = createOssCredentialAccess(request, keys);
  keys.push('osspublic');
  expect(await access.get('osspublic')).toMatchObject({
    status: 'failed',
    error: { reason: 'access' },
  });
  expect(request).not.toHaveBeenCalled();
  expect(await access.get('private-media')).toMatchObject({
    status: 'success',
  });
  expect(await access.get('private-media')).toMatchObject({
    status: 'success',
  });
  expect(request).toHaveBeenCalledTimes(1);
});
