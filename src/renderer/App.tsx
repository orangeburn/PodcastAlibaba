import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  FileAudio,
  FileText,
  FolderOpen,
  Headphones,
  LayoutList,
  Library,
  LoaderCircle,
  Menu,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Badge as EasyBadge,
  Button as EasyButton,
  Card as EasyCard,
  Field as EasyField,
  Input as EasyInput,
  Select as EasySelect,
  Textarea as EasyTextarea,
} from "../../easyget-ui/src";
import "../../easyget-ui/src/styles.css";
import { parseMarkdown } from "../shared/parser";
import type { AppSettings, Project, Segment, SegmentStatus, TtsConfig, Voice } from "../shared/types";

type View = "projects" | "studio" | "voices" | "settings";

const EMPTY_SETTINGS: AppSettings = {
  apiKey: "",
  baseUrl: "https://dashscope.aliyuncs.com/api/v1",
  model: "cosyvoice-v3.5-flash",
  voiceId: "",
  instruction: "请用自然、沉稳、清晰的播客口吻讲述，语气亲切，节奏适中。",
  speed: 1,
  volume: 50,
  voices: [],
};

function formatDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusLabel(status: SegmentStatus): string {
  return {
    pending: "待生成",
    generating: "生成中",
    success: "已生成",
    failed: "失败",
    "needs-update": "需要更新",
  }[status];
}

function statusClass(status: SegmentStatus): string {
  return `status status-${status}`;
}

function badgeTone(status: SegmentStatus): "neutral" | "brand" | "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "generating") return "brand";
  if (status === "needs-update") return "warning";
  return "neutral";
}

function projectProgress(project: Project): { done: number; total: number; percent: number } {
  const total = project.segments.length;
  const done = project.segments.filter((segment) => segment.status === "success").length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function App() {
  const [view, setView] = useState<View>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const projectRef = useRef<Project | null>(null);
  const [audioSrc, setAudioSrc] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [manualVoiceOpen, setManualVoiceOpen] = useState(false);

  useEffect(() => {
    void Promise.all([window.podcastApi.projects.list(), window.podcastApi.settings.get()])
      .then(([loadedProjects, loadedSettings]) => {
        setProjects(loadedProjects);
        setSettings(loadedSettings);
        setSettingsDraft(loadedSettings);
      })
      .catch((error: Error) => setNotice({ type: "error", text: error.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    projectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const activeProgress = useMemo(() => (currentProject ? projectProgress(currentProject) : null), [currentProject]);

  function selectProject(project: Project, nextView: View = "studio") {
    setCurrentProject(project);
    projectRef.current = project;
    setView(nextView);
  }

  async function saveProject(project: Project): Promise<Project> {
    const saved = await window.podcastApi.projects.save(project);
    setCurrentProject(saved);
    projectRef.current = saved;
    setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    return saved;
  }

  async function createProject() {
    try {
      const project = await window.podcastApi.projects.create();
      selectProject(project);
      setProjects((items) => [project, ...items]);
      setNotice({ type: "success", text: "已创建新项目，写下你的第一段稿件吧。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "创建项目失败" });
    }
  }

  async function importMarkdown() {
    try {
      const imported = await window.podcastApi.projects.importMarkdown();
      if (!imported) return;
      const project = projectRef.current;
      if (!project) return;
      const next: Project = {
        ...project,
        title: project.title === "未命名 Podcast" ? imported.name : project.title,
        markdown: imported.content,
        segments: parseMarkdown(imported.content, project.segments),
        finalAudioPath: undefined,
      };
      await saveProject(next);
      setNotice({ type: "success", text: `已导入 ${imported.name}.md，并完成自动分段。` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "导入稿件失败" });
    }
  }

  async function updateScript(markdown: string) {
    const project = projectRef.current;
    if (!project) return;
    const next: Project = { ...project, markdown, segments: parseMarkdown(markdown, project.segments), finalAudioPath: undefined };
    setCurrentProject(next);
    projectRef.current = next;
    setProjects((items) => items.map((item) => (item.id === next.id ? next : item)));
    try {
      await saveProject(next);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存稿件失败" });
    }
  }

  async function updateTitle(title: string) {
    const project = projectRef.current;
    if (!project) return;
    const next = { ...project, title };
    setCurrentProject(next);
    projectRef.current = next;
    setProjects((items) => items.map((item) => (item.id === next.id ? next : item)));
    try {
      await saveProject(next);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存标题失败" });
    }
  }

  async function updateTtsConfig(patch: Partial<TtsConfig>) {
    const project = projectRef.current;
    if (!project) return;
    const nextConfig = { ...project.tts, ...patch };
    const changed = JSON.stringify(nextConfig) !== JSON.stringify(project.tts);
    const next: Project = {
      ...project,
      tts: nextConfig,
      voiceId: nextConfig.voiceId,
      finalAudioPath: changed ? undefined : project.finalAudioPath,
      segments: changed
        ? project.segments.map((segment) => (segment.status === "success" ? { ...segment, status: "needs-update" } : segment))
        : project.segments,
    };
    setCurrentProject(next);
    projectRef.current = next;
    setProjects((items) => items.map((item) => (item.id === next.id ? next : item)));
    try {
      await saveProject(next);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存 TTS 配置失败" });
    }
  }

  async function generateSegment(segmentId: string) {
    const project = projectRef.current;
    if (!project) return false;
    const segment = project.segments.find((item) => item.id === segmentId);
    if (!segment) return false;
    setBusy(true);
    const generating: Project = {
      ...project,
      segments: project.segments.map((item) => (item.id === segmentId ? { ...item, status: "generating", error: undefined } : item)),
    };
    await saveProject(generating);
    try {
      const result = await window.podcastApi.audio.generate({
        projectId: project.id,
        segmentId,
        text: segment.text,
        config: project.tts,
      });
      const latest = projectRef.current ?? generating;
      await saveProject({
        ...latest,
        segments: latest.segments.map((item) =>
          item.id === segmentId
            ? { ...item, status: "success", audioPath: result.audioPath, requestId: result.requestId, error: undefined, updatedAt: new Date().toISOString() }
            : item,
        ),
        finalAudioPath: undefined,
      });
      return true;
    } catch (error) {
      const latest = projectRef.current ?? generating;
      await saveProject({
        ...latest,
        segments: latest.segments.map((item) =>
          item.id === segmentId ? { ...item, status: "failed", error: error instanceof Error ? error.message : "生成失败" } : item,
        ),
      });
      setNotice({ type: "error", text: error instanceof Error ? error.message : "生成失败" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function generateAll() {
    const project = projectRef.current;
    if (!project || busy) return;
    const ids = project.segments.filter((segment) => segment.status !== "success").map((segment) => segment.id);
    if (!ids.length) {
      await composeFinal();
      return;
    }
    for (const segmentId of ids) await generateSegment(segmentId);
    const latest = projectRef.current;
    if (latest && latest.segments.length > 0 && latest.segments.every((segment) => segment.status === "success")) {
      await composeFinal();
    }
  }

  async function composeFinal() {
    const project = projectRef.current;
    if (!project || project.segments.length === 0) {
      setNotice({ type: "error", text: "请先输入或导入稿件。" });
      return;
    }
    setBusy(true);
    try {
      const finalPath = await window.podcastApi.audio.compose(project);
      await saveProject({ ...project, finalAudioPath: finalPath });
      setNotice({ type: "success", text: "完整音频已拼接完成，可以试听或导出。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "拼接完整音频失败" });
    } finally {
      setBusy(false);
    }
  }

  async function playAudio(id: string, path?: string) {
    if (!path) return;
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    try {
      const dataUrl = audioSrc[path] ?? (await window.podcastApi.audio.getDataUrl(path));
      setAudioSrc((items) => ({ ...items, [path]: dataUrl }));
      setPlayingId(id);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "读取音频失败" });
    }
  }

  async function saveSettings() {
    try {
      const saved = await window.podcastApi.settings.save(settingsDraft);
      setSettings(saved);
      setNotice({ type: "success", text: "默认 TTS 配置已保存到本机。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存设置失败" });
    }
  }

  async function cloneVoice(input: { name: string; audioPath: string }) {
    try {
      setBusy(true);
      const voice = await window.podcastApi.voices.clone({ config: settingsDraft, ...input });
      const next = { ...settings, voices: [voice, ...settings.voices] };
      setSettings(next);
      setSettingsDraft(next);
      setCloneOpen(false);
      setNotice({ type: "success", text: `音色“${voice.name}”已创建：${voice.voiceId}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "创建音色失败" });
    } finally {
      setBusy(false);
    }
  }

  async function addManualVoice(input: { name: string; voiceId: string; model: string }) {
    try {
      const voice = await window.podcastApi.voices.add(input);
      const next = { ...settings, voices: [voice, ...settings.voices] };
      setSettings(next);
      setSettingsDraft(next);
      setManualVoiceOpen(false);
      setNotice({ type: "success", text: "音色已加入本地音色库。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存音色失败" });
    }
  }

  async function deleteVoice(voice: Voice) {
    if (!window.confirm(`确定从本地音色库移除“${voice.name}”？`)) return;
    try {
      const next = await window.podcastApi.voices.delete(voice.id);
      setSettings(next);
      setSettingsDraft(next);
      setNotice({ type: "success", text: "音色已移除。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "移除音色失败" });
    }
  }

  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={28} /><span>正在打开声稿台…</span></div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><AudioLines size={18} /></div><span>声稿台</span><span className="brand-version">0.1</span></div>
        <div className="workspace-label">PODCAST WORKSPACE</div>
        <nav className="nav-list">
          <NavItem icon={<LayoutList size={17} />} label="项目" active={view === "projects"} onClick={() => setView("projects")} badge={projects.length || undefined} />
          <NavItem icon={<FileText size={17} />} label="工作台" active={view === "studio"} disabled={!currentProject} onClick={() => setView("studio")} />
          <NavItem icon={<Library size={17} />} label="音色库" active={view === "voices"} onClick={() => setView("voices")} />
          <NavItem icon={<SettingsIcon size={17} />} label="设置" active={view === "settings"} onClick={() => setView("settings")} />
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note"><div className="local-note-icon"><Check size={14} /></div><div><strong>本地保存</strong><span>稿件与音频都在本机</span></div></div>
          <div className="sidebar-footer"><CircleHelp size={15} /><span>CosyVoice v3.5</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>声稿台</span><ChevronRight size={14} /><span className="muted">{view === "projects" ? "项目" : view === "studio" ? "工作台" : view === "voices" ? "音色库" : "设置"}</span>{currentProject && view === "studio" && <><ChevronRight size={14} /><span>{currentProject.title || "未命名 Podcast"}</span></>}</div>
          <div className="topbar-actions"><span className="connection-dot" />离线优先 <button className="icon-button"><MoreHorizontal size={18} /></button></div>
        </header>

        {notice && <div className={`toast toast-${notice.type}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><X size={15} /></button></div>}

        {view === "projects" && <ProjectsPage projects={projects} onCreate={createProject} onOpen={selectProject} />}
        {view === "studio" && currentProject && <StudioPage project={currentProject} progress={activeProgress!} voices={settings.voices} busy={busy} audioSrc={audioSrc} playingId={playingId} onTitleChange={updateTitle} onScriptChange={updateScript} onImport={importMarkdown} onConfigChange={updateTtsConfig} onPlay={playAudio} onGenerate={generateSegment} onGenerateAll={generateAll} onCompose={composeFinal} onExport={async () => { if (currentProject.finalAudioPath) { const output = await window.podcastApi.audio.export(currentProject.finalAudioPath); if (output) setNotice({ type: "success", text: `已导出到 ${output}` }); } }} />}
        {view === "voices" && <VoicesPage voices={settings.voices} onClone={() => setCloneOpen(true)} onAdd={() => setManualVoiceOpen(true)} onDelete={deleteVoice} />}
        {view === "settings" && <SettingsPage settings={settingsDraft} onChange={(patch) => setSettingsDraft((current) => ({ ...current, ...patch }))} onSave={saveSettings} />}
      </main>

      {cloneOpen && <CloneVoiceModal busy={busy} onClose={() => setCloneOpen(false)} onSubmit={cloneVoice} />}
      {manualVoiceOpen && <ManualVoiceModal onClose={() => setManualVoiceOpen(false)} onSubmit={addManualVoice} />}
    </div>
  );
}

function NavItem({ icon, label, active, disabled, badge, onClick }: { icon: React.ReactNode; label: string; active: boolean; disabled?: boolean; badge?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}</button>;
}

function ProjectsPage({ projects, onCreate, onOpen }: { projects: Project[]; onCreate: () => void; onOpen: (project: Project) => void }) {
  return <div className="page page-projects"><div className="page-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h1>项目</h1><p>每一期 Podcast 都是一个独立的声音工作空间。</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} />新建项目</button></div>
    {projects.length === 0 ? <div className="empty-state"><div className="empty-art"><Mic2 size={30} /></div><h2>从第一期开始</h2><p>新建一个项目，粘贴或导入你的 Markdown 稿件。</p><button className="secondary-button" onClick={onCreate}><Plus size={16} />新建 Podcast 项目</button></div> : <div className="project-grid">{projects.map((project) => { const progress = projectProgress(project); return <button className="project-card" key={project.id} onClick={() => onOpen(project)}><div className="project-card-top"><div className="project-icon"><Headphones size={18} /></div><span className="project-menu"><MoreHorizontal size={16} /></span></div><div className="project-card-title">{project.title || "未命名 Podcast"}</div><div className="project-meta"><span>{formatDate(project.updatedAt)}</span><span>{progress.total ? `${progress.done}/${progress.total} 段` : "尚未分段"}</span></div><div className="progress-track"><div className="progress-value" style={{ width: `${progress.percent}%` }} /></div><div className="project-card-foot"><span>{progress.total ? `${progress.percent}% 已生成` : "开始编辑"}</span><ChevronRight size={15} /></div></button>; })}</div>}
  </div>;
}

function StudioPage({ project, progress, voices, busy, audioSrc, playingId, onTitleChange, onScriptChange, onImport, onConfigChange, onPlay, onGenerate, onGenerateAll, onCompose, onExport }: { project: Project; progress: { done: number; total: number; percent: number }; voices: Voice[]; busy: boolean; audioSrc: Record<string, string>; playingId: string | null; onTitleChange: (value: string) => void; onScriptChange: (value: string) => void; onImport: () => void; onConfigChange: (patch: Partial<TtsConfig>) => void; onPlay: (id: string, path?: string) => void; onGenerate: (id: string) => void; onGenerateAll: () => void; onCompose: () => void; onExport: () => void }) {
  const [localScript, setLocalScript] = useState(project.markdown);
  const [localTitle, setLocalTitle] = useState(project.title);
  useEffect(() => setLocalScript(project.markdown), [project.id, project.markdown]);
  useEffect(() => setLocalTitle(project.title), [project.id, project.title]);
  const readyForCompose = progress.total > 0 && progress.done === progress.total;

  function commitScript() { if (localScript !== project.markdown) onScriptChange(localScript); }
  function commitTitle() { if (localTitle !== project.title) onTitleChange(localTitle); }

  return <div className="page page-studio"><div className="studio-heading"><div className="studio-title-wrap"><button className="back-button" title="回到项目列表"><FolderOpen size={17} /></button><div><input className="title-input" value={localTitle} onChange={(event) => setLocalTitle(event.target.value)} onBlur={commitTitle} /><div className="saved-line"><span className="saved-dot" />自动保存 · 本地项目</div></div></div><div className="studio-actions"><button className="secondary-button small" onClick={onImport}><Upload size={15} />导入 .md</button><button className="primary-button small" onClick={onGenerateAll} disabled={busy || progress.total === 0}><Sparkles size={15} />{busy ? "生成中…" : "生成全部"}</button></div></div>
    <div className="studio-layout"><section className="script-panel panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE SCRIPT</span><h2>Markdown 稿件</h2></div><span className="panel-count">{localScript.length.toLocaleString()} 字</span></div><textarea className="script-editor" value={localScript} onChange={(event) => setLocalScript(event.target.value)} onBlur={commitScript} placeholder={'从这里开始写你的稿件…\n\n支持 Markdown 标题、段落、列表与链接。生成前会自动清理格式，但会保留结构进行分段。'} spellCheck={false} /><div className="editor-footer"><span><FileText size={14} />内容是项目唯一稿件源</span><button className="text-button" onClick={commitScript}><Save size={14} />保存稿件</button></div></section>
      <section className="segments-panel"><div className="panel-header segments-header"><div><span className="panel-kicker">VOICE TIMELINE</span><h2>分段结果 <span className="count-pill">{progress.total}</span></h2></div><div className="segment-progress"><span>{progress.done}/{progress.total} 已生成</span><div className="mini-progress"><div style={{ width: `${progress.percent}%` }} /></div></div></div>{project.segments.length === 0 ? <div className="segments-empty"><div className="empty-lines"><span /><span /><span /></div><p>输入稿件后将自动解析成适合 TTS 的语义片段。</p></div> : <div className="segment-list">{project.segments.map((segment, index) => <SegmentRow key={segment.id} segment={segment} index={index} audioSrc={audioSrc[segment.audioPath ?? ""]} playing={playingId === segment.id} busy={busy} onPlay={onPlay} onGenerate={onGenerate} />)}</div>}</section></div>
    <div className="bottom-dock"><div className="dock-config"><div className="dock-label"><SlidersHorizontal size={15} /><span>TTS 配置</span></div><select value={project.tts.voiceId} onChange={(event) => onConfigChange({ voiceId: event.target.value })}><option value="">选择音色…</option>{voices.map((voice) => <option key={voice.id} value={voice.voiceId}>{voice.name} · {voice.model}</option>)}</select><div className="voice-id-field"><span>Voice ID</span><input value={project.tts.voiceId} onChange={(event) => onConfigChange({ voiceId: event.target.value })} placeholder="手动填写" /></div><label className="compact-control"><span>语速</span><input type="number" min="0.5" max="2" step="0.05" value={project.tts.speed} onChange={(event) => onConfigChange({ speed: Number(event.target.value) })} /></label><label className="compact-control"><span>音量</span><input type="number" min="0" max="100" step="1" value={project.tts.volume} onChange={(event) => onConfigChange({ volume: Number(event.target.value) })} /></label></div><div className="dock-output">{project.finalAudioPath && audioSrc[project.finalAudioPath] ? <audio controls src={audioSrc[project.finalAudioPath]} /> : project.finalAudioPath ? <button className="secondary-button" disabled={busy} onClick={() => onPlay("final", project.finalAudioPath)}><Play size={15} />完整试听</button> : <button className="secondary-button" disabled={!readyForCompose || busy} onClick={onCompose}>{readyForCompose ? <><Play size={15} />生成完整试听</> : "完成全部片段后试听"}</button>}<button className="export-button" disabled={!project.finalAudioPath || busy} onClick={onExport}><FileAudio size={16} />导出 WAV</button></div></div>
  </div>;
}

function SegmentRow({ segment, index, audioSrc, playing, busy, onPlay, onGenerate }: { segment: Segment; index: number; audioSrc?: string; playing: boolean; busy: boolean; onPlay: (id: string, path?: string) => void; onGenerate: (id: string) => void }) {
  return <article className={`segment-row ${segment.status === "generating" ? "segment-generating" : ""}`}><div className="segment-index">{String(index + 1).padStart(2, "0")}</div><div className="segment-body"><div className="segment-topline"><EasyBadge className={statusClass(segment.status)} tone={badgeTone(segment.status)}>{segment.status === "generating" && <LoaderCircle size={11} className="spin" />}{statusLabel(segment.status)}</EasyBadge><span className="segment-pause">停顿 {segment.pauseMs}ms</span></div><p>{segment.text}</p>{segment.error && <div className="segment-error">{segment.error}</div>}{playing && audioSrc && <audio className="segment-audio" controls autoPlay src={audioSrc} />}</div><div className="segment-actions"><button className="round-button" disabled={!segment.audioPath || segment.status !== "success"} onClick={() => onPlay(segment.id, segment.audioPath)} title="试听">{playing ? <Pause size={15} /> : <Play size={15} />}</button><button className="round-button" disabled={busy || segment.status === "generating"} onClick={() => onGenerate(segment.id)} title="重新生成"><RefreshCw size={15} /></button></div></article>;
}

function VoicesPage({ voices, onClone, onAdd, onDelete }: { voices: Voice[]; onClone: () => void; onAdd: () => void; onDelete: (voice: Voice) => void }) {
  return <div className="page page-library"><div className="page-heading"><div><div className="eyebrow">VOICE LIBRARY</div><h1>音色库</h1><p>管理本机保存的音色，跨项目复用。</p></div><div className="heading-actions"><button className="secondary-button" onClick={onAdd}><Plus size={16} />添加已有音色</button><button className="primary-button" onClick={onClone}><WandSparkles size={16} />创建新音色</button></div></div><div className="info-banner"><div className="info-banner-icon"><Upload size={17} /></div><div><strong>CosyVoice 声音复刻</strong><p>选择一段 10–20 秒的清晰参考音频，应用会通过百炼临时文件上传流程完成复刻，不需要你手动处理公网 URL。</p></div></div>{voices.length === 0 ? <div className="empty-state library-empty"><div className="empty-art"><Volume2 size={30} /></div><h2>还没有本地音色</h2><p>先添加一个已有 Voice ID，或从本地参考音频创建音色。</p><button className="secondary-button" onClick={onClone}><WandSparkles size={16} />创建我的第一个音色</button></div> : <div className="voice-grid">{voices.map((voice) => <div className="voice-card" key={voice.id}><div className="voice-card-top"><div className="voice-symbol"><Mic2 size={18} /></div><button className="icon-button subtle" onClick={() => onDelete(voice)} title="从本地移除"><Trash2 size={15} /></button></div><h3>{voice.name}</h3><p className="voice-id">{voice.voiceId}</p><div className="voice-card-foot"><span>{voice.source === "cloned" ? "已复刻" : "手动添加"}</span><span>{voice.model}</span></div></div>)}</div>}</div>;
}

function SettingsPage({ settings, onChange, onSave }: { settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void; onSave: () => void }) {
  return <div className="page page-settings"><div className="page-heading"><div><div className="eyebrow">LOCAL CONFIGURATION</div><h1>设置</h1><p>配置百炼 CosyVoice，凭证只保存在当前 Windows 用户的本地数据目录。</p></div><button className="primary-button" onClick={onSave}><Save size={16} />保存设置</button></div><div className="settings-layout"><section className="settings-card panel"><div className="panel-header"><div><span className="panel-kicker">ALIYUN MODEL STUDIO</span><h2>API 连接</h2></div><span className="secure-label"><Check size={13} />本地保存</span></div><div className="form-grid"><FormField label="API Key" hint="不会写入源码或 Git"><input type="password" value={settings.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} placeholder="sk-…" autoComplete="off" /></FormField><FormField label="Model"><input value={settings.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="cosyvoice-v3.5-flash" /></FormField><FormField label="API Endpoint / Base URL" hint="可填专属业务空间地址"><input value={settings.baseUrl} onChange={(event) => onChange({ baseUrl: event.target.value })} placeholder="https://dashscope.aliyuncs.com/api/v1" /></FormField><FormField label="默认 Voice ID" hint="CosyVoice v3.5 需要复刻或设计音色"><input value={settings.voiceId} onChange={(event) => onChange({ voiceId: event.target.value })} placeholder="例如：cosyvoice-v3.5-flash-…" /></FormField></div></section><section className="settings-card panel"><div className="panel-header"><div><span className="panel-kicker">PODCAST VOICE</span><h2>表达控制</h2></div><AudioLines size={19} className="panel-icon" /></div><FormField label="Instruction" hint="随每个 TTS 请求发送，不超过模型限制"><textarea className="instruction-input" value={settings.instruction} onChange={(event) => onChange({ instruction: event.target.value })} rows={3} placeholder="请用自然、沉稳的播客口吻讲述…" /></FormField><div className="range-grid"><label className="range-field"><span>语速 <output>{settings.speed.toFixed(2)}×</output></span><input type="range" min="0.5" max="2" step="0.05" value={settings.speed} onChange={(event) => onChange({ speed: Number(event.target.value) })} /></label><label className="range-field"><span>音量 <output>{settings.volume.toFixed(0)} / 100</output></span><input type="range" min="0" max="100" step="1" value={settings.volume} onChange={(event) => onChange({ volume: Number(event.target.value) })} /></label></div></section></div><div className="settings-footnote"><CircleHelp size={15} /><span>默认配置只影响新建项目；已打开项目会保存自己的 TTS 配置。</span></div></div>;
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const controls = React.Children.map(children, (child) => {
    if (!React.isValidElement(child) || typeof child.type !== "string") return child;
    if (child.type === "input") return <EasyInput {...(child.props as React.ComponentProps<"input">)} />;
    if (child.type === "select") return <EasySelect {...(child.props as React.ComponentProps<"select">)} />;
    if (child.type === "textarea") return <EasyTextarea {...(child.props as React.ComponentProps<"textarea">)} />;
    return child;
  });
  return <EasyField label={label} hint={hint} className="form-field">{controls}</EasyField>;
}

function CloneVoiceModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: { name: string; audioPath: string }) => void }) {
  const [name, setName] = useState("");
  const [audioPath, setAudioPath] = useState("");
  const [choosing, setChoosing] = useState(false);
  async function choose() { setChoosing(true); try { const path = await window.podcastApi.audio.chooseReference(); if (path) setAudioPath(path); } finally { setChoosing(false); } }
  return <Modal title="创建新音色" subtitle="CosyVoice v3.5 · 声音复刻" onClose={onClose}><div className="modal-form"><FormField label="音色名称"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：夜航主播" /></FormField><div className="file-drop" onClick={choose}><div className="file-drop-icon"><FileAudio size={20} /></div><div><strong>{audioPath ? audioPath.split(/[\\/]/).pop() : "选择参考音频"}</strong><span>{audioPath ? "已选择本地文件" : "WAV / MP3 / M4A · 建议 10–20 秒"}</span></div><button className="secondary-button small" type="button" disabled={choosing}>{choosing ? "选择中…" : "浏览"}</button></div><div className="modal-tip"><Sparkles size={14} />应用会用百炼官方临时上传接口取得 48 小时有效的 `oss://` 地址，并立即提交声音复刻。</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy || !name.trim() || !audioPath} onClick={() => onSubmit({ name: name.trim(), audioPath })}>{busy ? <><LoaderCircle size={15} className="spin" />创建中…</> : <><WandSparkles size={15} />开始复刻</>}</button></div></div></Modal>;
}

function ManualVoiceModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { name: string; voiceId: string; model: string }) => void }) {
  const [name, setName] = useState(""); const [voiceId, setVoiceId] = useState(""); const [model, setModel] = useState("cosyvoice-v3.5-flash");
  return <Modal title="添加已有音色" subtitle="保存到本机音色库" onClose={onClose}><div className="modal-form"><FormField label="名称"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：官方女声" /></FormField><FormField label="Voice ID"><input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="输入百炼 Voice ID" /></FormField><FormField label="对应模型"><input value={model} onChange={(event) => setModel(event.target.value)} /></FormField><div className="modal-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!name.trim() || !voiceId.trim()} onClick={() => onSubmit({ name: name.trim(), voiceId: voiceId.trim(), model: model.trim() })}><Plus size={15} />加入音色库</button></div></div></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><EasyCard className="modal" padding="lg"><div className="modal-header"><div><span className="panel-kicker">{subtitle}</span><h2>{title}</h2></div><EasyButton variant="ghost" size="sm" className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></EasyButton></div>{children}</EasyCard></div>; }

export default App;
