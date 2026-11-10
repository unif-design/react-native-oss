"""Execute production Swift file-read and multipart methods on the macOS host.

Photos, URI resolution and injected failed reads are external boundary doubles;
normal/empty/missing/directory cases use real temporary files. Not device evidence.
"""

import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile


def extract(source: str, signature: str) -> str:
    match = re.search(r'^    ' + re.escape(signature) + r'.*?^    \}', source, re.M | re.S)
    if match is None:
        raise SystemExit(f'Cannot extract production Swift declaration: {signature}')
    return match.group()


HEAD = r'''
import Foundation

final class FixtureFileManager {
    static let `default` = FixtureFileManager()
    var failedPath = ""
    func fileExists(atPath path: String, isDirectory: UnsafeMutablePointer<ObjCBool>?) -> Bool {
        Foundation.FileManager.default.fileExists(atPath: path, isDirectory: isDirectory)
    }
    func contents(atPath path: String) -> Data? {
        if path == failedPath { return nil }
        return Foundation.FileManager.default.contents(atPath: path)
    }
}
typealias FileManager = FixtureFileManager
class PHAsset {}
class PHImageRequestOptions {
    enum Delivery { case highQualityFormat }
    enum Resize { case none }
    var isSynchronous = false
    var deliveryMode = Delivery.highQualityFormat
    var resizeMode = Resize.none
}
class PHImageManager {
    static func `default`() -> PHImageManager { PHImageManager() }
    func requestImageDataAndOrientation(for asset: PHAsset, options: PHImageRequestOptions,
        resultHandler: (Data?, String?, Int, [String: Any]?) -> Void) {
        resultHandler(nil, nil, 0, nil)
    }
}
class ReactNativeBlobUtilFileTransformer {
    static func getFileTransformer() -> ReactNativeBlobUtilFileTransformer? { nil }
}
enum ReactNativeBlobUtilExceptionCatch {
    static func transform(_ content: Data, with transformer: ReactNativeBlobUtilFileTransformer,
                          forWrite: Bool, onComplete: (Data?, String?) -> Void) {
        onComplete(content, nil)
    }
}
enum ReactNativeBlobUtilConst { static let filePrefix = "ReactNativeBlobUtil-file://" }
enum ReactNativeBlobUtilLog { static func warn(_ message: String) {} }
class ReadFileHost {
    static func getPathFromUri(_ path: String, onComplete: (String?, PHAsset?) -> Void) {
        onComplete(path, nil)
    }
'''

MIDDLE = r'''
}
enum ReactNativeBlobUtilFS {
    static func getPathOfAsset(_ path: String) -> String { path }
    static func readFile(_ path: String, encoding: String?, transformFile: Bool,
                         onComplete: @escaping (Any?, String?, String?) -> Void) {
        // A defensive builder check is needed even if an external reader returns
        // no data and no error. Every real path below delegates to production FS.
        if path == "nil-content" { onComplete(nil, nil, nil); return }
        if path == "explicit-error" { onComplete(nil, "EIO", "synthetic failure"); return }
        ReadFileHost.readFile(path, encoding: encoding, transformFile: transformFile, onComplete: onComplete)
    }
}
class FormBuilder {
'''

MAIN = r'''
}
let root = CommandLine.arguments[1]
let manager = Foundation.FileManager.default
let emptyPath = root + "/empty"
let normalPath = root + "/normal"
let failedPath = root + "/failed-read"
let missingPath = root + "/missing"
let directoryPath = root + "/directory"
try Data().write(to: URL(fileURLWithPath: emptyPath))
try Data("payload".utf8).write(to: URL(fileURLWithPath: normalPath))
try Data("retained".utf8).write(to: URL(fileURLWithPath: failedPath))
try manager.createDirectory(atPath: directoryPath, withIntermediateDirectories: false)
FixtureFileManager.default.failedPath = failedPath
var failures: [String] = []
var cases = 0
func checkCase(_ name: String, _ test: () -> String?) {
    cases += 1
    if let failure = test() { failures.append("\(name): \(failure)"); print("FAIL \(name): \(failure)") }
    else { print("PASS \(name)") }
}
for (name, path, expectedError, payload) in [
    ("unreadable existing file", failedPath, "EIO", Data()),
    ("missing file", missingPath, "ENOENT", Data()),
    ("directory", directoryPath, "EISDIR", Data()),
    ("legal zero-byte file", emptyPath, "", Data()),
    ("ordinary payload", normalPath, "", Data("payload".utf8))
] {
    for encoding: String? in [nil, "utf8", "base64"] {
        checkCase("readFile \(name) encoding=\(encoding ?? "nil")") {
            var calls = 0
            var content: Any?
            var code: String?
            var message: String?
            ReadFileHost.readFile(path, encoding: encoding, transformFile: false) { data, errorCode, errorMessage in
                calls += 1; content = data; code = errorCode; message = errorMessage
            }
            if calls != 1 { return "callback count \(calls)" }
            if expectedError.isEmpty {
                if code != nil || message != nil || content as? Data != payload { return "success bytes/error changed" }
            } else if code != expectedError || message == nil || content != nil {
                return "expected \(expectedError), got code=\(code ?? "nil") content=\(String(describing: content))"
            }
            return nil
        }
    }
}
for (name, path, expectedFailure) in [
    ("nil content without error", "nil-content", true),
    ("explicit reader failure", "explicit-error", true),
    ("actual unreadable existing file", failedPath, true),
    ("actual missing file", missingPath, true),
    ("actual directory", directoryPath, true),
    ("legal zero-byte file", emptyPath, false),
    ("ordinary payload", normalPath, false)
] {
    checkCase("buildFormBody \(name)") {
        var calls = 0
        var failed = false
        var content: Data?
        let form: [[String: Any]] = [["name": "file", "filename": "file", "kind": "file",
                                     "data": ReactNativeBlobUtilConst.filePrefix + path],
                                    ["name": "after", "data": "after-payload", "kind": "text"]]
        FormBuilder.buildFormBody(form, boundary: "fixture") { data, failure in
            calls += 1; content = data; failed = failure
        }
        if calls != 1 || failed != expectedFailure { return "callbacks=\(calls) failed=\(failed) expected=\(expectedFailure)" }
        if !expectedFailure {
            guard let content = content, let text = String(data: content, encoding: .utf8),
                  text.contains("filename=\"file\""), text.contains("after-payload") else { return "multipart headers/tail lost" }
            if path == normalPath && !text.contains("\r\n\r\npayload\r\n") { return "file payload lost" }
            if path == emptyPath && !text.contains("Content-Type: application/octet-stream\r\n\r\n\r\n--fixture\r\n") { return "zero-byte file body changed" }
        } else if let content = content, String(data: content, encoding: .utf8)?.contains("after-payload") == true {
            return "continued building form after source failure"
        }
        return nil
    }
}
if !failures.isEmpty {
    print("\(failures.count)/\(cases) actual Swift cases failed:\n\(failures.joined(separator: "\n"))")
    exit(1)
}
print("\(cases) actual Swift readFile/multipart cases passed (platform boundaries replaced)")
'''


class Options(argparse.Namespace):
    def __init__(self, sdk: Path) -> None:
        super().__init__()
        self.sdk: Path = sdk


def main() -> None:
    repo = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    default_sdk = Path(os.environ.get('OSS_SDK_ROOT', os.environ.get('BLOB_SDK_ROOT', repo / 'node_modules/react-native-blob-util')))
    _ = parser.add_argument('--sdk', type=Path, default=default_sdk)
    args = parser.parse_args(namespace=Options(default_sdk))
    sdk = args.sdk
    fs = (sdk / 'ios/ReactNativeBlobUtilFS.swift').read_text()
    builder = (sdk / 'ios/ReactNativeBlobUtilReqBuilder.swift').read_text()
    source = (HEAD + extract(fs, 'public static func readFile(_ path: String,')
              + MIDDLE + extract(builder, 'public static func buildFormBody(') + MAIN)
    with tempfile.TemporaryDirectory(prefix='portal-oss-native-form-') as folder:
        path = Path(folder)
        script = path / 'Form.swift'
        _ = script.write_text(source)
        _ = subprocess.run(['swiftc', '-module-cache-path', str(path / 'module-cache'), str(script), '-o', str(path / 'form')], check=True)
        _ = subprocess.run([str(path / 'form'), str(path)], check=True)


if __name__ == '__main__':
    main()
