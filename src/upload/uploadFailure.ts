import { OSS_UPLOAD_MESSAGES } from './constants';
import type { OssUploadErrorReason, OssUploadFailed } from './types';

export function uploadFailure(
  reason: OssUploadErrorReason,
  httpStatus?: number,
): OssUploadFailed {
  return {
    status: 'failed',
    error: {
      reason,
      message: OSS_UPLOAD_MESSAGES[reason],
      ...(httpStatus === undefined ? {} : { httpStatus }),
    },
  };
}
