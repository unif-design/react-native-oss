import { OSS_CREDENTIAL_MESSAGES } from './constants';
import type { OssCredentialErrorReason, OssCredentialFailed } from './types';

export function credentialFailure(
  reason: OssCredentialErrorReason,
  businessCode?: number,
): OssCredentialFailed {
  return {
    status: 'failed',
    error: {
      reason,
      message: OSS_CREDENTIAL_MESSAGES[reason],
      ...(businessCode === undefined ? {} : { businessCode }),
    },
  };
}
