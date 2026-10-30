import { URL } from 'react-native-url-polyfill';
import { OSS_UPLOAD_DEFAULT_MIME, OSS_UPLOAD_MIME_TYPES } from './constants';
import type { OssCredential } from '../types';
import type {
  OssUploadTarget,
  PreparedUploadInput,
  UploadOssFileInput,
} from './types';

function objectPath(value: string): string | null {
  const path = value.replace(/^\/+|\/+$/g, '');
  return path.split('/').some((part) => part === '.' || part === '..')
    ? null
    : path;
}
export function prepareUploadObject(
  input: Omit<UploadOssFileInput, 'fileUri'>,
): Omit<PreparedUploadInput, 'localPath'> | null {
  const { path, maxBytes, mimeType, urlMode } = input;
  if (typeof path !== 'string') return null;
  const relativePath = objectPath(path);
  if (
    !relativePath ||
    (urlMode !== undefined &&
      urlMode !== 'configured' &&
      urlMode !== 'origin') ||
    (maxBytes !== undefined &&
      (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) ||
    (mimeType !== undefined &&
      (typeof mimeType !== 'string' ||
        !mimeType.trim() ||
        /[\r\n]/.test(mimeType)))
  )
    return null;
  const filename = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const extensionIndex = filename.lastIndexOf('.');
  const extension =
    extensionIndex < 0 ? '' : filename.slice(extensionIndex + 1).toLowerCase();
  const inferredMimeType = Object.prototype.hasOwnProperty.call(
    OSS_UPLOAD_MIME_TYPES,
    extension,
  )
    ? OSS_UPLOAD_MIME_TYPES[extension]
    : OSS_UPLOAD_DEFAULT_MIME;
  return {
    path: relativePath,
    ...(urlMode === undefined ? {} : { urlMode }),
    mimeType: mimeType ?? inferredMimeType,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  };
}

export function prepareUploadInput(
  input: UploadOssFileInput,
): PreparedUploadInput | null {
  try {
    const { fileUri } = input;
    if (typeof fileUri !== 'string' || !fileUri.startsWith('file:///'))
      return null;
    const local = new URL(fileUri);
    const localPath = decodeURIComponent(local.pathname);
    const object = prepareUploadObject(input);
    if (
      local.host ||
      local.search ||
      local.hash ||
      localPath === '/' ||
      localPath.includes('\0') ||
      !object
    )
      return null;
    return { ...object, localPath };
  } catch {
    return null;
  }
}
function accessUrl(
  baseUrl: string | undefined,
  uploadUrl: string,
  path: string,
  objectKey: string,
): string | undefined {
  const encode = (value: string) =>
    value
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  if (!baseUrl) return `${uploadUrl}/${encode(objectKey)}`;
  try {
    const base = new URL(baseUrl);
    if (
      !['https:', 'http:'].includes(base.protocol) ||
      !base.hostname ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      return undefined;
    return `${base.href.replace(/\/+$/, '')}/${encode(path)}`;
  } catch {
    return undefined;
  }
}
export function prepareUploadTarget(
  credential: Readonly<OssCredential>,
  input: Omit<PreparedUploadInput, 'localPath'>,
): OssUploadTarget | null {
  const root = objectPath(credential.rootPath);
  if (root === null) return null;
  try {
    const endpoint = new URL(
      /^https?:\/\//i.test(credential.endpoint)
        ? credential.endpoint
        : `https://${credential.endpoint}`,
    );
    const uploadUrl = `https://${credential.bucketName}.${endpoint.host}`;
    const objectKey = root ? `${root}/${input.path}` : input.path;
    const url = accessUrl(
      input.urlMode === 'origin' ? undefined : credential.baseUrl,
      uploadUrl,
      input.path,
      objectKey,
    );
    return {
      uploadUrl,
      object: {
        bucketName: credential.bucketName,
        objectKey,
        ...(url === undefined ? {} : { url }),
      },
    };
  } catch {
    return null;
  }
}
