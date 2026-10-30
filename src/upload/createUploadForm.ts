import Base64 from 'crypto-js/enc-base64';
import Utf8 from 'crypto-js/enc-utf8';
import HmacSHA1 from 'crypto-js/hmac-sha1';
import { OSS_UPLOAD_SUCCESS_STATUS } from './constants';
import type { OssCredential } from '../types';
import type {
  OssPolicyCondition,
  OssUploadField,
  PreparedUploadInput,
} from './types';

export function createUploadForm(
  credential: Readonly<OssCredential>,
  objectKey: string,
  input: PreparedUploadInput,
): OssUploadField[] {
  const conditions: OssPolicyCondition[] = [
    { key: objectKey },
    { success_action_status: OSS_UPLOAD_SUCCESS_STATUS },
  ];
  if (input.maxBytes !== undefined)
    conditions.push(['content-length-range', 0, input.maxBytes]);
  const policy = Base64.stringify(
    Utf8.parse(
      JSON.stringify({ expiration: credential.expiration, conditions }),
    ),
  );
  const signature = Base64.stringify(
    HmacSHA1(policy, credential.accessKeySecret),
  );
  return [
    { name: 'key', data: objectKey },
    { name: 'success_action_status', data: OSS_UPLOAD_SUCCESS_STATUS },
    { name: 'x-oss-content-type', data: input.mimeType },
    { name: 'x-oss-security-token', data: credential.securityToken },
    { name: 'OSSAccessKeyId', data: credential.accessKeyId },
    { name: 'Policy', data: policy },
    { name: 'Signature', data: signature },
  ];
}
