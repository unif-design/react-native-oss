export type OssKey = string;
export interface OssCredential {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  bucketName: string;
  endpoint: string;
  rootPath: string;
  expiration: string;
  baseUrl?: string;
}
export interface OssCredentialReadOptions {
  signal?: AbortSignal;
}
export type OssCredentialErrorReason =
  | 'access'
  | 'rejected'
  | 'invalid_response'
  | 'invalid_credential'
  | 'unavailable';
export interface OssCredentialError {
  reason: OssCredentialErrorReason;
  message: string;
  businessCode?: number;
}
export interface OssCredentialSuccess {
  status: 'success';
  credential: Readonly<OssCredential>;
}
export interface OssCredentialCancelled {
  status: 'cancelled';
}
export interface OssCredentialFailed {
  status: 'failed';
  error: OssCredentialError;
}
export type OssCredentialResult =
  OssCredentialSuccess | OssCredentialCancelled | OssCredentialFailed;
export interface OssCredentialRequest {
  (
    ossKey: OssKey,
    options?: OssCredentialReadOptions,
  ): Promise<OssCredentialResult>;
}
export interface OssCredentialAccess {
  get(
    ossKey: OssKey,
    options?: OssCredentialReadOptions,
  ): Promise<OssCredentialResult>;
  dispose(): void;
}
