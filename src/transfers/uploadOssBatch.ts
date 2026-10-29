import { Platform } from 'react-native';
import { uploadOssFile } from '../upload';
import type { OssUploadProgress } from '../upload';
import { prepareUploadAuthorization } from '../upload/prepareUploadAuthorization';
import { uploadFailure } from '../upload/uploadFailure';
import { transferRemoteFileToOss } from './transferRemoteFileToOss';
import type {
  OssBatchItem,
  OssBatchItemResult,
  OssBatchOptions,
  OssBatchResult,
} from './types';

export async function uploadOssBatch(
  items: readonly OssBatchItem[],
  options: OssBatchOptions,
): Promise<OssBatchResult> {
  const snapshot = items.map((item) => ({ ...item }));
  const { signal, onProgress, authorization } = options;
  const results: OssBatchItemResult[] = snapshot.map((item, index) => ({
    index,
    path: item.path,
    result: { status: 'not_started', reason: 'cancelled' },
  }));
  if (snapshot.length === 0 || signal?.aborted) return { items: results };
  const prepared =
    Platform.OS === 'ios' || Platform.OS === 'android'
      ? await prepareUploadAuthorization(authorization, signal)
      : uploadFailure('unsupported');
  if (signal?.aborted || prepared.status === 'cancelled')
    return { items: results };
  if (prepared.status === 'failed')
    return {
      items: results.map((item) => ({
        ...item,
        result: { status: 'not_started', reason: 'preparation_failed' },
      })),
      preparationError: prepared.error,
    };
  for (const [index, item] of snapshot.entries()) {
    if (signal?.aborted) break;
    let active = true;
    const itemOptions = {
      authorization: {
        kind: 'provided' as const,
        credential: prepared.credential,
      },
      signal,
      onProgress: (progress: Readonly<OssUploadProgress>) => {
        if (!active || signal?.aborted) return;
        try {
          onProgress?.({ index, progress: { ...progress } });
        } catch {
          /* Observer failures do not change the item receipt. */
        }
      },
    };
    const input = {
      path: item.path,
      ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
      ...(item.maxBytes === undefined ? {} : { maxBytes: item.maxBytes }),
    };
    try {
      results[index].result =
        item.kind === 'local'
          ? await uploadOssFile(
              { ...input, fileUri: item.fileUri },
              itemOptions,
            )
          : await transferRemoteFileToOss(
              { ...input, sourceUrl: item.sourceUrl },
              {
                ...itemOptions,
                getTransferDirectory: options.getTransferDirectory,
                createId: options.createId,
              },
            );
    } finally {
      active = false;
    }
  }
  return { items: results };
}
