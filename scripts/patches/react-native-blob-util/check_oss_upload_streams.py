"""Execute production Kotlin multipart/stream methods with external platform doubles.

Uses the project's cached Kotlin compiler, not a system installation. This checks
host-side resource/error behavior and is not Android device or OSS evidence.
"""

import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile


def kotlin_classpath() -> str:
    cache = Path(os.environ.get('GRADLE_USER_HOME', Path.home() / '.gradle')) / 'caches/modules-2/files-2.1'
    coordinates = [
        ('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.2.0'),
        ('org.jetbrains.kotlin', 'kotlin-stdlib', '2.2.0'),
        ('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.2.0'),
        ('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
        ('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
        ('org.jetbrains', 'annotations', '13.0'),
    ]
    jars: list[str] = []
    for group, name, version in coordinates:
        files = list((cache / group / name / version).glob('*/*.jar'))
        if len(files) != 1:
            raise SystemExit(f'Expected one cached {name}:{version}; run Android dependency setup first')
        jars.append(str(files[0]))
    return os.pathsep.join(jars)


def extract(source: str, signature: str) -> str:
    match = re.search(r'^    ' + re.escape(signature) + r'.*?^    \}', source, re.M | re.S)
    if match is None:
        raise SystemExit(f'Cannot extract production Kotlin declaration: {signature}')
    return match.group()


HEAD = r'''
import java.io.*

typealias ReactNativeBlobUtilBody = OssBody
typealias FileOutputStream = TrackedOutput
class TrackedOutput(file: File) : java.io.FileOutputStream(file) {
    var closed = false
    init { all.add(this) }
    override fun close() { closed = true; super.close() }
    override fun write(bytes: ByteArray) {
        if (failWrites) throw IOException("synthetic disk write failure")
        super.write(bytes)
    }
    override fun write(bytes: ByteArray, offset: Int, length: Int) {
        if (failWrites) throw IOException("synthetic disk write failure")
        super.write(bytes, offset, length)
    }
    companion object { val all = mutableListOf<TrackedOutput>(); var failWrites = false }
}
fun interface BufferedSink { fun write(bytes: ByteArray, offset: Int, length: Int) }
class ReadableMap(private val values: Map<String, String>) {
    fun hasKey(key: String) = values.containsKey(key)
    fun getString(key: String): String? = values[key]
}
class ReadableArray(private val values: List<ReadableMap>) {
    fun size() = values.size
    fun getMap(index: Int) = values[index]
}
object Base64 { fun decode(value: String, flags: Int): ByteArray = java.util.Base64.getDecoder().decode(value) }
object ReactNativeBlobUtilConst {
    const val FILE_PREFIX = "ReactNativeBlobUtil-file://"
    const val CONTENT_PREFIX = "ReactNativeBlobUtil-content://"
    const val FILE_PREFIX_BUNDLE_ASSET = "bundle-assets://"
}
object ReactNativeBlobUtilUtils {
    fun normalizePath(path: String?): String? = path
    fun isAsset(path: String?) = path?.startsWith("bundle-assets://") == true
    fun emitWarningEvent(message: String?) {}
}
class Assets {
    fun open(name: String): InputStream {
        if (name == "broken") throw IOException("synthetic asset open failure")
        return TrackedInput(if (name == "empty") byteArrayOf() else byteArrayOf(1, 2, 3))
    }
}
class Context(val cacheDir: File) { val assets = Assets() }
object ReactNativeBlobUtilImpl { lateinit var RCTContext: Context }
object ReactNativeBlobUtilContent {
    fun isContent(path: String?) = path?.startsWith("content://") == true
    fun openInput(path: String): InputStream? = when {
        path.endsWith("broken") -> throw IOException("synthetic provider open failure")
        path.endsWith("null") -> null
        path.endsWith("read-failure") -> TrackedInput(byteArrayOf(1), true)
        path.endsWith("empty") -> TrackedInput(byteArrayOf())
        else -> TrackedInput(byteArrayOf(1, 2, 3))
    }
}
class TrackedInput(private val payload: ByteArray, private val failRead: Boolean = false) : InputStream() {
    var closed = false
    private var position = 0
    init { all.add(this) }
    override fun read(): Int {
        if (failRead) throw IOException("synthetic source read failure")
        return if (position < payload.size) payload[position++].toInt() and 255 else -1
    }
    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
        if (failRead) throw IOException("synthetic source read failure")
        if (position == payload.size) return -1
        val count = minOf(length, payload.size - position)
        payload.copyInto(bytes, offset, position, position + count); position += count
        return count
    }
    override fun close() { closed = true }
    companion object { val all = mutableListOf<TrackedInput>() }
}
class OssBody {
    private val mTaskId = "host-test"
    private var form: ReadableArray? = null
    private var bodyCache: File? = null
    private var contentLength = 0L
    private fun emitUploadProgress(written: Long) {}
    fun fileContent(data: String, output: FileOutputStream) = writeFileContent(data, output)
    fun cache(): File = createMultipartBodyCache()
    fun setFields(data: String) { form = fields(data) }
    companion object {
        fun fields(data: String) = ReadableArray(listOf(ReadableMap(mapOf(
            "name" to "file", "filename" to "file", "kind" to "file", "data" to data
        ))))
    }
'''

MAIN = r'''
fun main(args: Array<String>) {
    val root = File(args.single())
    val cache = File(root, "cache").apply { mkdirs() }
    ReactNativeBlobUtilImpl.RCTContext = Context(cache)
    val failures = mutableListOf<String>()
    var cases = 0
    fun case(name: String, test: () -> Unit) {
        cases++
        try { test(); println("PASS $name") }
        catch (failure: Throwable) { failures.add("$name: ${failure.message}"); println("FAIL $name: ${failure.message}") }
        finally { cache.listFiles()!!.forEach { it.delete() } }
    }
    for (target in listOf("sink", "file")) {
        for (mode in listOf("success", "read-failure", "write-failure", "empty")) {
            case("$target stream $mode closes source") {
                val source = TrackedInput(if (mode == "empty") byteArrayOf() else byteArrayOf(1,2,3), mode == "read-failure")
                val bytes = ByteArrayOutputStream()
                val error = runCatching {
                    if (target == "sink") {
                        OssBody().pipeStreamToSink(source, BufferedSink { data, offset, length ->
                            if (mode == "write-failure") throw IOException("synthetic sink failure")
                            bytes.write(data, offset, length)
                        })
                    } else {
                        val file = File(root, "stream-output")
                        TrackedOutput.failWrites = mode == "write-failure"
                        try { TrackedOutput(file).use { OssBody().pipeStreamToFileStream(source, it) } }
                        finally { TrackedOutput.failWrites = false }
                        bytes.write(file.readBytes())
                    }
                }.exceptionOrNull()
                check(source.closed) { "source leaked" }
                if (mode.endsWith("failure")) check(error is IOException) { "failure swallowed: $error" }
                else { check(error == null); check(bytes.size() == if (mode == "empty") 0 else 3) }
            }
        }
    }
    val prefix = ReactNativeBlobUtilConst.FILE_PREFIX
    val contentPrefix = ReactNativeBlobUtilConst.CONTENT_PREFIX
    val missing = "$prefix${File(root, "missing")}"
    val directory = File(root, "directory").apply { mkdirs() }
    val broken = listOf(
        missing,
        "$prefix$directory",
        "${prefix}bundle-assets://broken",
        "${contentPrefix}content://broken",
        "${prefix}content://broken",
        "${contentPrefix}content://null",
        "${contentPrefix}content://read-failure"
    )
    for ((index, data) in broken.withIndex()) {
        case("multipart unreadable source $index throws before upload") {
            val body = OssBody()
            val error = runCatching { body.setBody(OssBody.fields(data)) }.exceptionOrNull()
            check(error is IOException) { "setBody swallowed or failed to wrap source failure: $error" }
            check(cache.listFiles()!!.isEmpty()) { "partial multipart cache survived" }
            check(TrackedOutput.all.all { it.closed }) { "cache output leaked" }
            check(TrackedInput.all.all { it.closed }) { "provider input leaked" }
        }
        case("multipart source $index directly rejects unreadable input") {
            val error = runCatching {
                TrackedOutput(File(root, "direct-output")).use { OssBody().fileContent(data, it) }
            }.exceptionOrNull()
            check(error != null) { "writeFileContent swallowed source failure" }
        }
    }
    case("multipart cache closes and deletes on write failure") {
        val body = OssBody().apply { setFields("${prefix}bundle-assets://normal") }
        TrackedOutput.failWrites = true
        val error = try { runCatching { body.cache() }.exceptionOrNull() }
                    finally { TrackedOutput.failWrites = false }
        check(error is IOException)
        check(cache.listFiles()!!.isEmpty())
        check(TrackedOutput.all.all { it.closed })
        check(TrackedInput.all.all { it.closed })
    }
    val empty = File(root, "empty").apply { writeBytes(byteArrayOf()) }
    for (data in listOf("$prefix$empty", "${prefix}bundle-assets://empty", "${contentPrefix}content://empty")) {
        case("multipart legal zero-byte source $data succeeds") {
            val body = OssBody().apply { setFields(data) }
            val file = body.cache()
            check(file.readText().contains("Content-Disposition:"))
            check(file.readText().endsWith("--ReactNativeBlobUtil-host-test--\r\n"))
            check(file.delete())
            check(TrackedOutput.all.all { it.closed })
            check(TrackedInput.all.all { it.closed })
        }
    }
    val normal = File(root, "normal").apply { writeBytes(byteArrayOf(1, 2, 3)) }
    for (data in listOf("$prefix$normal", "${prefix}bundle-assets://normal", "${contentPrefix}content://normal")) {
        case("multipart ordinary source $data keeps payload") {
            val body = OssBody().apply { setFields(data) }
            val file = body.cache()
            val bytes = file.readBytes()
            check(bytes.toList().windowed(3).any { it == listOf<Byte>(1, 2, 3) }) { "file payload lost" }
            check(bytes.toString(Charsets.UTF_8).endsWith("--ReactNativeBlobUtil-host-test--\r\n"))
            check(file.delete())
            check(TrackedOutput.all.all { it.closed })
            check(TrackedInput.all.all { it.closed })
        }
    }
    check(failures.isEmpty()) { "${failures.size}/$cases native Kotlin cases failed:\n${failures.joinToString("\n")}" }
    println("$cases actual Kotlin multipart/stream cases passed (platform boundaries replaced)")
}
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
    source = (sdk / 'android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilBody.kt').read_text()
    declarations = [
        'fun setBody(body: ReadableArray?)',
        'private fun createMultipartBodyCache()',
        'private fun writeForm(',
        'private fun writeFileContent(',
        'internal fun pipeStreamToSink(',
        'internal fun pipeStreamToFileStream(',
        'private fun formFields()',
        'private class FormField(',
    ]
    host = HEAD + '\n'.join(extract(source, signature) for signature in declarations) + '\n}\n' + MAIN
    classpath = kotlin_classpath()
    with tempfile.TemporaryDirectory(prefix='portal-oss-native-stream-') as folder:
        path = Path(folder)
        script = path / 'OssStreams.kt'
        _ = script.write_text(host)
        _ = subprocess.run(['java', '-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
                        '-no-stdlib', '-no-reflect', '-classpath', classpath, '-d', str(path / 'classes'), str(script)], check=True)
        _ = subprocess.run(['java', '-cp', str(path / 'classes') + os.pathsep + classpath, 'OssStreamsKt', str(path)], check=True)


if __name__ == '__main__':
    main()
