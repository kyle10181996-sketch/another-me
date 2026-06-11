# 世另我 / AnotherMe

本项目是“世另我”的本地 MVP 原型：一个长期学习用户经历、决策、动机和结果的个人镜像 Agent。

第一版聚焦一个核心场景：

> 重大决策前，问问另一个我。

## 功能

- 每日记录：保存原文并提取结构化记忆
- 我的镜像：查看价值观、行为模式、恐惧、愿望、盲区等记忆卡片
- 决策模拟：输入 A/B 选项，生成 1 年、3 年、10 年未来分支
- 未来来信：基于已有记忆生成来自未来自己的信
- 安全边界：心理危机、医疗、法律、投资等场景进入谨慎辅助模式

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

首次使用时进入“API 设置”，输入自己的 OpenAI API Key。Key 只会保存到本机：

- Web 本地开发：`data/settings.json`
- 桌面应用：系统用户数据目录下的 `data/settings.json`

这些本地数据文件已被 `.gitignore` 排除，不会上传到 GitHub。

## 桌面版打包

```bash
npm run dist:win
```

这会尝试生成 Windows x64 安装器和便携版 `.exe`，输出到 `release/`。

如果在 macOS 上交叉构建 Windows 包时 Electron 下载或 NSIS 环境失败，可以直接推送到 GitHub 后，在 GitHub Actions 的 `Build Desktop App` workflow 里生成 Windows 安装包。

## 当前实现说明

- 数据保存到项目本地文件 `data/another-me-state.json`
- API Key 保存到项目本地文件 `data/settings.json`
- 如果浏览器里存在旧版 `localStorage` 数据，首次打开时会自动迁移到本地文件
- AI 管线为本地确定性模拟，`src/lib/ai/llm.ts` 和 `src/lib/ai/embedding.ts` 已预留真实 API 适配层
- Prompt 集中在 `src/lib/ai/prompts.ts`
- 用户记忆类型和核心数据结构在 `src/lib/types.ts`

## 后续建议

- 将本地状态迁移到 Supabase/PostgreSQL
- 接入 pgvector 做相似决策检索
- 将 `llm.ts` 替换为 OpenAI Responses API 结构化输出
- 增加记忆编辑、导出和长期记忆开关
