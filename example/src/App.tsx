import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { randomUUID } from 'react-native-quick-crypto';
import { getNativeTemporaryRoot } from '@unif/react-native-files';
import {
  readOssCredential,
  transferRemoteFileToOss,
  uploadOssBatch,
  uploadOssFile,
} from '@unif/react-native-oss';

export default function App() {
  const [sts, setSts] = useState('');
  const [fileUri, setFileUri] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [path, setPath] = useState('example/file.txt');
  const [output, setOutput] = useState('填入临时 STS 与文件来源后执行。');
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(false);
  const [progress, setProgress] = useState('');
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  async function run(mode: 'local' | 'remote' | 'batch') {
    if (active.current) return;
    let credential;
    try {
      credential = readOssCredential(JSON.parse(sts));
    } catch {
      credential = null;
    }
    if (!credential) {
      setOutput('临时 STS 无效或有效期不足 30 秒。');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setReleased(false);
    setProgress('');
    try {
      const root = getNativeTemporaryRoot();
      const options = {
        authorization: { kind: 'provided' as const, credential },
        signal: controller.signal,
        transferDirectory: root ? `${root}/OssExampleTransfers` : undefined,
        createId: randomUUID,
      };
      const onProgress = ({
        sentBytes,
        totalBytes,
      }: {
        sentBytes: number;
        totalBytes?: number;
      }) => {
        if (mounted.current)
          setProgress(`${sentBytes} / ${totalBytes ?? '?'} 字节`);
      };
      const result =
        mode === 'local'
          ? await uploadOssFile(
              { fileUri, path },
              {
                ...options,
                onProgress,
                onSourceReleased: () => {
                  if (mounted.current) setReleased(true);
                },
              },
            )
          : mode === 'remote'
            ? await transferRemoteFileToOss(
                { sourceUrl, path },
                { ...options, onProgress },
              )
            : await uploadOssBatch(
                [
                  { kind: 'local', fileUri, path: `${path}.local` },
                  { kind: 'remote', sourceUrl, path: `${path}.remote` },
                ],
                {
                  ...options,
                  onProgress: (event) => onProgress(event.progress),
                },
              );
      if (mounted.current) setOutput(JSON.stringify(result, null, 2));
    } catch {
      if (mounted.current) setOutput('示例宿主调用失败，请检查原生接线。');
    } finally {
      active.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>OSS 原生验证</Text>
      <Text>
        临时凭证仅保存在页面内存，不写入日志或本地存储。本地源文件由提供者保留。
      </Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="临时 STS JSON"
        placeholder="临时 STS JSON"
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        value={sts}
        onChangeText={setSts}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        accessibilityLabel="本地文件 URI"
        placeholder="file:/// 应用内文件"
        autoCapitalize="none"
        value={fileUri}
        onChangeText={setFileUri}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        accessibilityLabel="远程文件 URL"
        placeholder="https:// 远程文件"
        autoCapitalize="none"
        value={sourceUrl}
        onChangeText={setSourceUrl}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        accessibilityLabel="对象路径"
        value={path}
        onChangeText={setPath}
        editable={!busy}
      />
      <View style={styles.actions}>
        <Button
          title="上传本地文件"
          disabled={busy}
          onPress={() => run('local')}
        />
        <Button
          title="远程转存"
          disabled={busy}
          onPress={() => run('remote')}
        />
        <Button title="顺序批量" disabled={busy} onPress={() => run('batch')} />
        <Button
          title="取消"
          disabled={!busy}
          onPress={() => active.current?.abort()}
        />
      </View>
      <Text accessibilityLiveRegion="polite">{progress}</Text>
      <Text>本地单文件原生读取已结束：{released ? '是' : '未收到通知'}</Text>
      <Text selectable accessibilityLiveRegion="polite">
        {output}
      </Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 26, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#777',
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
  },
  actions: { gap: 12 },
});
