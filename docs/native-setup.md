---
title: 原生接线
description: SDK 精确版本、宿主补丁准备、终态通知与消费者验证。
---

# 原生接线

库本体是 TypeScript，不新增自有 TurboModule / Fabric / Swift / Kotlin 实现。传输使用 `react-native-blob-util@0.25.1`；文件能力使用 `@unif/react-native-files`，日志使用同一个 `@unif/react-native-logger`。

## 宿主维护补丁

补丁统一由 Portal 的宿主工程维护和应用。公共库不携带 .patch、不自动修改消费者依赖。其他宿主接入时，须先从获准访问的维护源取得同一版本补丁，并按宿主的安装流程显式应用，再重新执行 Pods / Gradle 构建；不得假设 npm 安装已经补齐能力。

| 依赖精确版本 | 必需能力 |
| --- | --- |
| react-native-blob-util 0.25.1 | onRequestComplete 独立原生终态、一次性通知、取消不提前释放、异常关闭源流 |
| @dr.pogodin/react-native-fs 2.41.0 | Files 下载取消与终态清理契约 |
| @dr.pogodin/react-native-static-server 0.28.1 | Files 资源访问的原生生命周期契约 |

同一宿主只维护一份补丁源。确认库、example、Metro、autolinking、Pods 和 Gradle 实际解析的是已修补副本，不能只修补库根目录另一份 node_modules。补丁失败或版本不匹配时停止原生验收，不回退到未修补语义。

## 验证步骤

1. 从真实 npm tarball 在干净宿主安装库和精确版本依赖。
2. 使用宿主维护的补丁源显式准备所有实际依赖副本。记录源修订、补丁摘要与 SDK 解析路径；这些环境记录保存在仓库外。
3. 运行 `yarn test:sdk`：取消后的 JS Promise 结束不能触发源释放，真实原生终态回调才通知。此检查要求已准备补丁环境，缺少能力即失败。
4. `yarn test:native:android` / `yarn test:native:ios` 从已安装 SDK 提取真实方法，检查异常源流关闭和表单结果。
5. 构建 iOS / Android example，验证设备取消、终态与临时文件删除顺序，再以授权的短期 STS 验证真实 OSS。

标准 `yarn test` 检查库行为，SDK 契约通过独立 `test:sdk` 入口验证。CI 的库检查通过不代表宿主 SDK 已修补；发布验收必须另附准备后的 SDK、原生构建与消费者证据。替身、构建、设备和真实服务分别报告。

`example/ios`、`example/android` 是真实原生工程，不支持用 Expo Go 替代。应用私有文件无需额外媒体权限；保留宿主网络策略，不关闭 TLS。示例只在页面内存接收临时凭证，不记录或持久化。
