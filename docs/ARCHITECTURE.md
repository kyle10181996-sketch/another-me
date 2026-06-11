# 架构说明

## 当前本地原型

```text
src/app/page.tsx
  -> src/components/AppShell.tsx
     -> localStorage
     -> src/lib/memory/*
     -> src/lib/ai/*
     -> src/lib/safety/*
```

## 模块边界

- `src/lib/types.ts`：核心数据模型
- `src/lib/storage.ts`：本地状态读写
- `src/lib/memory/memory-extractor.ts`：记忆提取和去重
- `src/lib/memory/retrieve-memory.ts`：相关记忆检索
- `src/lib/ai/profile-generator.ts`：动态人格画像
- `src/lib/ai/decision-simulator.ts`：未来分支模拟
- `src/lib/ai/letter-writer.ts`：未来来信
- `src/lib/safety/classify-risk.ts`：风险识别和安全回复

## 生产化迁移

建议按以下顺序推进：

1. Supabase Auth + PostgreSQL
2. Memory/Decision/DailyLog 表
3. pgvector 向量检索
4. OpenAI Responses API 结构化 JSON 输出
5. 记忆编辑、导出、删除和暂停记忆
6. 复盘提醒和画像定期更新
