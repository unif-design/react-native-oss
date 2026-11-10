import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from '@babel/core';

// Exercise installed fetch/lazy-lookup logic with native, ID and response fixtures.
function loadFetch(nativeAvailable = true) {
  let nativeReady = nativeAvailable;
  const callbacks = new Map<string, (...values: unknown[]) => void>();
  const subscriptions = new Set<object>();
  let nextId = 0;
  const native = {
    fetchBlobForm: jest.fn(
      (_options, id, _method, _url, _headers, _body, callback) => {
        callbacks.set(id, callback);
      },
    ),
    cancelRequest: jest.fn((_id: string) => Promise.resolve()),
  };
  const imports: Record<string, unknown> = {
    './types': {},
    './utils/uri': { isFileURI: () => false },
    './fs': {},
    './utils/uuid': () => `request-${++nextId}`,
    './class/ReactNativeBlobUtilBlobResponse': {
      FetchBlobResponse: class {
        constructor(
          readonly taskId: string,
          readonly response: unknown,
        ) {}
      },
    },
    './class/ReactNativeBlobUtilCanceledFetchError': class extends Error {},
    'react-native': {
      TurboModuleRegistry: { get: () => (nativeReady ? native : null) },
      NativeEventEmitter: class {
        addListener(event: string) {
          const subscription: { remove(): boolean } = {
            remove: jest.fn(() => subscriptions.delete(subscription)),
          };
          // The SDK owns one process-wide diagnostic listener, independently of tasks.
          if (event !== 'ReactNativeBlobUtilMessage') {
            subscriptions.add(subscription);
          }
          return subscription;
        }
      },
    },
  };
  const modules = new Map<string, { exports: unknown }>();
  function loadSdkModule(source: string): unknown {
    const cached = modules.get(source);
    if (cached) {
      return cached.exports;
    }
    const resolveFromSource = createRequire(source);
    const code = transformSync(readFileSync(source, 'utf8'), {
      filename: source,
      babelrc: false,
      configFile: false,
      compact: false,
      presets: [require.resolve('@react-native/babel-preset')],
    })!.code!;
    const module: { exports: unknown } = { exports: {} };
    modules.set(source, module);
    runInNewContext(code, {
      module,
      exports: module.exports,
      Promise,
      Blob: class {},
      console,
      require: (name: string) => {
        if (Object.prototype.hasOwnProperty.call(imports, name)) {
          return imports[name];
        }
        return name.startsWith('.')
          ? loadSdkModule(resolveFromSource.resolve(name))
          : require(name);
      },
    });
    return module.exports;
  }
  const sdk = loadSdkModule(
    process.env.OSS_SDK_ROOT
      ? join(process.env.OSS_SDK_ROOT, 'fetch.js')
      : require.resolve('react-native-blob-util/fetch'),
  );
  function request(headers: Record<string, unknown> = {}) {
    if (!isRecord(sdk) || typeof sdk.config !== 'function') {
      throw new Error('实际SDK没有导出config');
    }
    const configured: unknown = sdk.config({ followRedirect: false });
    if (!isFetchConfiguration(configured)) {
      throw new Error('实际SDK config未提供fetch');
    }
    const task = configured.fetch('POST', 'https://fixture.invalid', headers, [
      { name: 'file', filename: 'fixture.txt', data: 'synthetic' },
    ]);
    if (!isNativeTask(task)) {
      throw new Error('实际SDK未交付原生请求生命周期');
    }
    return task;
  }
  return {
    request,
    callbacks,
    native,
    subscriptions,
    setNativeAvailable(available: boolean) {
      nativeReady = available;
    },
  };
}

describe('blob-util native request completion handoff', () => {
  it('releases an undispatched request when the native module is unavailable', async () => {
    const { request, native, subscriptions } = loadFetch(false);
    const task = request();
    const outcome = task.catch((error: Error) => error.message);
    const released = jest.fn();
    task.onRequestComplete(released);
    expect(() => task.uploadProgress(jest.fn())).not.toThrow();
    expect(() => task.progress(jest.fn())).not.toThrow();
    await expect(outcome).resolves.toContain('native module is not available');
    expect(released).toHaveBeenCalledTimes(1);
    expect(native.fetchBlobForm).not.toHaveBeenCalled();
    expect(subscriptions.size).toBe(0);
    expect(() => task.cancel()).not.toThrow();
    expect(native.cancelRequest).not.toHaveBeenCalled();
  });

  it('retries native lookup for a later request after an undispatched failure', async () => {
    const { request, callbacks, setNativeAvailable } = loadFetch(false);
    const first = request();
    await expect(first).rejects.toThrow('native module is not available');
    const firstRelease = jest.fn();
    first.onRequestComplete(firstRelease);
    setNativeAvailable(true);
    const second = request();
    const secondRelease = jest.fn();
    second.onRequestComplete(secondRelease);
    await Promise.resolve();
    expect(firstRelease).toHaveBeenCalledTimes(1);
    expect(secondRelease).not.toHaveBeenCalled();
    callbacks.get(second.taskId)!(null, 'utf8', '', { status: 200 });
    await second;
    expect(secondRelease).toHaveBeenCalledTimes(1);
  });

  it('releases every task listener on native completion', async () => {
    const { request, callbacks, subscriptions } = loadFetch();
    const baseline = subscriptions.size;
    const task = request();
    expect(subscriptions.size).toBeGreaterThan(baseline);
    callbacks.get(task.taskId)!(null, 'utf8', '', { status: 200 });
    await task;
    expect(subscriptions.size).toBe(baseline);
  });

  it('does not equate JS cancellation with native completion', async () => {
    const { request, callbacks, native } = loadFetch();
    const task = request();
    const released = jest.fn();
    expect(task.onRequestComplete).toEqual(expect.any(Function));
    expect(task.onRequestComplete(released)).toBe(task);
    const outcome = task.catch((error: Error) => error.message);
    await task.cancel();
    expect(await outcome).toBe('canceled');
    expect(native.cancelRequest).toHaveBeenCalledTimes(1);
    expect(released).not.toHaveBeenCalled();
    callbacks.get(task.taskId)!('task cancelled');
    await Promise.resolve();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('releases a request rejected by header validation without native dispatch', async () => {
    const { request, native, subscriptions } = loadFetch();
    const task = request({ invalid: 42 });
    const released = jest.fn();
    task.onRequestComplete(released);
    await expect(task).rejects.toMatchObject({ code: 'EINVAL' });
    expect(released).toHaveBeenCalledTimes(1);
    expect(native.fetchBlobForm).not.toHaveBeenCalled();
    expect(subscriptions.size).toBe(0);
  });

  it('releases listeners and source if native dispatch throws synchronously', async () => {
    const { request, native, subscriptions } = loadFetch();
    native.fetchBlobForm.mockImplementation(() => {
      throw new Error('bridge dispatch failed');
    });
    const task = request();
    const released = jest.fn();
    task.onRequestComplete(released);
    await expect(task).rejects.toThrow('bridge dispatch failed');
    expect(released).toHaveBeenCalledTimes(1);
    expect(subscriptions.size).toBe(0);
  });

  it('keeps the source until native completion when cancellation rejects', async () => {
    const { request, callbacks, native } = loadFetch();
    native.cancelRequest.mockRejectedValue(new Error('cancel failed'));
    const task = request();
    const outcome = task.catch((error: Error) => error.message);
    const released = jest.fn();
    task.onRequestComplete(released);
    await expect(task.cancel()).rejects.toThrow('cancel failed');
    expect(await outcome).toBe('canceled');
    expect(released).not.toHaveBeenCalled();
    callbacks.get(task.taskId)!('task cancelled');
    await Promise.resolve();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('notifies completion once and preserves a successful response', async () => {
    const { request, callbacks } = loadFetch();
    const task = request();
    const released = jest.fn();
    expect(task.onRequestComplete).toEqual(expect.any(Function));
    task.onRequestComplete(released);
    callbacks.get(task.taskId)!(null, 'utf8', '', { status: 204 });
    const result = await task;
    expect(result).toMatchObject({ response: { status: 204 } });
    task.cancel();
    callbacks.get(task.taskId)!(null, 'utf8', '', { status: 204 });
    await Promise.resolve();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('supports registering after the native request has completed', async () => {
    const { request, callbacks } = loadFetch();
    const task = request();
    callbacks.get(task.taskId)!(null, 'utf8', '', { status: 200 });
    await task;
    const released = jest.fn();
    expect(task.onRequestComplete).toEqual(expect.any(Function));
    task.onRequestComplete(released);
    await Promise.resolve();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('keeps simultaneous native requests independent', async () => {
    const { request, callbacks } = loadFetch();
    const first = request();
    const second = request();
    const releaseA = jest.fn();
    const releaseB = jest.fn();
    expect(first.onRequestComplete).toEqual(expect.any(Function));
    first.onRequestComplete(releaseA);
    second.onRequestComplete(releaseB);
    callbacks.get(first.taskId)!(null, 'utf8', '', { status: 200 });
    await first;
    expect(releaseA).toHaveBeenCalledTimes(1);
    expect(releaseB).not.toHaveBeenCalled();
    callbacks.get(second.taskId)!(null, 'utf8', '', { status: 200 });
    await second;
    expect(releaseB).toHaveBeenCalledTimes(1);
  });

  it('does not replace the HTTP result when an observer rejects', async () => {
    const { request, callbacks } = loadFetch();
    const task = request();
    expect(task.onRequestComplete).toEqual(expect.any(Function));
    task.onRequestComplete(() => Promise.reject(new Error('observer')));
    callbacks.get(task.taskId)!(null, 'utf8', '', { status: 200 });
    expect(await task).toMatchObject({ response: { status: 200 } });
    await Promise.resolve();
  });
});

function isFetchConfiguration(
  value: unknown,
): value is { fetch(...args: unknown[]): unknown } {
  return isRecord(value) && typeof value.fetch === 'function';
}

interface NativeTask extends Promise<unknown> {
  taskId: string;
  onRequestComplete(listener: () => unknown): NativeTask;
  uploadProgress(listener: (...args: unknown[]) => void): NativeTask;
  progress(listener: (...args: unknown[]) => void): NativeTask;
  cancel(): Promise<void>;
}
function isNativeTask(value: unknown): value is NativeTask {
  return (
    value instanceof Promise &&
    isRecord(value) &&
    typeof value.taskId === 'string' &&
    typeof value.onRequestComplete === 'function' &&
    typeof value.uploadProgress === 'function' &&
    typeof value.progress === 'function' &&
    typeof value.cancel === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
