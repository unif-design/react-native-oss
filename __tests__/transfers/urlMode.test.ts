import { Platform } from 'react-native';
import BlobUtil from 'react-native-blob-util';
import { downloadLocalFile, deleteLocalFile } from '@unif/react-native-files';
import {
  transferRemoteFileToOss,
  uploadOssBatch,
} from '@unif/react-native-oss';
import type { UploadOssFileInput } from '@unif/react-native-oss';
import { credential, now } from '../credentialFixture';

jest.mock('@unif/react-native-files', () => ({
  downloadLocalFile: jest.fn(),
  deleteLocalFile: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    wrap: jest.fn((path: string) => path),
    config: jest.fn(() => ({ fetch: mockFetch })),
  },
}));

const mockFetch = jest.fn();
const download = jest.mocked(downloadLocalFile);
const flows = ['remote', 'batch-local', 'batch-remote'] as const;
const originUrl =
  'https://fixture-bucket.oss-cn-example.aliyuncs.com/root/photos/a%20b.jpg';
const configuredUrl = 'https://cdn.example.test/prefix/photos/a%20b.jpg';
const path = 'photos/a b.jpg';
let nextId = 0;

function options(baseUrl?: string) {
  return {
    authorization: {
      kind: 'provided' as const,
      credential: credential({ rootPath: 'root/', baseUrl }),
    },
    getTransferDirectory: () => 'file:///private/transfers',
    createId: () => `download-${++nextId}`,
  };
}

async function run(
  flow: (typeof flows)[number],
  urlMode: UploadOssFileInput['urlMode'],
  baseUrl?: string,
) {
  const input = { path, ...(urlMode === undefined ? {} : { urlMode }) };
  if (flow === 'remote') {
    return transferRemoteFileToOss(
      { ...input, sourceUrl: 'https://source.example.test/photo.jpg' },
      options(baseUrl),
    );
  }
  const result = await uploadOssBatch(
    [
      flow === 'batch-local'
        ? { ...input, kind: 'local', fileUri: 'file:///private/photo.jpg' }
        : {
            ...input,
            kind: 'remote',
            sourceUrl: 'https://source.example.test/photo.jpg',
          },
    ],
    options(baseUrl),
  );
  return result.items[0]!.result;
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.replaceProperty(Platform, 'OS', 'ios');
  nextId = 0;
  download.mockImplementation(async ({ targetUri }) => ({
    status: 'success',
    uri: targetUri,
    statusCode: 200,
    sizeBytes: 17,
  }));
  jest.mocked(deleteLocalFile).mockResolvedValue({
    status: 'success',
    deleted: true,
  });
  mockFetch.mockImplementation(() =>
    Object.assign(Promise.resolve({ info: () => ({ status: 200 }) }), {
      uploadProgress: jest.fn(),
      cancel: jest.fn(),
      onRequestComplete: (release: () => void) => queueMicrotask(release),
    }),
  );
});

describe.each(flows)('%s URL selection through the public entry', (flow) => {
  test.each([
    [undefined, 'https://cdn.example.test/prefix/', configuredUrl],
    ['configured', 'https://cdn.example.test/prefix/', configuredUrl],
    ['origin', 'https://cdn.example.test/prefix/', originUrl],
    [undefined, undefined, originUrl],
    ['configured', undefined, originUrl],
    ['origin', undefined, originUrl],
  ] as const)('mode=%s baseUrl=%s returns %s', async (mode, baseUrl, url) => {
    await expect(run(flow, mode, baseUrl)).resolves.toEqual({
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'root/photos/a b.jpg',
        url,
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'POST',
      'https://fixture-bucket.oss-cn-example.aliyuncs.com',
      expect.any(Object),
      expect.arrayContaining([{ name: 'key', data: 'root/photos/a b.jpg' }]),
    );
  });

  test('invalid urlMode is rejected before download or upload', async () => {
    await expect(
      run(flow, 'invalid' as UploadOssFileInput['urlMode']),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { reason: 'invalid_input' },
    });
    expect(download).not.toHaveBeenCalled();
    expect(BlobUtil.config).not.toHaveBeenCalled();
  });
});

test('one mixed batch preserves each item URL mode', async () => {
  const result = await uploadOssBatch(
    [
      {
        kind: 'local',
        fileUri: 'file:///private/photo.jpg',
        path,
        urlMode: 'origin',
      },
      {
        kind: 'remote',
        sourceUrl: 'https://source.example.test/one.jpg',
        path,
        urlMode: 'configured',
      },
      {
        kind: 'remote',
        sourceUrl: 'https://source.example.test/two.jpg',
        path,
        urlMode: 'origin',
      },
    ],
    options('https://cdn.example.test/prefix/'),
  );
  expect(result.items.map(({ result: item }) => item)).toEqual(
    [originUrl, configuredUrl, originUrl].map((url) => ({
      status: 'success',
      object: {
        bucketName: 'fixture-bucket',
        objectKey: 'root/photos/a b.jpg',
        url,
      },
    })),
  );
});
