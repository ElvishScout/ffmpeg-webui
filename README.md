# ffmpeg-webui

纯前端 ffmpeg 可视化节点编辑器。用节点图描述处理流程，编译为 ffmpeg 命令并在浏览器内（ffmpeg-wasm）执行。

## 功能

- **可视化节点编辑器**（Vue Flow）：素材节点 / filter 节点 / 暂存节点 / 输出节点 / 自定义 raw filter 节点
- **混合执行模型**：默认整图编译为一条 `ffmpeg -filter_complex` 命令；放置“暂存节点”可显式切段，产出中间文件喂给下一段
- **素材库**：上传素材持久化到 OPFS + IndexedDB，跨会话复用；产物可一键回存素材库
- **工作流**：IndexedDB 存档、命名管理、导出/导入 JSON（`schemaVersion` 链式迁移）；导入时缺失素材显示为幽灵节点，按文件名+大小提示重映射
- **命令透明**：随时查看/复制生成的 ffmpeg 命令
- **多后端架构**：`Executor` 接口接收编译好的 `Job`，当前实现 wasm 后端；服务端后端可直接复用 `Job`（资产来源已抽象，可不经过前端存储）

## 开发

```bash
npm install
npm run dev    # vite，已配置 COOP/COEP
npm run build  # vue-tsc + vite build
npx vitest run # 编译器 / 迁移 / 素材匹配单测
```

## 部署约束（重要）

ffmpeg-wasm 多线程核心要求**跨域隔离**，静态托管必须带响应头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

否则 `SharedArrayBuffer` 不可用，应用会显示错误横幅。dev/preview 服务器已内置这两个头。

**ffmpeg 核心加载方式**：`@ffmpeg/ffmpeg` 的 worker 用动态 `import()` 加载 `coreURL`（必须是 ESM），而 emscripten 以 classic worker 启动 `workerURL`（必须是 UMD）。ESM 包里的 `ffmpeg-core.worker.js` 含 `import` 语句会报错，所以 worker 用相对路径直接引用 `node_modules/@ffmpeg/core-mt/dist/umd/ffmpeg-core.worker.js` 的 `?url` 导入（绕过包 exports 限制），core/wasm 走 ESM 的 `?url` 导入——全部经打包管线处理。同时 `assetsInlineLimit: 0`，避免 worker 被内联成 data: URI（classic worker 无法加载）。

## 架构

```
src/
  types/         # 图模型、Job、Executor 接口、filter schema
  filters/       # 声明式 filter 注册表（~40 个，纯数据）
  compiler/      # 校验（类型/环/连通性） + 图 → filter_complex 编译（纯函数，单测覆盖）
  data/          # OPFS 素材存储、IndexedDB、浏览器原生元数据探测、缺失素材匹配
  workflow/      # 存档、schemaVersion 迁移、导入导出
  executor/      # Executor 接口的 wasm 实现（core-mt 惰性加载，terminate 取消）
  stores/        # pinia:graph / assets / workflow / run
  components/    # 画布、节点、参数面板（schema 驱动）、素材库、执行面板、命令预览
```

### 关键设计

- **编译在前端**：任何后端收到的都是 `Job`（有序命令段 + 资产引用 + 产物清单），服务端可做命令级改写（如 `libx264` → `h264_nvenc`）
- **端口类型**：`video` / `audio` / `av`（媒体文件）；`av` 可连任意类型，编辑期实时校验，ffmpeg 要求所有 filter 输出口必须被连接
- **节点定义是数据**：`{ name, inputs, outputs, params }`，参数表单自动生成；`inputsFrom`/`outputsFrom` 支持动态口数（concat/split 等）
- **取消 = terminate**：wasm 实例销毁，下次运行惰性重建
