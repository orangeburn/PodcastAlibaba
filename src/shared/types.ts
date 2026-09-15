export type SegmentStatus = "pending" | "generating" | "success" | "failed" | "needs-update";

export interface TtsConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  voiceId: string;
  instruction: string;
  speed: number;
  volume: number;
}

export interface Segment {
  id: string;
  /** Added in the generation-chunk format; absent in legacy project files. */
  paragraphId?: string;
  sentenceIndex?: number;
  text: string;
  textHash: string;
  pauseMs: number;
  status: SegmentStatus;
  /** @deprecated Sentence audio is no longer used by the generation model. */
  audioPath?: string;
  /** @deprecated Request metadata now belongs to GenerationChunk. */
  requestId?: string;
  error?: string;
  updatedAt?: string;
}

export interface GenerationChunk {
  /** Stable identity of the smallest generated audio asset. */
  chunkId: string;
  /** @deprecated Generation chunks before the identity migration used `id`. */
  id?: string;
  paragraphId: string;
  segmentIds: string[];
  text: string;
  textHash: string;
  pauseMs: number;
  status: SegmentStatus;
  /** Monotonically increases whenever this chunk is regenerated. */
  generation: number;
  audioPath?: string;
  requestId?: string;
  error?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  title: string;
  markdown: string;
  segments: Segment[];
  generationChunks?: GenerationChunk[];
  tts: TtsConfig;
  voiceId: string;
  finalAudioPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Voice {
  id: string;
  name: string;
  voiceId: string;
  model: string;
  createdAt: string;
  source: "manual" | "cloned";
}

export interface AppSettings extends TtsConfig {
  voices: Voice[];
}

export interface GenerateChunkInput {
  projectId: string;
  chunkId: string;
  text: string;
  config: TtsConfig;
}

/** @deprecated Use GenerateChunkInput. */
export type GenerateSegmentInput = GenerateChunkInput;

export interface CloneVoiceInput {
  config: TtsConfig;
  audioPath: string;
  name: string;
}

export interface IpcApi {
  projects: {
    list: () => Promise<Project[]>;
    create: (title?: string) => Promise<Project>;
    save: (project: Project) => Promise<Project>;
    importMarkdown: () => Promise<{ path: string; name: string; content: string } | null>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<AppSettings>;
  };
  voices: {
    clone: (input: CloneVoiceInput) => Promise<Voice>;
    add: (voice: Omit<Voice, "id" | "createdAt" | "source">) => Promise<Voice>;
    delete: (id: string) => Promise<AppSettings>;
  };
  audio: {
    chooseReference: () => Promise<string | null>;
    generate: (input: GenerateChunkInput) => Promise<{ audioPath: string; requestId?: string }>;
    compose: (project: Project) => Promise<string>;
    getDataUrl: (audioPath: string) => Promise<string>;
    export: (audioPath: string) => Promise<string | null>;
  };
}
