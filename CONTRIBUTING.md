# 参与开发

本仓使用 Yarn workspaces：库位于根目录，真实原生示例位于 `example/`，Docusaurus 文档站位于 `website/`。Node 和 Yarn 版本以 `.nvmrc`、`package.json` 为准，开发与交付入口见 [AGENTS.md](AGENTS.md) 和 [研发说明](docs/DEVELOPMENT.md)。

## 开发与验证

```sh
yarn install
yarn lint
yarn typecheck
yarn test
yarn build
yarn verify:consumer
yarn website test
yarn website build
```

`verify:consumer` 在独立临时目录安装真实 tarball，检查公开声明和共享 logger 解析。首次发行前可显式传入同批 Files 候选 tarball；该结果不能标为 registry 正式版本消费。

本库依赖宿主准备后的精确 SDK 行为，依赖安装本身不会应用补丁。Portal 是补丁唯一维护方；在本库 example 或干净消费者中，由宿主从同一来源显式准备实际 SDK 副本并重新构建，步骤见 [原生接线](docs/native-setup.md)。

```sh
yarn test:sdk
yarn test:native:android
yarn test:native:ios
yarn example start
yarn example android
yarn example ios
```

SDK 验证只读取实现；外部宿主可用 `OSS_SDK_ROOT` 指向其真实 BlobUtil 安装目录。保留取消后的原生结束通知、身份隔离和文件所有权测试，不能把 JS Promise settle 当作原生读取完成。类型、逻辑测试、原生构建、设备和真实服务结果分别说明。

## 提交与发布

修改前核对实际消费者与当前契约，只修改当前范围和必要接线。提交、PR 标题及描述使用中文，类型前缀保留 Conventional Commits 格式；公共 API 变化同步类型、文档、example 和消费者验证。

使用组织标准 PR、CI、规则集及发布机器人链路，正式 npm 版本由 `release.yml` 经 Trusted Publisher / OIDC 发布，不通过本机发布绕过门禁。首次包身份与引导候选按组织标准处理，待审占位版本不算交付。SDK 补丁和私有应用配置不复制进入公开包。

交流遵循 [行为准则](CODE_OF_CONDUCT.md)，安全问题使用 [安全报告入口](SECURITY.md)。
