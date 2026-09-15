import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeProject, projectChunks } from "../shared/generation";
import type { AppSettings, Project, TtsConfig, Voice } from "../shared/types";

const defaultTts: TtsConfig = {
  apiKey: "",
  baseUrl: "https://dashscope.aliyuncs.com/api/v1",
  model: "cosyvoice-v3.5-flash",
  voiceId: "",
  instruction: "请用自然、沉稳、清晰的播客口吻讲述，语气亲切，节奏适中。",
  speed: 1,
  volume: 50,
};

const defaultSettings: AppSettings = { ...defaultTts, voices: [] };

export class LocalStore {
  private readonly root: string;
  private readonly projectsRoot: string;
  private readonly settingsPath: string;

  constructor() {
    this.root = path.join(app.getPath("userData"), "podcast-data");
    this.projectsRoot = path.join(this.root, "projects");
    this.settingsPath = path.join(this.root, "settings.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.projectsRoot, { recursive: true });
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const value = JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as Partial<AppSettings>;
      return { ...defaultSettings, ...value, voices: value.voices ?? [] };
    } catch {
      return { ...defaultSettings, voices: [] };
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    await this.init();
    await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }

  async listProjects(): Promise<Project[]> {
    await this.init();
    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true });
    const projects: Project[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const project = JSON.parse(
          await fs.readFile(path.join(this.projectsRoot, entry.name, "project.json"), "utf8"),
        ) as Project;
        projects.push(await this.migrateLoadedProject(project, path.join(this.projectsRoot, entry.name)));
      } catch {
        // Keep a single corrupt project from making the whole project list unusable.
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async migrateLoadedProject(project: Project, projectDir: string): Promise<Project> {
    const preliminary = normalizeProject(project);
    const invalidAudioPaths = await this.findInvalidAudioPaths(preliminary, projectDir);
    const migrated = normalizeProject(project, invalidAudioPaths);
    if (JSON.stringify(project) !== JSON.stringify(migrated)) {
      await this.saveProject(migrated);
    }
    return migrated;
  }

  private async findInvalidAudioPaths(project: Project, projectDir: string): Promise<Set<string>> {
    const invalid = new Set<string>();
    const seen = new Map<string, string[]>();
    for (const chunk of projectChunks(project)) {
      if (typeof chunk.audioPath !== "string" || !chunk.audioPath.trim()) continue;
      const key = chunk.audioPath.replaceAll("\\", "/").toLowerCase();
      const paths = seen.get(key) ?? [];
      paths.push(chunk.audioPath);
      seen.set(key, paths);
      const normalizedPath = chunk.audioPath.toLowerCase();
      if (normalizedPath.includes("undefined.wav") || normalizedPath.includes("null.wav")) invalid.add(chunk.audioPath);
    }
    for (const [key, paths] of seen) {
      if (paths.length > 1) {
        for (const audioPath of paths) invalid.add(audioPath);
        continue;
      }
      const audioPath = paths[0];
      try {
        const stat = await fs.stat(path.isAbsolute(audioPath) ? audioPath : path.resolve(projectDir, audioPath));
        if (!stat.isFile()) invalid.add(audioPath);
      } catch {
        invalid.add(audioPath);
      }
    }
    return invalid;
  }

  async createProject(title: string, settings: AppSettings): Promise<Project> {
    const now = new Date().toISOString();
    const { voices: _voices, ...tts } = settings;
    const project: Project = {
      id: randomUUID(),
      title: title.trim() || "未命名 Podcast",
      markdown: "",
      segments: [],
      generationChunks: [],
      tts,
      voiceId: settings.voiceId,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveProject(project);
    return project;
  }

  async saveProject(project: Project): Promise<Project> {
    await this.init();
    const projectDir = path.join(this.projectsRoot, project.id);
    await fs.mkdir(path.join(projectDir, "audio"), { recursive: true });
    const saved = { ...project, updatedAt: new Date().toISOString() };
    await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(saved, null, 2), "utf8");
    await fs.writeFile(path.join(projectDir, "script.md"), saved.markdown, "utf8");
    return saved;
  }

  projectDir(projectId: string): string {
    return path.join(this.projectsRoot, projectId);
  }

  audioDir(projectId: string): string {
    return path.join(this.projectDir(projectId), "audio");
  }

  async addVoice(input: Omit<Voice, "id" | "createdAt" | "source">, source: Voice["source"]): Promise<Voice> {
    const settings = await this.getSettings();
    const voice: Voice = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), source };
    await this.saveSettings({ ...settings, voices: [voice, ...settings.voices] });
    return voice;
  }

  async deleteVoice(id: string): Promise<AppSettings> {
    const settings = await this.getSettings();
    return this.saveSettings({ ...settings, voices: settings.voices.filter((voice) => voice.id !== id) });
  }
}
