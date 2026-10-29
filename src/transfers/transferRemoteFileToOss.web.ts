import { uploadFailure } from '../upload/uploadFailure';
import type {
  TransferRemoteFileToOssInput,
  OssTransferOptions,
  OssTransferResult,
} from './types';

export async function transferRemoteFileToOss(
  _input: TransferRemoteFileToOssInput,
  options: OssTransferOptions,
): Promise<OssTransferResult> {
  return options.signal?.aborted
    ? { status: 'cancelled' }
    : { ...uploadFailure('unsupported'), stage: 'upload' };
}
