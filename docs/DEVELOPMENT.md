---
id: development
slug: /development
title: 研发与验证
description: 工程来源、检查与发布流程。
---

# 研发与验证

工程采用 `create-react-native-library@0.64.0` 的 `library` / `js` / `vanilla` 模板，使用 TypeScript 与真实 iOS / Android example。RN 固定为 0.88.1，BlobUtil 固定为 1.1.1，宿主补丁同步适配该版本。

库提取时采用组织标准修订 `a29d71586a63a1b39d9a3acc446741289150ac41` 的等价迁移要求。当前模板与交付入口见[交付配置与检查](#交付配置与检查)，Git 提交与 PR 使用中文。

| 任务 | 技能 |
|---|---|
| 调整代码结构或实现已明确的改动 | `uni-code-change` |
| 修改 RN 组件、Hook 或原生接线 | `uni-rn-dev` |
| 维护库的公开入口、示例和分发产物 | `uni-rn-library` |
| 编写工程文档或维护文档站 | `uni-documentation` |
| 核对 Unif 项目约定和实际消费者 | `unif-rn-project` |
| 设计新的职责或公共接口 | `unif-architecture-design` |
| 执行已授权的代码交付 | `unif-code-delivery` |

查阅本库接口和接入要求时，可从[Unif 技能市场](https://github.com/unif-skill/unif-portal-dev-skills#安装与使用)单独安装 `unif-oss` 插件。本库接口与行为以公开类型和有效契约为准。

```sh
yarn install
yarn typecheck
yarn test
yarn build
node .github/scripts/check-library.cjs pack
yarn website typecheck
yarn website test
yarn website build
```

原生方法自检、原生构建与设备测试分别执行。公开消费使用真实 tarball 与生成声明，不能只依赖源码映射。发布通过组织 PR、CI、规则集、发布机器人及 Trusted Publisher / OIDC；首次包按组织标准建立身份。

完成 `yarn build` 后运行 `yarn verify:consumer`，在独立目录安装实际 tarball，检查公开类型、共享 Logger 和浏览器入口的凭证／平台边界。浏览器入口检查使用现有 Jest／Babel 工具转换已安装产物，仅替换 React Native 平台边界；它不构建浏览器页面，也不应用宿主 SDK 补丁。

网站使用 Docusaurus 和共享 LLM 生成器。本地检查不证明真机或真实 OSS 已验收。

## 交付配置与检查

共享 CI、发布配置和检查工具由 `uni-github-delivery-setup` 的模板与工具维护。Unif 组织值由 `unif-code-delivery` 的 `assets/organization.json` 维护，接入时落实为本库 `.github/organization.json`，记录组织、包名规则、Pages 地址、发布 App 身份及远端设置。工具运行时读取项目文件，不依赖其他技能的安装目录；适用技能按当前任务独立选择。

在仓库根目录按阶段执行：

| 命令                                               | 检查范围                                                  |
| -------------------------------------------------- | --------------------------------------------------------- |
| `node .github/scripts/check-delivery.cjs`          | 离线检查受管文件、组织配置与 source 元数据。              |
| `node .github/scripts/check-library.cjs pack`      | 完成库构建后，检查当前 tarball 的导出、声明与文件清单。   |
| `node .github/scripts/check-library.cjs release`   | 发行前校验 README、许可和发布配置，不执行发布。           |
| `node .github/scripts/check-library.cjs published` | 联网核验 npm 当前版本的元数据、下载完整性与实际 tarball。 |

CI 与发布步骤见本库 `.github/workflows/`，组织配置调整以项目文件及当前授权为准。本地检查、远端 CI、npm 发布、文档部署和设备验收分别报告。

## 共享异步日志

日志消费正式 `@unif/react-native-logger@^0.3.0`，运行时仍由宿主统一安装。凭据、传输及清理的日志专用错误投影通过元数据生产器交给 Logger 异步执行，库不另建日志队列，也不等待日志完成。操作、阶段和原生事件现场状态先固定；业务失败分类、终态回调与资源释放顺序保持原契约。验证日志时显式读取生产器或使用正式 Logger 运行时观察实际记录，不能以 JSON 忽略函数代替脱敏验证。
