import BlobUtil from 'react-native-blob-util';
import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import {
  OSS_UPLOAD_FILE_NAME,
  OSS_UPLOAD_PROGRESS_INTERVAL_MS,
} from './constants';
import { prepareUploadAuthorization } from './prepareUploadAuthorization';
import { createSourceRelease } from './createSourceRelease';
import { createUploadForm } from './createUploadForm';
import { prepareUploadInput, prepareUploadTarget } from './prepareUpload';
import { uploadFailure } from './uploadFailure';
import { readUploadBytes } from './readUploadBytes';
import type { OssUploadRequest } from './requestTypes';
import type {
  OssUploadResult,
  UploadOssFileInput,
  UploadOssFileOptions,
} from './types';

export async function uploadOssFile(
  input: UploadOssFileInput,
  options: UploadOssFileOptions,
): Promise<OssUploadResult> {
  const { signal, onProgress, onSourceReleased, authorization } = options;
  const context = createOperationContext('system');
  const log = createLogger('oss.upload');
  const release = createSourceRelease(onSourceReleased, context);
  let readingMayHaveStarted = false;
  let request: OssUploadRequest | undefined;
  let settled = false;
  const cancel = () => {
    if (!settled) {
      try {
        request?.cancel();
      } catch (error) {
        log.warn('oss.upload.cancel_failed', {
          context,
          phase: 'cleanup',
          outcome: 'failed',
          code: 'oss.upload.cancel_failed',
          fields: { operation: 'cancel', ...getFailureDiagnostics(error) },
        });
        /* Stopping is best effort; native completion remains independent. */
      }
    }
  };
  try {
    if (signal?.aborted) return { status: 'cancelled' };
    const prepared = prepareUploadInput(input);
    if (!prepared) return uploadFailure('invalid_input');
    const authorizationResult = await prepareUploadAuthorization(
      authorization,
      signal,
      context,
    );
    if (authorizationResult.status !== 'success') return authorizationResult;
    if (signal?.aborted) return { status: 'cancelled' };
    const { credential } = authorizationResult;
    const target = prepareUploadTarget(credential, prepared);
    if (!target) return uploadFailure('credential');
    let form;
    try {
      form = createUploadForm(credential, target.object.objectKey, prepared);
    } catch (error) {
      log.warn('oss.upload.failed', {
        context,
        phase: 'signing',
        outcome: 'failed',
        code: 'oss.upload.signing',
        fields: { operation: 'upload', ...getFailureDiagnostics(error) },
      });
      return uploadFailure('signing');
    }
    let transport;
    try {
      form.push({
        name: 'file',
        filename: OSS_UPLOAD_FILE_NAME,
        type: prepared.mimeType,
        data: BlobUtil.wrap(prepared.localPath),
      });
      transport = BlobUtil.config({ followRedirect: false });
    } catch (error) {
      log.warn('oss.upload.failed', {
        context,
        phase: 'native_prepare',
        outcome: 'failed',
        code: 'oss.upload.unsupported',
        fields: { operation: 'upload', ...getFailureDiagnostics(error) },
      });
      return uploadFailure('unsupported');
    }
    if (signal?.aborted) return { status: 'cancelled' };
    readingMayHaveStarted = true;
    try {
      request = transport.fetch(
        'POST',
        target.uploadUrl,
        { 'Content-Type': 'multipart/form-data' },
        form,
      );
      request.onRequestComplete?.(release);
      request.uploadProgress(
        { interval: OSS_UPLOAD_PROGRESS_INTERVAL_MS },
        (rawSent, rawTotal) => {
          const sent = readUploadBytes(rawSent);
          const total = readUploadBytes(rawTotal);
          if (settled || signal?.aborted || sent === undefined) return;
          try {
            onProgress?.({
              sentBytes: sent,
              ...(total !== undefined && total >= sent
                ? { totalBytes: total }
                : {}),
            });
          } catch (error) {
            log.warn('oss.upload.observer_failed', {
              context,
              phase: 'callback',
              outcome: 'failed',
              code: 'oss.upload.observer_failed',
              fields: {
                operation: 'progress',
                ...getFailureDiagnostics(error),
              },
            });
            /* Observer errors cannot rewrite the storage result. */
          }
        },
      );
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      const response = await request;
      const status = response.info().status;
      if (status === 200 || status === 204)
        return { status: 'success', object: target.object };
      if (Number.isInteger(status) && status >= 400 && status <= 599) {
        log.warn('oss.upload.failed', {
          context,
          phase: 'response',
          outcome: 'failed',
          code: 'oss.upload.rejected',
          httpStatus: status,
          fields: { operation: 'upload', reason: 'rejected' },
        });
        return uploadFailure('rejected', status);
      }
      if (signal?.aborted) return { status: 'cancelled' };
      log.warn('oss.upload.failed', {
        context,
        phase: 'response',
        outcome: 'unknown',
        code: 'oss.upload.unconfirmed',
        httpStatus:
          Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : undefined,
        fields: { operation: 'upload', reason: 'unconfirmed' },
      });
      return uploadFailure(
        'unconfirmed',
        Number.isInteger(status) && status >= 100 && status <= 599
          ? status
          : undefined,
      );
    } catch (error) {
      if (!signal?.aborted)
        log.warn('oss.upload.failed', {
          context,
          phase: 'transfer',
          outcome: 'unknown',
          code: 'oss.upload.unconfirmed',
          fields: { operation: 'upload', ...getFailureDiagnostics(error) },
        });
      return signal?.aborted
        ? { status: 'cancelled' }
        : uploadFailure('unconfirmed');
    }
  } finally {
    settled = true;
    signal?.removeEventListener('abort', cancel);
    if (!readingMayHaveStarted) release();
  }
}
