---
id: development
slug: /development
title: 研发与验证
description: 工程来源、检查与发布流程。
---

# 研发与验证

工程采用 `create-react-native-library@0.64.0` 的 `library` / `js` / `vanilla` 模板，使用 TypeScript 与真实 iOS / Android example。RN 固定为 0.88.1，既有 SDK 与补丁保留原版本。

库提取时采用组织标准修订 `a29d71586a63a1b39d9a3acc446741289150ac41` 的等价迁移要求。当前模板与交付入口见[交付配置与检查](#交付配置与检查)，Git 提交与 PR 使用中文。

通用规范使用 `uni-skills`：`code-organization` 说明目录与文件组织，`react-native-development` 说明 RN 实现要求，`react-native-library` 说明独立库与消费者验证，`documentation` 说明文档与文档站维护。Unif 的设计、测试、审查和交付按 `unif-portal-dev-skills` 对应技能执行；本库接口与行为以公开类型和有效契约为准。

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

网站使用 Docusaurus 和共享 LLM 生成器。本地检查不证明真机或真实 OSS 已验收。

## 交付配置与检查

共享 CI、发布配置和检查工具由 `github-delivery` 的模板与工具维护。Unif 组织值由 `code-delivery` 的 `assets/organization.json` 维护，接入时落实为本库 `.github/organization.json`，记录组织、包名规则、Pages 地址、发布 App 身份及远端设置。工具运行时读取项目文件，不依赖其他技能的安装目录；适用技能按当前任务独立选择。

在仓库根目录按阶段执行：

| 命令 | 检查范围 |
| --- | --- |
| `node .github/scripts/check-delivery.cjs` | 离线检查受管文件、组织配置与 source 元数据。 |
| `node .github/scripts/check-library.cjs pack` | 完成库构建后，检查当前 tarball 的导出、声明与文件清单。 |
| `node .github/scripts/check-library.cjs release` | 发行前校验 README、许可和发布配置，不执行发布。 |
| `node .github/scripts/check-library.cjs published` | 联网核验 npm 当前版本的元数据、下载完整性与实际 tarball。 |

CI 与发布步骤见本库 `.github/workflows/`，组织配置调整以项目文件及当前授权为准。本地检查、远端 CI、npm 发布、文档部署和设备验收分别报告。
