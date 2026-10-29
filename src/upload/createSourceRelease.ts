import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import type { UploadOssFileOptions } from './types';

export function createSourceRelease(
  callback: UploadOssFileOptions['onSourceReleased'],
  context = createOperationContext('system'),
): () => void {
  let released = false;
  const log = createLogger('oss.upload');
  function failed(error: unknown) {
    log.warn('oss.upload.source_release_failed', {
      context,
      phase: 'cleanup',
      outcome: 'failed',
      code: 'oss.source_release_failed',
      fields: { operation: 'release', ...getFailureDiagnostics(error) },
    });
  }
  return () => {
    if (released) return;
    released = true;
    try {
      Promise.resolve(callback?.()).catch(failed);
    } catch (error) {
      failed(error);
    }
  };
}
