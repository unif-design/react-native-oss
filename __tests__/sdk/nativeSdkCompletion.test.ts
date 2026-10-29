import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from '@babel/core';

// Exercise installed fetch/lazy-lookup logic with native, ID and response fixtures.
function loadFetch(nativeAvailable = true) {
  const callbacks = new Map<string, (...values: unknown[]) => void>();
  const subscriptions = new Set<object>();
  let nextId = 0;
  const native = {
    fetchBlobForm: jest.fn(
      (_options, id, _method, _url, _headers, _body, callback) => {
        callbacks.set(id, callback);
      },
    ),
    cancelRequest: jest.fn((_id, callback) => callback()),
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
      TurboModuleRegistry: { get: () => (nativeAvailable ? native : null) },
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
  const modules = new Map<string, { exports: any }>();
  function loadSdkModule(source: string): any {
    const cached = modules.get(source);
    if (cached) return cached.exports;
    const resolveFromSource = createRequire(source);
    const code = transformSync(readFileSync(source, 'utf8'), {
      filename: source,
      babelrc: false,
      configFile: false,
      compact: false,
      presets: [require.resolve('@react-native/babel-preset')],
    })!.code!;
    const module = { exports: {} as any };
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
  const sdk = loadSdkModule(require.resolve('react-native-blob-util/fetch'));
  function request() {
    return sdk
      .config({ followRedirect: false })
      .fetch('POST', 'https://fixture.invalid', {}, [
        { name: 'file', filename: 'fixture.txt', data: 'synthetic' },
      ]);
  }
  return {
    request,
    callbacks,
    native,
    subscriptions,
    setNativeAvailable(available: boolean) {
      nativeAvailable = available;
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
    task.cancel();
    expect(await outcome).toBe('canceled');
    expect(native.cancelRequest).toHaveBeenCalledTimes(1);
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
    expect(result.response.status).toBe(204);
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
    expect((await task).response.status).toBe(200);
    await Promise.resolve();
  });
});
