# OSS 原生 example

使用真实 iOS / Android 工程与本库公开入口。先安装 Files 的原生依赖；由宿主显式准备 RNFS / Static Server 与 Portal 唯一维护的 BlobUtil 0.25.1 补丁；重新运行 Pods / Gradle 构建。此示例不能通过 Expo Go 验证。

页面接收临时 STS JSON、本地 file URI、远程 URL 与对象路径，支持单文件上传、转存、顺序批量和取消。凭证只保存在页面内存，不记录或持久化；本地源文件由提供者管理，示例显示真实 onSourceReleased 通知。远程临时文件使用私有根目录下 OssExampleTransfers，并沿用原生终态释放。

```sh
yarn install
yarn example ios
yarn example android
```

真实上传必须使用已授权、短期且范围受限的 STS。结果、原生读取结束通知与取消各自观察，不能把 Promise settle 当作文件释放。
