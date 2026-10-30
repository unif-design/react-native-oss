# @unif/react-native-oss

React Native OSS 工具库，提供临时凭证校验与缓存、单文件上传、远程转存和顺序批量上传。

[文档站](https://unif-design.github.io/react-native-oss/) · [API](docs/api.md) · [原生示例](example/README.md) · [npm](https://www.npmjs.com/package/@unif/react-native-oss) · [MIT 许可证](LICENSE)

## 接入要求

iOS／Android 使用原生传输能力。Web 可校验和缓存凭证，上传与转存返回 `unsupported`；原生示例不支持 Expo Go。

| 依赖                   | 支持要求                | 本仓开发组合 |
| ---------------------- | ----------------------- | ------------ |
| React                  | `^19.3.0`               | 19.3.1       |
| React Native           | `>=0.88.0`              | 0.88.1       |
| Files                  | `^0.1.0`                | 0.1.0        |
| Logger                 | `^0.1.3`                | 0.1.3        |
| react-native-blob-util | 精确 0.25.1，需宿主补丁 | 0.25.1       |

BlobUtil 必须具备 `onRequestComplete` 原生结束通知。补丁由 Portal 宿主维护，本包不附带或自动应用；Files 所需的原生依赖与补丁也需按[接入文档](docs/native-setup.md)准备。开发组合不代表全部版本组合已通过设备或真实 OSS 验证。

## 安装

1. 安装本库及 peer 依赖：

   ```sh
   npm install @unif/react-native-oss @unif/react-native-files@^0.1.0 \
     @unif/react-native-logger@^0.1.3 react-native-blob-util@0.25.1
   ```

2. 按[原生接线](docs/native-setup.md)配置补丁后的 SDK，核对应用实际解析的副本，同步 iOS Pods 并重新构建。
3. 应用统一初始化 Logger，并从服务端取得短期 STS。长期 AccessKey、凭证换发与身份认证由宿主管理，不放入客户端安装包。

## 上传一个文件

下面的片段使用宿主提供的本地 `fileUri`、临时凭证 `temporarySts`，以及释放文件持有的函数 `releaseBorrowedFile`：

```ts
import { uploadOssFile } from '@unif/react-native-oss';

const result = await uploadOssFile(
  { fileUri, path: 'images/photo.jpg', mimeType: 'image/jpeg' },
  {
    authorization: { kind: 'provided', credential: temporarySts },
    onSourceReleased: releaseBorrowedFile,
  },
);
```

按 `result.status` 处理 `success`、`cancelled` 或 `failed`；未确认的网络结果不能当成明确失败或成功。进度、取消和返回 URL 的配置见[上传 API](docs/api.md#单文件上传)。

**收到 `onSourceReleased` 后才可释放源文件。** Promise 结束或取消不等于原生读取已停止；库不会删除调用方的本地源文件。使用凭证缓存时，身份结束需调用其 `dispose()`，详见[凭证访问](docs/api.md#临时凭证)。

## 更多用法

- [远程转存](docs/api.md#远程转存)、[顺序批量](docs/api.md#顺序批量)：参数、逐项回执和临时文件清理。
- [行为与所有权](docs/contract.md)：授权范围、取消、文件持有和身份失效。
- [原生示例](example/README.md)：准备临时凭证并验证真实上传。
- [研发说明](docs/DEVELOPMENT.md)与[贡献指南](CONTRIBUTING.md)：检查、消费者验证和交付。
