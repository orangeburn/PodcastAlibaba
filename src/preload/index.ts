import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, CloneVoiceInput, GenerateChunkInput, IpcApi, Project, Voice } from "../shared/types";

const api: IpcApi = {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (title?: string) => ipcRenderer.invoke("projects:create", title),
    save: (project: Project) => ipcRenderer.invoke("projects:save", project),
    importMarkdown: () => ipcRenderer.invoke("projects:import-markdown"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  },
  voices: {
    clone: (input: CloneVoiceInput) => ipcRenderer.invoke("voices:clone", input),
    add: (voice: Omit<Voice, "id" | "createdAt" | "source">) => ipcRenderer.invoke("voices:add", voice),
    delete: (id: string) => ipcRenderer.invoke("voices:delete", id),
  },
  audio: {
    chooseReference: () => ipcRenderer.invoke("audio:choose-reference"),
    generate: (input: GenerateChunkInput) => ipcRenderer.invoke("audio:generate", input),
    compose: (project: Project) => ipcRenderer.invoke("audio:compose", project),
    getDataUrl: (audioPath: string) => ipcRenderer.invoke("audio:get-data-url", audioPath),
    export: (audioPath: string) => ipcRenderer.invoke("audio:export", audioPath),
  },
};

contextBridge.exposeInMainWorld("podcastApi", api);
