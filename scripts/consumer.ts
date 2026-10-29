import {
  createOssCredentialAccess,
  createOssCredentialFailure,
  readOssCredential,
  uploadOssFile,
  transferRemoteFileToOss,
  uploadOssBatch,
} from '@unif/react-native-oss';
import type {
  OssCredential,
  OssCredentialResult,
  OssUploadResult,
  OssTransferResult,
  OssBatchResult,
} from '@unif/react-native-oss';

declare const value: unknown;
declare const credential: OssCredential;
declare const signal: AbortSignal;
const failure: OssCredentialResult = createOssCredentialFailure(
  'rejected',
  403,
);
const checked: Readonly<OssCredential> | null = readOssCredential(value);
const access = createOssCredentialAccess(
  async (): Promise<OssCredentialResult> => ({ status: 'success', credential }),
  ['private-media'],
);
const options = {
  authorization: { kind: 'managed' as const, access, ossKey: 'private-media' },
  signal,
  transferDirectory: 'file:///private/transfers',
  createId: () => 'fixture-unique-id',
};
const upload: Promise<OssUploadResult> = uploadOssFile(
  { fileUri: 'file:///private/source', path: 'object' },
  { ...options, onSourceReleased: async () => {} },
);
const transfer: Promise<OssTransferResult> = transferRemoteFileToOss(
  { sourceUrl: 'https://fixture.invalid/file', path: 'object' },
  options,
);
const batch: Promise<OssBatchResult> = uploadOssBatch(
  [{ kind: 'local', fileUri: 'file:///private/source', path: 'object' }],
  options,
);
export { failure, checked, upload, transfer, batch };
