from pathlib import Path
import subprocess, tempfile

repo = Path(__file__).resolve().parents[3]
source = (repo / 'node_modules/react-native-blob-util/android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilBody.java').read_text()

def method(name):
    start = source.index('    private void ' + name + '(')
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

test = '''import java.io.*;
public class OssStreams {
  interface BufferedSink { void write(byte[] value, int offset, int length) throws IOException; }
  void emitUploadProgress(long ignored) {}
  static class Tracked extends ByteArrayInputStream {
    boolean closed;
    Tracked() { super(new byte[] {1,2,3}); }
    public void close() throws IOException { closed = true; super.close(); }
  }
  public static void main(String[] args) throws Exception {
    OssStreams body = new OssStreams();
    Tracked source = new Tracked();
    try { body.pipeStreamToSink(source, (value, offset, length) -> { throw new IOException("synthetic sink failure"); }); }
    catch(IOException expected) {}
    if (!source.closed) throw new AssertionError("request input remains open after sink failure");
    File file = File.createTempFile("oss-stream-test-", ".tmp");
    Tracked multipart = new Tracked();
    try (FileOutputStream target = new FileOutputStream(file) {
      public void write(byte[] bytes, int off, int len) throws IOException { throw new IOException("synthetic disk failure"); }
    }) {
      try { body.pipeStreamToFileStream(multipart, target); } catch(IOException expected) {}
    } finally { file.delete(); }
    if (!multipart.closed) throw new AssertionError("multipart source remains open after write failure");
    Tracked normal = new Tracked();
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    body.pipeStreamToSink(normal, (value, offset, length) -> bytes.write(value, offset, length));
    if (!normal.closed || bytes.size() != 3) throw new AssertionError("normal transfer changed");
    System.out.println("3 native Java stream lifecycle cases passed");
  }
'''
test += method('pipeStreamToSink') + '\n' + method('pipeStreamToFileStream') + '\n}'
with tempfile.TemporaryDirectory(prefix='portal-oss-native-stream-') as path:
    p = Path(path)
    (p / 'OssStreams.java').write_text(test)
    subprocess.run(['javac', str(p/'OssStreams.java')],check=True)
    subprocess.run(['java','-cp',str(p),'OssStreams'],check=True)
