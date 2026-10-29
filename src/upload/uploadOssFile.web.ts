import { createSourceRelease } from './createSourceRelease';
import { uploadFailure } from './uploadFailure';
import type {
  OssUploadResult,
  UploadOssFileInput,
  UploadOssFileOptions,
} from './types';

export async function uploadOssFile(
  _input: UploadOssFileInput,
  options: UploadOssFileOptions,
): Promise<OssUploadResult> {
  createSourceRelease(options.onSourceReleased)();
  return options.signal?.aborted
    ? { status: 'cancelled' }
    : uploadFailure('unsupported');
}
