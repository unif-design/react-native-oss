import { readOssCredential } from '@unif/react-native-oss';
import { credential, now } from './credentialFixture';

beforeEach(() => jest.useFakeTimers().setSystemTime(now));
afterEach(() => jest.useRealTimers());

test('公开验证入口只投影当前字段并冻结凭证', () => {
  const input = credential({ baseUrl: '', requestId: 'extra-field' });
  const result = readOssCredential(input);
  expect(result).toEqual(credential({ baseUrl: '' }));
  expect(result).not.toBe(input);
  expect(Object.isFrozen(result)).toBe(true);
});

test.each([
  'accessKeyId',
  'accessKeySecret',
  'securityToken',
  'bucketName',
  'endpoint',
  'rootPath',
  'expiration',
])('拒绝缺少签名必需字段 %s 的凭证', (field) => {
  const input: Record<string, unknown> = credential();
  delete input[field];
  expect(readOssCredential(input)).toBeNull();
});

test.each([undefined, '', 'not-a-resource-url', 17, null])(
  '可选 baseUrl=%p 不使可签名凭证失效',
  (baseUrl) => {
    const result = readOssCredential(credential({ rootPath: '', baseUrl }));
    expect(result?.rootPath).toBe('');
    if (typeof baseUrl === 'string') expect(result?.baseUrl).toBe(baseUrl);
    else expect(result).not.toHaveProperty('baseUrl');
  },
);

test.each([
  'oss-cn-example.aliyuncs.com',
  'https://oss-cn-example.aliyuncs.com',
  'http://oss-cn-example.aliyuncs.com:8080/',
])('接受可构造目标的 endpoint %s', (endpoint) => {
  expect(readOssCredential(credential({ endpoint }))).not.toBeNull();
});

test.each([
  '',
  '   ',
  'ftp://oss.example',
  'https://user:pass@oss.example',
  'oss.example/path',
  'https://oss.example/a/..',
  'https://oss.example?',
  'https://oss.example#',
  'https://oss.example\\path',
  'https://oss.example:99999',
  '/oss.example',
])('拒绝不可用 endpoint %p', (endpoint) => {
  expect(readOssCredential(credential({ endpoint }))).toBeNull();
});

test.each(['', 'bucket/name', 'bucket@other', 'bucket?query', ' bucket'])(
  '拒绝不能安全构造目标的 bucket %p',
  (bucketName) => {
    expect(readOssCredential(credential({ bucketName }))).toBeNull();
  },
);

test.each([
  '2026-09-16T02:05:00',
  '2026-09-16',
  '2026-02-30T02:05:00Z',
  '2026-09-16T25:00:00Z',
  '2026-09-16T02:05:00+24:00',
  'invalid',
])('有效期必须是合法且带时区的 ISO 时间：%s', (expiration) => {
  expect(readOssCredential(credential({ expiration }))).toBeNull();
});

test.each([30_000, 0, -1])('拒绝仅剩 %i ms 的凭证', (remaining) => {
  expect(
    readOssCredential(
      credential({ expiration: new Date(now + remaining).toISOString() }),
    ),
  ).toBeNull();
});

test.each([
  '2026-09-16T02:00:30.001Z',
  '2026-09-16T10:05:00+08:00',
  '2026-09-15T22:05:00-04:00',
])('保留带时区有效期 %s', (expiration) => {
  expect(readOssCredential(credential({ expiration }))?.expiration).toBe(
    expiration,
  );
});
