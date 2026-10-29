---
title: API
description: 临时凭证、单文件上传、转存与顺序批量的公开接口。
---

# API

全部接口从 `@unif/react-native-oss` 导入，类型以源码生成的声明为准。

## 临时凭证

`OssCredential` 包含 `accessKeyId`、`accessKeySecret`、`securityToken`、`bucketName`、`endpoint`、`rootPath`、`expiration`，可选 `baseUrl`。不得使用长期 AccessKey 替代临时 STS。

`readOssCredential(value: unknown): Readonly<OssCredential> | null` 校验签名字段、目标和带明确时区的合法 ISO 时间。剩余有效期必须大于 30 秒。只投影已知字段并冻结，`rootPath` 必须提供但可为空；`baseUrl` 无效不使可签名凭证失败。

```ts
const access = createOssCredentialAccess(requestCredential, ['public-media', 'private-media']);
const result = await access.get('private-media', { signal });
access.dispose(); // 退出或身份变化时同步失效此授权实例
```

`requestCredential` 接收 key 与可选 `{ signal }`，返回 `OssCredentialResult`。白名单在创建时复制，未知 key 返回 `access`，不调用请求。缓存仅属于当前实例，不持久化、不合并冷请求、不自动重试。释放后拒绝后续和迟到结果。

凭证结果为 `success`（只读 credential）、`cancelled` 或 `failed`（`error.reason/message`，可选 `businessCode`）。失败 reason 为 `access`、`rejected`、`invalid_response`、`invalid_credential`、`unavailable`；宿主的换发适配负责转换后端响应。

`createOssCredentialFailure(reason, businessCode?)` 供宿主换发适配构造相同的受控失败结果，复用固定错误文案。reason 使用 `OssCredentialErrorReason`；业务码须先由宿主响应校验确认。后端原始错误正文不作为该接口输入。

## 单文件上传

`uploadOssFile(input, options): Promise<OssUploadResult>`

| 参数 | 契约 |
| --- | --- |
| `input.fileUri` | 调用方拥有的本地文件 `file:///` URI |
| `input.path` | 相对对象路径，拒绝 `.` / `..` 段 |
| `input.mimeType` | 可选，按扩展名推断或使用 `application/octet-stream` |
| `input.maxBytes` | 可选非负安全整数，仅写入上传 policy 的长度条件 |
| `input.urlMode` | 可选 `configured` / `origin`，默认采用有效 `baseUrl` |
| `options.authorization` | `{ kind: 'provided', credential }` 或 `{ kind: 'managed', access, ossKey }` |
| `options.signal` | 可选取消信号 |
| `options.onProgress` | `{ sentBytes, totalBytes? }`，异常不改变回执 |
| `options.onSourceReleased` | 原生停止读取后最多调用一次，允许异步收尾 |

只有 HTTP 200 / 204 返回 `success` 与 `{ bucketName, objectKey, url? }`。4xx / 5xx 为 `rejected`；其他回执、缺失回执或不可判定网络结果为 `unconfirmed`。取消不撤销已取得的明确成功或拒绝回执。错误 reason 还包括 `invalid_input`、`credential`、`signing`、`unsupported`。

## 远程转存

`transferRemoteFileToOss(input, options): Promise<OssTransferResult>`

input 使用 `sourceUrl` 替代 `fileUri`；其余字段与上传一致。options 使用上传授权、信号和进度，并要求 `transferDirectory: string | undefined` 与 `createId(): string`。目录是宿主分配的私有 file URI；不可用时传 `undefined`，返回 `unsupported`。`createId` 必须返回目录内唯一且适合作为文件名的标识，不含目录分隔符或父路径。

授权和目标验证先于下载。仅 HTTP 200 且文件落地后上传，保留签名 URL 原字节。下载失败标识 `stage: 'download'`，上传失败为 `stage: 'upload'`。交给上传后的临时文件等待 `onSourceReleased` 才释放。`maxBytes` 不改变下载默认策略。

现有转存和批量组合没有向内部上传传递 `urlMode`；本包保留这一行为。直接单文件上传仍支持 `urlMode`。

## 顺序批量

`uploadOssBatch(items, options): Promise<OssBatchResult>`

item 为 `{ kind: 'local', ...UploadOssFileInput }` 或 `{ kind: 'remote', ...TransferRemoteFileToOssInput }`。options 包含授权、信号、`transferDirectory`、`createId`，进度为 `{ index, progress }`。

结果 `items` 与输入同序，逐项保留 `index`、`path`、`result`。单项失败继续，取消只停止未开始项；共同准备失败时返回 `preparationError`，各项为 `{ status: 'not_started', reason: 'preparation_failed' }`。取消后未开始项 reason 为 `cancelled`。不去重、不改名、不回滚已成功项。
