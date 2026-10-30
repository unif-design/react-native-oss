export { credentialFailure as createOssCredentialFailure } from './credentialFailure';
export { createOssCredentialAccess } from './createOssCredentialAccess';
export type {
  OssKey,
  OssCredential,
  OssCredentialReadOptions,
  OssCredentialErrorReason,
  OssCredentialError,
  OssCredentialSuccess,
  OssCredentialCancelled,
  OssCredentialFailed,
  OssCredentialResult,
  OssCredentialRequest,
  OssCredentialAccess,
} from './types';
export { uploadOssFile } from './upload/index.web';
export type {
  ManagedOssAuthorization,
  ProvidedOssAuthorization,
  OssAuthorization,
  UploadOssFileInput,
  OssUploadProgress,
  UploadOssFileOptions,
  OssUploadedObject,
  OssUploadErrorReason,
  OssUploadError,
  OssUploadSuccess,
  OssUploadCancelled,
  OssUploadFailed,
  OssUploadResult,
} from './upload/index.web';
export { transferRemoteFileToOss } from './transfers/index.web';
export type {
  TransferRemoteFileToOssInput,
  OssSourceDownloadError,
  OssTransferDownloadFailed,
  OssTransferUploadFailed,
  OssTransferResult,
  OssTransferOptions,
} from './transfers/index.web';
export { uploadOssBatch } from './transfers/index.web';
export type {
  LocalOssBatchItem,
  RemoteOssBatchItem,
  OssBatchItem,
  OssBatchNotStarted,
  OssBatchItemResult,
  OssBatchProgress,
  OssBatchOptions,
  OssBatchResult,
} from './transfers/index.web';
export { readOssCredential } from './readOssCredential';
