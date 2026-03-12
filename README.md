# TwinFlare

**Your Digital Twin, Powered by Cloudflare**

TwinFlare 是一个 Cloudflare-native 个人 AI 分身平台。  
将你的 Markdown 知识文档放入 GitHub 仓库，push 后自动向量化并部署，通过 API 与你的数字分身对话。

**完全无服务器 · 数据在你自己的 Cloudflare 账户 · 零本地工具链**

---

## 架构

```
GitHub Repo (docs/*.md + twinflare.config.json)
    │
    │  git push → GitHub Actions
    ├─ Job 1: wrangler deploy (Worker + secrets + Vectorize)
    └─ Job 2: POST /sync → 切片 → Workers AI 嵌入 → Vectorize
                                        ↓
                            外部应用 → /api/chat → RAG → Claude / GPT / Gemini / Workers AI
```

**用到的 Cloudflare 服务**：Workers · Vectorize · Workers AI（嵌入固定使用 `bge-base-en-v1.5`）

---

## 快速开始

### 1. Fork 此仓库

### 2. 配置 GitHub Actions Secrets

在仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers/Vectorize 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `WORKER_URL` | Worker 部署后的 URL（首次部署后从 Actions 日志获取，再次填写） |
| `SYNC_SECRET` | 自定义随机字符串，用于 /sync 接口鉴权 |
| `PUBLIC_API_TOKEN` | 自定义随机字符串，用于公开 API 鉴权 |
| `ANTHROPIC_API_KEY` | （可选）使用 Claude 时填写 |
| `OPENAI_API_KEY` | （可选）使用 GPT 时填写 |
| `GOOGLE_API_KEY` | （可选）使用 Gemini 时填写 |

### 3. 配置 Persona

编辑 `twinflare.config.json`：

```json
{
  "persona": {
    "name": "你的名字",
    "systemPrompt": "你是 xxx 的数字分身，基于他的知识库回答问题...",
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "topK": 5,
    "temperature": 0.7
  }
}
```

支持的 `provider`：`cloudflare`（免费，无需 API Key）· `openai` · `anthropic` · `google`

### 4. 添加知识文档

将 Markdown 文件放入 `docs/` 目录：

```
docs/
├── about.md
├── projects.md
└── blog/
    └── my-post.md
```

### 5. Push 触发部署

```bash
git add .
git commit -m "feat: initial setup"
git push
```

GitHub Actions 将自动完成：Worker 创建 → secrets 写入 → Vectorize 索引 → 文档向量化。

---

## API 使用

### 聊天

```bash
curl -X POST https://your-worker.workers.dev/api/chat \
  -H "Authorization: Bearer <PUBLIC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "介绍一下你自己" }
    ]
  }'
```

响应为 [Vercel AI SDK Data Stream](https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol) 格式，可直接对接 `useChat` hook。

### 语义检索

```bash
curl -X POST https://your-worker.workers.dev/api/search \
  -H "Authorization: Bearer <PUBLIC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "query": "你做过哪些开源项目", "topK": 3 }'
```

### 获取 Persona 信息

```bash
curl https://your-worker.workers.dev/api/persona \
  -H "Authorization: Bearer <PUBLIC_API_TOKEN>"
```

---

## 本地开发

```bash
npm install
npx wrangler dev
```

本地开发时，Vectorize 和 Workers AI 绑定通过 wrangler 模拟。

---

## 项目结构

```
twinflare/
├── src/
│   ├── index.ts              # Hono app 入口
│   ├── types.ts              # 类型定义
│   ├── middleware/auth.ts    # Bearer Token 鉴权
│   ├── lib/
│   │   ├── chunker.ts        # Markdown 切片
│   │   ├── embedder.ts       # Workers AI 嵌入
│   │   ├── vectorize.ts      # Vectorize CRUD
│   │   └── llm.ts            # LLM provider 路由
│   └── routes/
│       ├── sync.ts           # POST /sync
│       ├── chat.ts           # POST /api/chat
│       ├── search.ts         # POST /api/search
│       └── persona.ts        # GET /api/persona
├── scripts/
│   ├── inject-config.js      # 将 twinflare.config.json 注入 wrangler.toml
│   └── sync.js               # GitHub Actions 文档同步脚本
├── .github/workflows/
│   └── deploy.yml            # 部署 + 同步流水线
├── docs/                     # 你的知识文档（.md 文件）
├── twinflare.config.json     # Persona 配置
└── wrangler.toml             # Cloudflare Worker 配置
```
