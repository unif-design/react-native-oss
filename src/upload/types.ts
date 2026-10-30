import type { OssCredentialAccess, OssCredential, OssKey } from '../types';

export interface ManagedOssAuthorization {
  kind: 'managed';
  access: OssCredentialAccess;
  ossKey: OssKey;
}
export interface ProvidedOssAuthorization {
  kind: 'provided';
  credential: Readonly<OssCredential>;
}
export type OssAuthorization =
  ManagedOssAuthorization | ProvidedOssAuthorization;
export interface UploadOssFileInput {
  fileUri: string;
  path: string;
  mimeType?: string;
  maxBytes?: number;
  urlMode?: 'configured' | 'origin';
}
export interface OssUploadProgress {
  sentBytes: number;
  totalBytes?: number;
}
export interface UploadOssFileOptions {
  authorization: OssAuthorization;
  signal?: AbortSignal;
  onProgress?(progress: Readonly<OssUploadProgress>): void;
  onSourceReleased?(): void | Promise<void>;
}
export interface OssUploadedObject {
  bucketName: string;
  objectKey: string;
  url?: string;
}
export type OssUploadErrorReason =
  | 'invalid_input'
  | 'credential'
  | 'signing'
  | 'rejected'
  | 'unconfirmed'
  | 'unsupported';
export interface OssUploadError {
  reason: OssUploadErrorReason;
  message: string;
  httpStatus?: number;
}
export interface OssUploadSuccess {
  status: 'success';
  object: OssUploadedObject;
}
export interface OssUploadCancelled {
  status: 'cancelled';
}
export interface OssUploadFailed {
  status: 'failed';
  error: OssUploadError;
}
export type OssUploadResult =
  OssUploadSuccess | OssUploadCancelled | OssUploadFailed;
export interface PreparedUploadInput {
  localPath: string;
  path: string;
  mimeType: string;
  maxBytes?: number;
  urlMode?: 'configured' | 'origin';
}
export interface OssUploadTarget {
  uploadUrl: string;
  object: OssUploadedObject;
}
export interface OssUploadField {
  name: string;
  data: string;
  filename?: string;
  type?: string;
}
export interface OssPolicyKeyCondition {
  key: string;
}
export interface OssPolicyStatusCondition {
  success_action_status: string;
}
export type OssPolicyCondition =
  OssPolicyKeyCondition | OssPolicyStatusCondition | [string, number, number];
