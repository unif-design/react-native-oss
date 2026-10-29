'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'unif-oss-consumer-'));
function run(command, args, cwd = temporary) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// 首次发行前允许显式提供同批 Files tarball，不能据此宣称 registry 消费成功。
const filesTarball = process.argv[2]
  ? path.resolve(process.argv[2])
  : undefined;
try {
  const packResult = JSON.parse(
    run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
      root,
    ),
  );
  const [packed] = Array.isArray(packResult)
    ? packResult
    : Object.values(packResult);
  assert(
    !packed.files.some((file) => file.path.endsWith('.patch')),
    'public package must not distribute host patches',
  );
  const dependencies = {
    '@unif/react-native-oss': `file:${path.join(temporary, packed.filename)}`,
    '@unif/react-native-files': filesTarball
      ? `file:${filesTarball}`
      : pkg.peerDependencies['@unif/react-native-files'],
    '@unif/react-native-logger':
      pkg.devDependencies['@unif/react-native-logger'],
    'react': pkg.devDependencies.react,
    'react-native': pkg.devDependencies['react-native'],
    'react-native-blob-util': '0.25.1',
    '@dr.pogodin/react-native-fs': '2.41.0',
    '@dr.pogodin/react-native-static-server': '0.28.1',
    'typescript': '6.0.3',
    '@types/react': '~19.3.0',
  };
  fs.writeFileSync(
    path.join(temporary, 'package.json'),
    JSON.stringify(
      {
        name: 'oss-public-consumer',
        version: '1.0.0',
        private: true,
        dependencies,
      },
      null,
      2,
    ),
  );
  fs.copyFileSync(
    path.join(__dirname, 'consumer.ts'),
    path.join(temporary, 'consumer.ts'),
  );
  fs.writeFileSync(
    path.join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ES2022',
        skipLibCheck: false,
        lib: ['esnext', 'dom'],
        types: ['react'],
      },
      include: ['consumer.ts'],
    }),
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '--project',
    'tsconfig.json',
  ]);
  const installed = require(
    path.join(temporary, 'node_modules/@unif/react-native-oss/package.json'),
  );
  assert.equal(installed.version, pkg.version);
  assert.equal(
    fs
      .lstatSync(path.join(temporary, 'node_modules/@unif/react-native-oss'))
      .isSymbolicLink(),
    false,
  );
  const locations = ['@unif/react-native-oss', '@unif/react-native-files'].map(
    (name) =>
      require.resolve('@unif/react-native-logger/package.json', {
        paths: [path.join(temporary, 'node_modules', name)],
      }),
  );
  assert.equal(
    locations[0],
    locations[1],
    'OSS and Files must share the same logger installation',
  );
  fs.writeFileSync(
    path.join(temporary, 'verification.json'),
    JSON.stringify(
      {
        oss: installed.version,
        filesFrom: filesTarball ? 'supplied-tarball' : 'registry',
        publicTypes: true,
        sharedLogger: true,
        nativePatchesApplied: false,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS actual tarball public types and shared logger; evidence: ${temporary}`,
  );
  console.log(
    'Native SDK patches, native builds, device and service behavior require prepared host validation.',
  );
} catch (error) {
  console.error(
    error.stderr?.toString() || error.stdout?.toString() || error.message,
  );
  console.error(`Consumer evidence retained at ${temporary}`);
  process.exitCode = 1;
}
