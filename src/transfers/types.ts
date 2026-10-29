import type {
  UploadOssFileInput,
  UploadOssFileOptions,
  OssUploadFailed,
  OssUploadSuccess,
  OssUploadCancelled,
  OssUploadResult,
  OssUploadProgress,
  OssUploadError,
} from '../upload';

export interface TransferRemoteFileToOssInput extends Omit<
  UploadOssFileInput,
  'fileUri'
> {
  sourceUrl: string;
}
export interface OssSourceDownloadError {
  message: string;
  httpStatus?: number;
}
export interface OssTransferDownloadFailed {
  status: 'failed';
  stage: 'download';
  error: OssSourceDownloadError;
}
export interface OssTransferUploadFailed extends OssUploadFailed {
  stage: 'upload';
}
export type OssTransferResult =
  | OssUploadSuccess
  | OssUploadCancelled
  | OssTransferDownloadFailed
  | OssTransferUploadFailed;
export interface OssTransferOptions extends Omit<
  UploadOssFileOptions,
  'onSourceReleased'
> {
  transferDirectory: string | undefined;
  createId(): string;
}

export interface LocalOssBatchItem extends UploadOssFileInput {
  kind: 'local';
}
export interface RemoteOssBatchItem extends TransferRemoteFileToOssInput {
  kind: 'remote';
}
export type OssBatchItem = LocalOssBatchItem | RemoteOssBatchItem;
export interface OssBatchNotStarted {
  status: 'not_started';
  reason: 'cancelled' | 'preparation_failed';
}
export interface OssBatchItemResult {
  index: number;
  path: string;
  result: OssUploadResult | OssTransferResult | OssBatchNotStarted;
}
export interface OssBatchProgress {
  index: number;
  progress: Readonly<OssUploadProgress>;
}
export interface OssBatchOptions extends Omit<
  UploadOssFileOptions,
  'onProgress' | 'onSourceReleased'
> {
  transferDirectory: string | undefined;
  createId(): string;
  onProgress?(event: Readonly<OssBatchProgress>): void;
}
export interface OssBatchResult {
  items: readonly OssBatchItemResult[];
  preparationError?: OssUploadError;
}
