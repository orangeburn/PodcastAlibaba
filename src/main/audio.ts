import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "../shared/types";
import { projectChunks } from "../shared/generation";
import { LocalStore } from "./store";

interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Buffer;
}

function readWav(buffer: Buffer): WavData {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("音频不是 PCM WAV，无法在本地无损拼接");
  }
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | undefined;
  let data: Buffer | undefined;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      const audioFormat = buffer.readUInt16LE(chunkStart);
      if (audioFormat !== 1) throw new Error("音频不是 PCM WAV，无法在本地无损拼接");
      fmt = {
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }
    if (chunkId === "data") data = buffer.subarray(chunkStart, chunkStart + size);
    offset = chunkStart + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV 文件缺少必要的音频数据");
  return { ...fmt, data };
}

function writeWav(parts: WavData[]): Buffer {
  const first = parts[0];
  const dataLength = parts.reduce((sum, part) => sum + part.data.length, 0);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(first.channels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(first.sampleRate * first.channels * (first.bitsPerSample / 8), 28);
  header.writeUInt16LE(first.channels * (first.bitsPerSample / 8), 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return Buffer.concat([header, ...parts.map((part) => part.data)]);
}

function silence(ms: number, wav: WavData): Buffer {
  const bytesPerSecond = wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
  return Buffer.alloc(Math.round((bytesPerSecond * ms) / 1000));
}

export async function composeProject(store: LocalStore, project: Project): Promise<string> {
  const audioParts: WavData[] = [];
  for (const chunk of projectChunks(project)) {
    if (chunk.status !== "success" || !chunk.audioPath) {
      throw new Error("请先生成全部语义段，再拼接完整音频");
    }
    const wav = readWav(await fs.readFile(chunk.audioPath));
    const previous = audioParts.at(-1);
    if (previous && (previous.sampleRate !== wav.sampleRate || previous.channels !== wav.channels || previous.bitsPerSample !== wav.bitsPerSample)) {
      throw new Error("片段音频格式不一致，无法拼接");
    }
    audioParts.push(wav);
    if (chunk.pauseMs > 0) {
      audioParts.push({ ...wav, data: silence(chunk.pauseMs, wav) });
    }
  }
  if (audioParts.length === 0) throw new Error("当前项目没有可拼接的片段");
  const finalPath = path.join(store.audioDir(project.id), "final.wav");
  await fs.writeFile(finalPath, writeWav(audioParts));
  return finalPath;
}
