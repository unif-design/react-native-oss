/* global jest, test */
jest.mock('react-native', () => ({
  Platform: { OS: 'web', Version: 0 },
  NativeModules: {},
}));
jest.mock('react-native-blob-util', () => {
  throw new Error('Browser entry must not load native upload SDK');
});
jest.mock('@dr.pogodin/react-native-fs', () => {
  throw new Error('Browser entry must not load native file SDK');
});
const assert = require('node:assert/strict');
async function main() {
  const {
    createOssCredentialAccess,
    uploadOssFile,
    transferRemoteFileToOss,
    uploadOssBatch,
  } = require('@unif/react-native-oss');

  const entry = require.resolve('@unif/react-native-oss');
  assert(entry.endsWith('/lib/module/index.web.js'), entry);
  const credential = {
    accessKeyId: 'fixture-access-id',
    accessKeySecret: 'fixture-access-secret',
    securityToken: 'fixture-security-token',
    bucketName: 'fixture-bucket',
    endpoint: 'oss-cn-example.aliyuncs.com',
    rootPath: 'fixtures/',
    expiration: new Date(Date.now() + 300_000).toISOString(),
  };

  for (const action of ['abort', 'dispose']) {
    let finish;
    let requestedSignal;
    const access = createOssCredentialAccess(
      (_key, options) => {
        requestedSignal = options.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      ['public-media'],
    );
    const controller = new AbortController();
    const waiting = access.get('public-media', { signal: controller.signal });
    if (action === 'abort') controller.abort();
    else access.dispose();
    const result = await waiting;
    assert.equal(result.status, action === 'abort' ? 'cancelled' : 'failed');
    if (action === 'dispose') assert.equal(result.error.reason, 'access');
    assert.equal(requestedSignal.aborted, true);
    finish({ status: 'success', credential });
    await Promise.resolve();
    access.dispose();
    assert.equal((await access.get('public-media')).error.reason, 'access');
  }

  const access = createOssCredentialAccess(
    async () => ({ status: 'success', credential }),
    ['public-media'],
  );
  assert.equal((await access.get('other')).error.reason, 'access');
  assert.equal((await access.get('public-media')).status, 'success');
  const controller = new AbortController();
  const cached = access.get('public-media', { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await cached, { status: 'cancelled' });
  assert.equal((await access.get('public-media')).status, 'success');
  access.dispose();

  const options = {
    authorization: { kind: 'provided', credential },
    onRequestStarted() {
      assert.fail('Web must not start a native upload');
    },
    getTransferDirectory() {
      assert.fail('Web must not read native paths');
    },
    createId() {
      assert.fail('Web must not prepare native files');
    },
  };
  const local = { fileUri: 'file:///fixture/photo', path: 'photo' };
  assert.equal(
    (await uploadOssFile(local, options)).error.reason,
    'unsupported',
  );
  assert.equal(
    (
      await transferRemoteFileToOss(
        { sourceUrl: 'https://fixture.invalid/photo', path: 'photo' },
        options,
      )
    ).error.reason,
    'unsupported',
  );
  assert.equal(
    (await uploadOssBatch([{ kind: 'local', ...local }], options))
      .preparationError.reason,
    'unsupported',
  );
}
test(
  'installed tarball browser entry preserves credential and native boundaries',
  main,
);
