export const now = Date.UTC(2026, 8, 16, 2);

export function credential(overrides: Record<string, unknown> = {}) {
  return {
    accessKeyId: 'fixture-access-id',
    accessKeySecret: 'fixture-access-secret',
    securityToken: 'fixture-security-token',
    bucketName: 'fixture-bucket',
    endpoint: 'oss-cn-example.aliyuncs.com',
    rootPath: 'logs/',
    expiration: new Date(now + 300_000).toISOString(),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
