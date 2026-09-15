import fs from "node:fs/promises";
import path from "node:path";
import { assertValidChunkId } from "../shared/generation";
import type { CloneVoiceInput, GenerateChunkInput, TtsConfig, Voice } from "../shared/types";
import { LocalStore } from "./store";

interface ApiErrorBody {
  code?: string;
  message?: string;
  request_id?: string;
}

function endpoint(baseUrl: string, servicePath: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.endsWith(servicePath)) return base;
  return `${base}${servicePath}`;
}

function apiHeaders(apiKey: string, useOssResource = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  };
  if (useOssResource) headers["X-DashScope-OssResourceResolve"] = "enable";
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let body: (T & ApiErrorBody) | ApiErrorBody;
  try {
    body = JSON.parse(raw) as T & ApiErrorBody;
  } catch {
    throw new Error(`百炼返回了无法解析的响应（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    throw new Error(`百炼 API 请求失败（${response.status}）：${errorBody.message ?? errorBody.code ?? raw}`);
  }
  return body as T;
}

function validateConnection(config: TtsConfig): void {
  if (!config.apiKey.trim()) throw new Error("请先在设置中填写百炼 API Key");
  if (!config.baseUrl.trim()) throw new Error("请先在设置中填写 API Base URL");
  if (!config.model.trim()) throw new Error("请先在设置中填写模型名称");
}

function validateConfig(config: TtsConfig): void {
  validateConnection(config);
  if (!config.voiceId.trim()) throw new Error("请先选择或填写 Voice ID");
}

export class AliyunCosyVoiceProvider {
  constructor(private readonly store: LocalStore) {}

  async synthesize(input: GenerateChunkInput): Promise<{ audioPath: string; requestId?: string }> {
    assertValidChunkId(input.chunkId);
    validateConfig(input.config);
    const body = {
      model: input.config.model,
      input: {
        text: input.text,
        voice: input.config.voiceId,
        format: "wav",
        sample_rate: 24000,
        instruction: input.config.instruction.trim() || undefined,
        rate: input.config.speed,
        volume: input.config.volume,
      },
    };
    const response = await fetch(endpoint(input.config.baseUrl, "/services/audio/tts/SpeechSynthesizer"), {
      method: "POST",
      headers: apiHeaders(input.config.apiKey),
      body: JSON.stringify(body),
    });
    const result = await parseResponse<{
      request_id?: string;
      output?: { audio?: { url?: string } };
    }>(response);
    const audioUrl = result.output?.audio?.url;
    if (!audioUrl) throw new Error("百炼响应中没有音频 URL");

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error(`音频下载失败（HTTP ${audioResponse.status}）`);
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const targetDir = this.store.audioDir(input.projectId);
    await fs.mkdir(targetDir, { recursive: true });
    const audioPath = path.join(targetDir, `${input.chunkId}.wav`);
    await fs.writeFile(audioPath, audioBuffer);
    return { audioPath, requestId: result.request_id };
  }

  async cloneVoice(input: CloneVoiceInput): Promise<Voice> {
    validateConnection(input.config);
    const fileUrl = await this.uploadTemporaryAudio(input.config, input.audioPath);
    const prefix = input.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "podcast";
    const response = await fetch(endpoint(input.config.baseUrl, "/services/audio/tts/customization"), {
      method: "POST",
      headers: apiHeaders(input.config.apiKey, fileUrl.startsWith("oss://")),
      body: JSON.stringify({
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: input.config.model,
          prefix,
          url: fileUrl,
          language_hints: ["zh"],
        },
      }),
    });
    const result = await parseResponse<{ output?: { voice_id?: string } }>(response);
    const voiceId = result.output?.voice_id;
    if (!voiceId) throw new Error("音色复刻响应中没有 voice_id");
    return this.store.addVoice({ name: input.name.trim() || prefix, voiceId, model: input.config.model }, "cloned");
  }

  private async uploadTemporaryAudio(config: TtsConfig, audioPath: string): Promise<string> {
    const fileName = path.basename(audioPath);
    const uploadEndpoint = endpoint(config.baseUrl, "/uploads");
    const policyResponse = await fetch(`${uploadEndpoint}?action=getPolicy&model=${encodeURIComponent(config.model)}`, {
      method: "GET",
      headers: apiHeaders(config.apiKey),
    });
    const policy = await parseResponse<{
      data?: {
        policy: string;
        signature: string;
        upload_dir: string;
        upload_host: string;
        oss_access_key_id: string;
        x_oss_object_acl: string;
        x_oss_forbid_overwrite: string;
      };
    }>(policyResponse);
    if (!policy.data) throw new Error("获取百炼临时上传凭证失败");

    const key = `${policy.data.upload_dir}/${fileName}`;
    const form = new FormData();
    form.append("OSSAccessKeyId", policy.data.oss_access_key_id);
    form.append("Signature", policy.data.signature);
    form.append("policy", policy.data.policy);
    form.append("x-oss-object-acl", policy.data.x_oss_object_acl);
    form.append("x-oss-forbid-overwrite", policy.data.x_oss_forbid_overwrite);
    form.append("key", key);
    form.append("success_action_status", "200");
    const bytes = await fs.readFile(audioPath);
    form.append("file", new Blob([bytes]), fileName);
    const uploadResponse = await fetch(policy.data.upload_host, { method: "POST", body: form });
    if (!uploadResponse.ok) throw new Error(`参考音频临时上传失败（HTTP ${uploadResponse.status}）`);
    return `oss://${key}`;
  }
}
