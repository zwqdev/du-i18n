# 一、开发须知

### 1. node 版本建议

```
v14.17.3
```

# 二、国际多语言本地开发解决方案

### 1. 介绍

本项目 fork du-i18n,开源地址：https://github.com/ctq123/du-i18n

## 简短说明

一个面向本地开发的 i18n 辅助 VS Code 扩展，提供：代码中中文扫描与提取、提取回显、在线翻译、补全语言文件、语言切换与分析统计等功能。

## 快速开始

- 安装扩展后，点击扩展设置会生成或提示你创建 `yz-i18n.config.json`。
- 推荐 Node 版本（开发/打包）：v14 系列。

## 配置（yz-i18n.config.json）

下面列出常用配置项及含义（根据代码中使用的配置 getter 整理）。如果你的配置项名称不同，请按你项目中的实际字段调整。

示例配置（最小示例）：

```json
{
  "fileReg": "\\.(ts|js|tsx|jsx|vue|html)$",
  "tempPaths": "src/i18n/temp/*",
  "tempFileName": "{pageName}.{lang}.json",
  "tempLangs": ["en", "zh"],
  "defaultLang": "zh",
  "langPaths": "src/i18n/locales/**/*.json",
  "transSourcePaths": "src/i18n/source/*",
  "isOnlineTrans": false,
  "isOnline": false,
  "transBatchSize": 10,
  "isNeedRandSuffix": true,
  "hookImport": "", //自动注入import
  "skipExtractCallees": [],
  "scanIgnoreGlobs": ["**/node_modules/**", "**/dist/**"],
  "minMergeCount": 2,
  "watcherGlob": "**/*.{ts,tsx,js,jsx,vue,html,json}"
}
```

字段说明（常用）

- fileReg: 用于判断编辑器或保存时是否应触发渲染/扫描的文件名正则字符串。
- tempPaths: 提取后的临时翻译文件保存路径（支持 glob），示例：`src/i18n/temp/*`。
- tempFileName: 临时文件命名规则（可包含 page 名称、语言占位符等）。
- tempLangs: 扩展语言数组（要生成/管理的目标语言，如 ["en","fr"]）。
- defaultLang: 默认语言（通常为主语言，如 zh / en）。
- langPaths: 现有语言文件路径的 glob，用于合并/拆分/补全语言包。
- transSourcePaths: 翻译源目录（当未接入线上翻译平台时可使用本地翻译源）。
- isOnlineTrans / isOnline: 是否启用在线翻译或线上化流程（有关接入百度或内部平台的凭据需另行配置）。
- transBatchSize: 翻译批次大小，控制请求分批数量以避免超时或速率限制。
- isNeedRandSuffix: 是否为生成的临时文件添加随机后缀以避免命名冲突。
- hookImport: 扫描时是否尝试自动插入或检查 i18n hook/import。
- skipExtractCallees: 是否跳过某些复杂函数调用的提取（用于减少误判并提升速度）。
- scanIgnoreGlobs: 不参与扫描/翻译的路径或文件的 glob 列表。
- minMergeCount: 合并重复 key 的最小重复次数，默认为 2（即至少 2 个相同值才合并）。
- watcherGlob: 覆盖默认的文件系统 watcher 匹配规则（用于减少无关文件触发）。

关于在线翻译凭据

- 对接内部大模型
  具体凭据/账号字段通常通过 `config.getAccount()` 等方式读取，请在 `yz-i18n.config.json` 或环境变量中存放相应的 token/账号信息（不要硬编码敏感信息到仓库）。

## 功能说明

### 合并重复值的 key

此功能能够自动检测并合并默认语言文件中值相同的多个 key，有助于减少翻译工作量和维护成本。

**使用方法：**

1. 在编辑器中右键，选择 "FPF 国际化" -> "合并重复值的 key"
2. 系统会自动分析默认语言文件（如 zh.json）中值相同的 key
3. 将重复的 key 合并为 `common_${hash值}` 格式的新 key
4. 自动替换源代码中的所有引用
5. 更新所有语言文件

**示例：**

```json
// 合并前的 zh.json
{
  "FrontPage_index_0121": "保存",
  "sowbusiness.putseedling.save": "保存",
  "user.profile.save": "保存"
}

// 合并后的 zh.json
{
  "common_abc12345": "保存"
}
```

**配置说明：**

- 只处理 `.js`, `.ts`, `.vue`, `.jsx`, `.tsx` 文件
- 遵循 `scanIgnoreGlobs` 配置忽略指定文件
- 通过 `minMergeCount` 配置最小重复次数（默认为 3），只有达到该次数的重复值才会被合并
- 如果生成的新 key 已存在，会自动添加时间戳后缀

**预览功能：**

- 使用 "预览合并重复值的 key" 命令可以在实际执行前查看将要进行的更改
- 预览界面显示统计信息、合并方案和影响的文件
- 确认无误后可直接在预览界面执行合并操作

注意与合规

- 请遵守原项目的开源许可证（LICENSE）与 NOTICE 要求，保留原作者的版权声明和许可文件。
- 仅在你有权限的情况下更改发布者或将扩展发布到 Marketplace / npm。

如果配置字段与项目中的 getters/方法名不一致

- 本文档根据代码中常见的 `config.getXXX()` 方法整理字段名称与含义；如果你在项目中发现不同命名，请以代码实现为准。需要我把项目中的配置 schema（如 `yz-i18n.config.json` 的默认结构）提取并插入 README，我可以扫描仓库并生成精确的字段列表。

---

更多使用示例、界面截图与版本记录请参见项目 Releases 页或原仓库文档。
