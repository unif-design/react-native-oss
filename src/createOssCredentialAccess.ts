import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import { OSS_CREDENTIAL_MARGIN_MS } from './constants';
import { credentialFailure } from './credentialFailure';
import { readOssCredential } from './readOssCredential';
import { readOssExpiration } from './readOssExpiration';
import type {
  OssCredential,
  OssCredentialAccess,
  OssCredentialRequest,
  OssKey,
} from './types';

export function createOssCredentialAccess(
  requestCredential: OssCredentialRequest,
  allowedKeys: readonly OssKey[],
): OssCredentialAccess {
  const keys = [...allowedKeys];
  const cache = new Map<OssKey, Readonly<OssCredential>>();
  let disposed = false;
  return {
    async get(key, options) {
      if (disposed || !keys.includes(key)) return credentialFailure('access');
      const signal = options?.signal;
      if (signal?.aborted) return { status: 'cancelled' };
      const cached = cache.get(key);
      if (
        cached &&
        (readOssExpiration(cached.expiration) ?? 0) - Date.now() >
          OSS_CREDENTIAL_MARGIN_MS
      )
        return { status: 'success', credential: cached };
      cache.delete(key);
      const context = createOperationContext('system');
      try {
        const result = await requestCredential(
          key,
          signal ? { signal } : undefined,
        );
        if (disposed) return credentialFailure('access');
        if (signal?.aborted) return { status: 'cancelled' };
        if (result.status !== 'success') return result;
        const credential = readOssCredential(result.credential);
        if (!credential) {
          createLogger('oss.credentials').warn('credential.invalid', {
            context,
            phase: 'validate',
            outcome: 'failed',
            code: 'oss.credentials.invalid_credential',
            fields: {
              operation: 'read_credential',
              reason: 'invalid_credential',
            },
          });
          return credentialFailure('invalid_credential');
        }
        cache.set(key, credential);
        return { status: 'success', credential };
      } catch (error) {
        if (disposed) return credentialFailure('access');
        if (!signal?.aborted)
          createLogger('oss.credentials').warn('credential.request_failed', {
            context,
            phase: 'credential',
            outcome: 'failed',
            code: 'oss.credentials.unavailable',
            fields: { operation: 'request', ...getFailureDiagnostics(error) },
          });
        return signal?.aborted
          ? { status: 'cancelled' }
          : credentialFailure('unavailable');
      }
    },
    dispose() {
      disposed = true;
      cache.clear();
    },
  };
}
