# 世另我 / AnotherMe

世另我是一个本地优先的个人镜像 Agent。它会记录你的经历、选择、动机和结果，并在你面对重要决策时，基于已有记忆模拟不同选择可能带来的未来分支。

它不是算命工具，也不会替你做决定。它的作用是帮你看清：过去的你通常如何选择、你真正纠结的是什么、哪些盲区反复出现，以及下一步可以做什么小行动来验证判断。

## 功能

- 每日记录：保存日常经历，并提取结构化记忆
- 我的镜像：查看价值观、行为模式、恐惧、愿望、目标和盲区
- 决策模拟：输入 A/B 选项，生成 1 年、3 年、10 年未来分支
- 未来来信：基于已有记忆生成来自未来自己的信
- 时间线：按时间查看记录、选择和复盘线索
- 本地数据：记录、记忆和模型配置都保存在本机
- 多模型配置：支持 OpenAI 兼容接口，可接入 OpenAI、DeepSeek、Qwen、Kimi 等服务

## 使用桌面版

Windows 用户可以下载 GitHub Actions 生成的安装包或便携版。

1. 打开仓库的 Actions 页面
2. 进入最新的 `Build Desktop App` 构建
3. 在页面底部下载 `another-me-windows`
4. 解压后运行安装版或便携版

安装版文件名类似：

```text
世另我 Setup 0.1.0.exe
```

便携版文件名类似：

```text
世另我 0.1.0.exe
```

第一次打开应用后，进入“API 设置”，填写模型服务配置即可使用。

## 模型配置

世另我使用 OpenAI 兼容的 `/chat/completions` 接口。只要服务商提供兼容接口，就可以通过以下三项接入：

```text
Base URL
API Key
模型名
```

常用配置示例：

| 服务商 | Base URL | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

API Key 只保存在本机，不会写入仓库，也不会上传到 GitHub。

## 本地运行

需要先安装 Node.js。

```bash
npm install
npm run dev
```

启动后打开：

```text
http://localhost:3000
```

## 本地数据

Web 本地开发时，数据保存在项目目录：

```text
data/another-me-state.json
data/settings.json
```

桌面应用中，数据保存在系统用户数据目录下的 `data/` 文件夹。

这些文件已被 `.gitignore` 排除，不会进入 GitHub 仓库。

## 打包 Windows 应用

```bash
npm run dist:win
```

构建完成后，安装包会输出到：

```text
release/
```

仓库也包含 GitHub Actions workflow。推送到 `main` 分支后，会自动在 Windows 环境构建 `.exe` 并上传为 artifact。

## 安全边界

世另我不会给出医疗诊断、法律结论、投资买卖建议，也不会处理心理危机时继续做未来模拟。

遇到自伤、自杀或强烈绝望等内容时，应用会转为安全支持模式，提醒用户联系身边可信任的人或当地紧急服务。
