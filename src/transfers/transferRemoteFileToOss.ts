import { URL } from 'react-native-url-polyfill';
import { downloadLocalFile, deleteLocalFile } from '@unif/react-native-files';
import { createLogger } from '@unif/react-native-logger';
import { uploadOssFile } from '../upload';
import {
  prepareUploadObject,
  prepareUploadTarget,
} from '../upload/prepareUpload';
import { prepareUploadAuthorization } from '../upload/prepareUploadAuthorization';
import { uploadFailure } from '../upload/uploadFailure';
import { OSS_TRANSFER_DOWNLOAD_MESSAGE } from './constants';
import type {
  OssTransferDownloadFailed,
  OssTransferResult,
  TransferRemoteFileToOssInput,
  OssTransferOptions,
} from './types';

function validSource(value: string): boolean {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !/^https?:\/\//i.test(value)
  )
    return false;
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !!parsed.hostname;
  } catch {
    return false;
  }
}
function downloadFailed(httpStatus?: number): OssTransferDownloadFailed {
  return {
    status: 'failed',
    stage: 'download',
    error: {
      message: OSS_TRANSFER_DOWNLOAD_MESSAGE,
      ...(Number.isInteger(httpStatus) &&
      httpStatus! >= 100 &&
      httpStatus! <= 599
        ? { httpStatus }
        : {}),
    },
  };
}
export async function transferRemoteFileToOss(
  input: TransferRemoteFileToOssInput,
  options: OssTransferOptions,
): Promise<OssTransferResult> {
  const { signal, onProgress, authorization, createId } = options;
  if (signal?.aborted) return { status: 'cancelled' };
  const { sourceUrl, path, mimeType, maxBytes, urlMode } = input;
  const objectInput = {
    path,
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
    ...(urlMode === undefined ? {} : { urlMode }),
  };
  const prepared = prepareUploadObject(objectInput);
  if (!validSource(sourceUrl) || !prepared)
    return { ...uploadFailure('invalid_input'), stage: 'upload' };
  const root = options.getTransferDirectory();
  if (!root) return { ...uploadFailure('unsupported'), stage: 'upload' };
  const authorizationResult = await prepareUploadAuthorization(
    authorization,
    signal,
  );
  if (authorizationResult.status === 'cancelled') return authorizationResult;
  if (authorizationResult.status === 'failed')
    return { ...authorizationResult, stage: 'upload' };
  if (signal?.aborted) return { status: 'cancelled' };
  const { credential } = authorizationResult;
  if (!prepareUploadTarget(credential, prepared))
    return { ...uploadFailure('credential'), stage: 'upload' };
  let downloaded;
  try {
    downloaded = await downloadLocalFile(
      { sourceUrl, targetUri: `${root}/${createId()}` },
      { signal },
    );
  } catch {
    return signal?.aborted ? { status: 'cancelled' } : downloadFailed();
  }
  if (downloaded.status === 'cancelled') return downloaded;
  if (downloaded.status === 'failed')
    return downloadFailed(
      'statusCode' in downloaded.error
        ? downloaded.error.statusCode
        : undefined,
    );
  const { uri } = downloaded;
  let released = false;
  async function release() {
    if (released) return;
    released = true;
    try {
      const result = await deleteLocalFile(uri);
      if (result.status === 'success') return;
    } catch {
      /* Cleanup failures never replace the transfer receipt. */
    }
    createLogger('oss.transfers').warn('oss.transfer.cleanup_failed', {
      phase: 'cleanup',
      outcome: 'failed',
      code: 'oss.transfer_cleanup_failed',
    });
  }
  if (signal?.aborted || downloaded.statusCode !== 200) {
    const result = signal?.aborted
      ? { status: 'cancelled' as const }
      : downloadFailed(downloaded.statusCode);
    await release();
    return result;
  }
  try {
    const result = await uploadOssFile(
      { ...objectInput, fileUri: uri },
      {
        authorization: { kind: 'provided', credential },
        signal,
        onProgress,
        onSourceReleased: release,
      },
    );
    return result.status === 'failed' ? { ...result, stage: 'upload' } : result;
  } catch {
    // A rejected JS call is not evidence that native has stopped reading.
    return { ...uploadFailure('unconfirmed'), stage: 'upload' };
  }
}
