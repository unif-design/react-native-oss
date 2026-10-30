import { URL } from 'react-native-url-polyfill';
import {
  OSS_BUCKET_PATTERN,
  OSS_CONTROL_CHARACTER_END,
  OSS_CREDENTIAL_MARGIN_MS,
  OSS_DELETE_CHARACTER,
  OSS_HTTP_SCHEME,
  OSS_ORIGIN_PATTERN,
} from './constants';
import { readOssExpiration } from './readOssExpiration';
import type { OssCredential } from './types';

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTarget(bucketName: string, endpoint: string): boolean {
  const origin = OSS_HTTP_SCHEME.test(endpoint)
    ? endpoint
    : `https://${endpoint}`;
  if (
    !OSS_BUCKET_PATTERN.test(bucketName) ||
    !OSS_ORIGIN_PATTERN.test(origin) ||
    Array.from(origin).some(
      (char) =>
        char.charCodeAt(0) <= OSS_CONTROL_CHARACTER_END ||
        char.charCodeAt(0) === OSS_DELETE_CHARACTER,
    )
  )
    return false;
  try {
    const parsed = new URL(origin);
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      return false;
    const target = new URL(`https://${bucketName}.${parsed.host}`);
    return target.hostname === `${bucketName}.${parsed.hostname}`;
  } catch {
    return false;
  }
}

export function readOssCredential(
  value: unknown,
): Readonly<OssCredential> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const data = value as Record<string, unknown>;
    const {
      accessKeyId,
      accessKeySecret,
      securityToken,
      bucketName,
      endpoint,
      rootPath,
      expiration,
      baseUrl,
    } = data;
    if (
      !text(accessKeyId) ||
      !text(accessKeySecret) ||
      !text(securityToken) ||
      !text(bucketName) ||
      !text(endpoint) ||
      typeof rootPath !== 'string' ||
      typeof expiration !== 'string' ||
      !validTarget(bucketName, endpoint)
    )
      return null;
    const expiresAt = readOssExpiration(expiration);
    if (
      expiresAt === null ||
      expiresAt - Date.now() <= OSS_CREDENTIAL_MARGIN_MS
    )
      return null;
    return Object.freeze({
      accessKeyId,
      accessKeySecret,
      securityToken,
      bucketName,
      endpoint,
      rootPath,
      expiration,
      ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
    });
  } catch {
    return null;
  }
}
