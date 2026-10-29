import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import { readOssCredential } from '../readOssCredential';
import { uploadFailure } from './uploadFailure';
import type { OssCredentialResult } from '../types';
import type { OssAuthorization, OssUploadFailed } from './types';

export async function prepareUploadAuthorization(
  authorization: OssAuthorization,
  signal?: AbortSignal,
  context = createOperationContext('system'),
): Promise<
  | Extract<OssCredentialResult, { status: 'success' | 'cancelled' }>
  | OssUploadFailed
> {
  if (signal?.aborted) return { status: 'cancelled' };
  try {
    let credential;
    if (authorization.kind === 'provided') {
      credential = readOssCredential(authorization.credential);
    } else if (authorization.kind === 'managed') {
      const { access, ossKey } = authorization;
      const result = await access.get(ossKey, { signal });
      if (signal?.aborted || result.status === 'cancelled')
        return { status: 'cancelled' };
      credential =
        result.status === 'success'
          ? readOssCredential(result.credential)
          : null;
    }
    if (signal?.aborted) return { status: 'cancelled' };
    return credential
      ? { status: 'success', credential }
      : uploadFailure('credential');
  } catch (error) {
    if (!signal?.aborted)
      createLogger('oss.upload').warn('oss.upload.authorization_failed', {
        context,
        phase: 'credential',
        outcome: 'failed',
        code: 'oss.upload.credential',
        fields: { operation: 'authorize', ...getFailureDiagnostics(error) },
      });
    return signal?.aborted
      ? { status: 'cancelled' }
      : uploadFailure('credential');
  }
}
