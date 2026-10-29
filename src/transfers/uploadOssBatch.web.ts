import { uploadFailure } from '../upload/uploadFailure';
import type { OssBatchItem, OssBatchOptions, OssBatchResult } from './types';

export async function uploadOssBatch(
  items: readonly OssBatchItem[],
  options: OssBatchOptions,
): Promise<OssBatchResult> {
  if (items.length === 0) return { items: [] };
  const cancelled = options.signal?.aborted;
  return {
    items: items.map((item, index) => ({
      index,
      path: item.path,
      result: {
        status: 'not_started',
        reason: cancelled ? 'cancelled' : 'preparation_failed',
      },
    })),
    ...(cancelled
      ? {}
      : { preparationError: uploadFailure('unsupported').error }),
  };
}
