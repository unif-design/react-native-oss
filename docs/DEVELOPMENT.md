---
id: development
slug: /development
title: 研发与验证
description: 工程来源、检查与发布流程。
---

# 研发与验证

工程采用 `create-react-native-library@0.64.0` 的 `library` / `js` / `vanilla` 模板，使用 TypeScript 与真实 iOS / Android example。RN 固定为 0.88.1，既有 SDK 与补丁保留原版本。

组织标准采用 `unif-design/.github@a29d71586a63a1b39d9a3acc446741289150ac41`，包括库提取与等价迁移专题。模板通过组织同步脚本下发，Git 提交与 PR 使用中文。

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
