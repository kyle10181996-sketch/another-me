# Prompt 管理

Prompt 集中在 `src/lib/ai/prompts.ts`，不要散落在 UI 组件里。

当前包含：

- 系统总提示词
- 记忆提取 Prompt
- 决策模拟 Prompt
- 未来来信 Prompt

真实 API 接入时，建议使用结构化 JSON 输出，并要求每个重要判断附带 evidence memory id。
