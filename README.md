# @unif/react-native-oss

React Native 的 OSS 临时凭证验证与内存缓存、单文件 PostObject 上传、远程转存和顺序批量上传。支持 iOS / Android；Web 的上传与转存明确返回 `unsupported`，凭证验证和缓存可用。

[文档网站](https://unif-design.github.io/react-native-oss/) · [npm](https://www.npmjs.com/package/@unif/react-native-oss) · [API](docs/api.md) · [原生示例](example/README.md) · [MIT 许可证](LICENSE)

## 安装

```sh
yarn add @unif/react-native-oss @unif/react-native-files @unif/react-native-logger react-native-blob-util@0.25.1
```

React 19.3 / React Native 0.88 是验证基线。宿主同时需要按 [Files 接入文档](https://unif-design.github.io/react-native-files/)安装其原生 peer 依赖及补丁。

**宿主必须准备补丁后的 SDK 并重新构建原生应用。** 补丁由 Portal 唯一维护和应用，本包不携带补丁、不自动修改消费者依赖。`react-native-blob-util@0.25.1` 必须具备独立于 JS 取消的 `onRequestComplete` 原生终态通知；单纯安装本包不能保证该能力。原生 example 与独立消费者也使用宿主提供的同一补丁来源，详见 [原生接线](docs/native-setup.md)。

## 最小用法

```ts
import { uploadOssFile } from '@unif/react-native-oss';

const result = await uploadOssFile(
  { fileUri, path: 'images/photo.jpg', mimeType: 'image/jpeg' },
  {
    authorization: { kind: 'provided', credential: temporarySts },
    signal: controller.signal,
    onProgress: ({ sentBytes, totalBytes }) => updateProgress(sentBytes, totalBytes),
    onSourceReleased: releaseBorrowedFile,
  },
);
```

`temporarySts` 必须包含 `securityToken` 和有效期限。长期密钥、凭证换发服务、身份认证及业务对象路径由宿主管理，不应放入安装包。`onSourceReleased` 表示原生不再读取源文件；Promise 已结束或取消不等于文件可删除。

## 公共 API

- `readOssCredential`：验证、投影并冻结临时凭证。
- `createOssCredentialAccess(request, allowedKeys)`：在授权实例与 key 白名单内复用凭证，身份失效时调用 `dispose()`。
- `uploadOssFile`：上传调用方文件，保留成功、取消、明确拒绝与未确认结果。
- `transferRemoteFileToOss`：宿主注入私有 `transferDirectory` 和唯一 `createId`，先下载再上传，等待原生读取结束后释放临时文件。
- `uploadOssBatch`：同一授权、输入顺序、逐项回执，取消后未开始项保持 `not_started`。

输入、输出与回调类型均从包根导出。完整语义见 [API](docs/api.md)，所有权见 [行为契约](docs/contract.md)。

## 日志与示例

宿主统一安装一次 `@unif/react-native-logger` 运行时并管理身份。本包只记录自身事件。真实原生示例位于 `example/ios` 和 `example/android`，使用公共入口，不适用于 Expo Go。网站、替身测试、编译、设备与真实服务分别验证。

## 开发

```sh
yarn install
yarn typecheck
yarn test
yarn build
yarn website build
```

采用组织 CI、PR 与 OIDC 发布流程，见 [研发说明](docs/DEVELOPMENT.md)。
