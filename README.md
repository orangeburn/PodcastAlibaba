# 声稿台 · Podcast TTS

一个 Windows 本地桌面 Podcast 生产工具。第一版面向阿里云百炼 CosyVoice v3.5，稿件、项目状态、片段 WAV 和最终 WAV 都保存在本机。

## 项目结构

```text
src/
├─ main/
│  ├─ index.ts             Electron 主进程与 IPC
│  ├─ store.ts             本地项目 / 设置 / 音色持久化
│  ├─ aliyunProvider.ts    阿里 CosyVoice provider
│  └─ audio.ts             PCM WAV 解析、停顿插入与拼接
├─ preload/index.ts        contextBridge 安全 API
├─ renderer/
│  ├─ App.tsx              项目、工作台、音色库、设置页面
│  └─ styles.css           桌面端 UI
└─ shared/
   ├─ parser.ts            Markdown 清理与语义分段
   ├─ hash.ts              片段文本 hash
   └─ types.ts             项目与 IPC 类型
```

## Windows 启动

需要 Node.js 20+。

```powershell
npm install
npm run dev
```

`npm run dev` 会启动 Vite 和 Electron。构建后也可以使用：

```powershell
npm run build
npm start
```

应用数据目录为 Electron 的 `userData/podcast-data`，通常位于：

```text
C:\Users\<用户名>\AppData\Roaming\podcast-alibaba\podcast-data
```

不会在仓库中生成或提交 API Key。

## 首次配置与使用

1. 进入“设置”，填写百炼 API Key、Base URL、模型和默认 Voice ID。
2. 默认 Base URL 是 `https://dashscope.aliyuncs.com/api/v1`，默认模型是 `cosyvoice-v3.5-flash`。
3. 可在“音色库”添加已有 Voice ID，或选择本地 WAV / MP3 / M4A 创建新音色。
4. 新建项目，直接输入 Markdown 或导入 `.md` 文件。
5. 工作台会按标题、段落、列表和中文标点自动分段；只重新生成文本 hash 发生变化或标记为需要更新的片段。
6. 生成全部片段后，应用会在本地按原顺序加入分级停顿并拼接为 WAV，完成试听后可以导出。

声音复刻使用百炼官方临时文件上传流程：应用先用 API Key 获取上传 policy，将本地参考音频上传到百炼临时 OSS，取得有效期 48 小时的 `oss://` 地址，再提交 `voice-enrollment / create_voice`。复刻音色的 `target_model` 与后续 TTS 模型必须一致。

## 验证

```powershell
npm run typecheck
npm run build
npm start
```

可手动验证：新建项目 → 输入 Markdown → 检查分段 → 修改一个片段 → 确认其他成功片段仍复用 → 生成 → 完整试听 → 导出 WAV。真实 TTS 调用需要有效的百炼 API Key、Voice ID 和网络连接。

## 官方接口依据

- [非实时语音合成 CosyVoice HTTP API](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)
- [声音复刻 HTTP API](https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api)
- [上传本地文件至临时存储并获取 URL](https://help.aliyun.com/zh/model-studio/get-temporary-file-url/)
