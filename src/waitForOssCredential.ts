import type { OssCredentialResult } from './types';

/** 结束本地等待并通知上游取消；不表示上游操作或资源使用已经结束。 */
export function waitForOssCredential(
  request: (signal: AbortSignal) => Promise<OssCredentialResult>,
  signals: readonly (AbortSignal | undefined)[],
): Promise<OssCredentialResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    function finish() {
      if (settled) return false;
      settled = true;
      for (const signal of signals)
        signal?.removeEventListener('abort', cancel);
      return true;
    }
    function cancel() {
      if (!finish()) return;
      resolve({ status: 'cancelled' });
      controller.abort();
    }
    for (const signal of signals)
      signal?.addEventListener('abort', cancel, { once: true });
    if (signals.some((signal) => signal?.aborted)) {
      cancel();
      return;
    }
    try {
      request(controller.signal).then(
        (value) => {
          if (finish()) resolve(value);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    } catch (error) {
      if (finish()) reject(error);
    }
  });
}
