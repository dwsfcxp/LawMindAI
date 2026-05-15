<div align="center">

# ⚖️ LawMind AI

**智能法律文书助手平台**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](docker-compose.yml)

*AI 驱动的一站式法律工作台 —— 案件管理、文书生成、智能检索、证据分析、合同审查*

[English](#features) · [功能演示](#-功能概览) · [快速开始](#-快速开始) · [技术架构](#-技术架构) · [API 文档](#-api-文档)

</div>

---

## ✨ 功能概览

| 模块 | 功能 | 说明 |
|:-----|:-----|:-----|
| 📊 **仪表盘** | 数据概览、快捷操作 | 案件/文书/模板统计、趋势图表、一键跳转 |
| 📁 **案件管理** | 创建/查询/更新/删除 | 按状态/类型筛选、关联文书和证据 |
| 📝 **文书生成** | AI 驱动生成法律文书 | 支持起诉状、答辩状、代理词等多种模板，一键导出 Word |
| 🔍 **智能检索** | 跨法规/案例/知识库搜索 | 关键词+语义混合检索、AI 摘要总结 |
| 📋 **模板管理** | 法律文书模板 CRUD | 内置常用模板、支持自定义模板结构 |
| 🗂️ **证据管理** | 上传/OCR/AI分析 | 图片 OCR 文字提取、AI 证据分析、质证意见生成 |
| 📚 **法律研究** | 深度研究报告 | 多源法律文献聚合、AI 研究报告生成与导出 |
| 🔎 **法条核查** | 引用验证 | 自动检查文书中的法律引用是否准确、现行有效 |
| 📑 **合同审查** | 智能合同分析 | 风险条款识别、合规性检查、修改建议 |
| 💡 **知识库** | 个人知识管理 | 文本/文件上传、全文检索、向量索引 |
| ⚙️ **系统设置** | LLM/外部API/应用配置 | 支持多种大模型、可接入第三方法律数据库 |

---

## 🚀 快速开始

### 环境要求

- **Python** 3.12+
- **Node.js** 18+
- **npm** 9+

### 一键启动（本地开发）

```bash
# 1. 克隆项目
git clone https://github.com/dwsfcxp/LawMindAI.git
cd LawMindAI

# 2. 启动后端
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env         # 编辑 .env 填入 API Key
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 3. 启动前端（新终端）
cd frontend
npm install
npm run dev
```

打开浏览器访问 **http://localhost:5173**

### Docker 部署（生产环境）

```bash
# 一键启动所有服务（PostgreSQL + Redis + ChromaDB + Backend + Frontend + Nginx）
docker compose up -d

# 查看日志
docker compose logs -f backend
```

| 服务 | 端口 | 说明 |
|:-----|:-----|:-----|
| Nginx | `:80` | 反向代理入口 |
| Frontend | `:5173` | React 开发服务器 |
| Backend | `:8000` | FastAPI 应用 |
| PostgreSQL | `:5432` | 生产数据库 |
| Redis | `:6379` | 缓存 & 会话 |
| ChromaDB | `:8001` | 向量数据库 |

---

## 🏗️ 技术架构

```
LawMindAI/
├── backend/                    # Python 后端
│   ├── app/
│   │   ├── api/routers/        # REST API 路由（14 个模块）
│   │   ├── core/               # 数据库、认证、安全
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   ├── schemas/            # Pydantic 请求/响应模型
│   │   ├── services/           # 业务逻辑层
│   │   │   ├── llm_client.py   # 统一 LLM 客户端（OpenAI/Anthropic 兼容）
│   │   │   ├── vector/         # ChromaDB 向量检索
│   │   │   ├── data_sources/   # 外部数据源适配器
│   │   │   └── documents/      # 文书生成引擎
│   │   ├── mcp/                # MCP 协议集成
│   │   ├── config.py           # 配置管理
│   │   └── main.py             # FastAPI 应用入口
│   ├── alembic/                # 数据库迁移
│   ├── templates/              # 文书模板（Jinja2）
│   ├── tests/                  # 测试套件
│   └── requirements.txt
│
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── pages/              # 10 个页面组件
│   │   ├── components/         # 通用 UI 组件
│   │   ├── lib/                # API 客户端、工具函数
│   │   ├── App.tsx             # 路由配置
│   │   └── main.tsx            # 入口
│   ├── public/                 # 静态资源 & PWA manifest
│   └── vite.config.ts          # Vite + API 代理
│
├── docker/                     # Docker 配置
│   ├── backend/Dockerfile
│   ├── frontend/Dockerfile
│   └── nginx/nginx.conf
│
├── config/data_sources/        # 外部数据源 YAML 配置
└── docker-compose.yml          # 容器编排
```

### 技术栈

**后端**
- **FastAPI** — 高性能异步 Web 框架
- **SQLAlchemy 2.0** — 异步 ORM，支持 SQLite / PostgreSQL
- **ChromaDB** — 向量数据库，语义检索
- **OpenAI SDK** — 兼容 OpenAI / Anthropic / 智谱等 LLM
- **Alembic** — 数据库迁移
- **Pydantic v2** — 数据校验
- **python-docx / WeasyPrint** — 文书导出

**前端**
- **React 19** + **TypeScript 5.7**
- **Vite 6** — 极速开发构建
- **Tailwind CSS 3** — 原子化样式
- **Radix UI** — 无障碍 UI 组件
- **React Router 7** — 客户端路由
- **TanStack Query** — 异步状态管理
- **Lucide React** — 图标库

---

## 🔌 支持的大模型

LawMind AI 通过 OpenAI 兼容协议支持多种大语言模型：

| 模型 | Base URL | 说明 |
|:-----|:---------|:-----|
| 智谱 GLM | `https://open.bigmodel.cn/api/anthropic` | 默认推荐 |
| DeepSeek | `https://api.deepseek.com/v1` | 高性价比 |
| OpenAI GPT | `https://api.openai.com/v1` | 国际版 |
| Claude | `https://api.anthropic.com` | Anthropic 官方 |
| 其他 OpenAI 兼容 | 自定义 | Ollama / vLLM 等 |

在 **设置 → LLM 配置** 页面添加或切换模型，无需重启。

---

## 📖 API 文档

启动后端后访问：

- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

共 **88 个 API 端点**，覆盖认证、案件、文书、检索、证据、知识库等完整功能。

---

## ⚙️ 环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
# 应用
APP_ENV=development
APP_SECRET_KEY=<随机密钥>

# 数据库（本地开发用 SQLite，生产用 PostgreSQL）
DATABASE_URL=sqlite+aiosqlite:///./lawmind.db

# LLM
CLAUDE_API_KEY=<你的 API Key>
CLAUDE_BASE_URL=https://open.bigmodel.cn/api/anthropic
CLAUDE_MODEL=glm-5.1

# 向量数据库（本地开发自动使用嵌入式模式）
CHROMA_HOST=localhost
CHROMA_PORT=8001

# JWT
JWT_SECRET_KEY=<随机密钥>
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'feat: add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**LawMind AI** © 2025 - Present

</div>
