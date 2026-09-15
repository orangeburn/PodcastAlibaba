import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings, CloneVoiceInput, GenerateChunkInput, Project, Voice } from "../shared/types";
import { composeProject } from "./audio";
import { AliyunCosyVoiceProvider } from "./aliyunProvider";
import { LocalStore } from "./store";

const store = new LocalStore();
const provider = new AliyunCosyVoiceProvider(store);

function registerIpc(): void {
  ipcMain.handle("projects:list", () => store.listProjects());
  ipcMain.handle("projects:create", async (_event, title?: string) => {
    return store.createProject(title ?? "", await store.getSettings());
  });
  ipcMain.handle("projects:save", (_event, project: Project) => store.saveProject(project));
  ipcMain.handle("projects:import-markdown", async () => {
    const result = await dialog.showOpenDialog({
      title: "导入 Markdown 稿件",
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, name: path.basename(filePath, path.extname(filePath)), content: await fs.readFile(filePath, "utf8") };
  });

  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:save", (_event, settings: AppSettings) => store.saveSettings(settings));
  ipcMain.handle("voices:add", (_event, input: Omit<Voice, "id" | "createdAt" | "source">) => store.addVoice(input, "manual"));
  ipcMain.handle("voices:delete", (_event, id: string) => store.deleteVoice(id));
  ipcMain.handle("voices:clone", (_event, input: CloneVoiceInput) => provider.cloneVoice(input));

  ipcMain.handle("audio:choose-reference", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择参考音频",
      properties: ["openFile"],
      filters: [{ name: "音频", extensions: ["wav", "mp3", "m4a"] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("audio:generate", (_event, input: GenerateChunkInput) => provider.synthesize(input));
  ipcMain.handle("audio:compose", (_event, project: Project) => composeProject(store, project));
  ipcMain.handle("audio:get-data-url", async (_event, audioPath: string) => {
    const buffer = await fs.readFile(audioPath);
    return `data:audio/wav;base64,${buffer.toString("base64")}`;
  });
  ipcMain.handle("audio:export", async (_event, audioPath: string) => {
    const result = await dialog.showSaveDialog({
      title: "导出完整音频",
      defaultPath: path.basename(audioPath),
      filters: [{ name: "WAV 音频", extensions: ["wav"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.copyFile(audioPath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle("audio:open", (_event, audioPath: string) => shell.openPath(audioPath));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f6f3ee",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => {
  await store.init();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
