import { hashText } from "./hash";
import { parseMarkdown } from "./parser";
import type { GenerationChunk, Project, Segment, SegmentStatus } from "./types";

/**
 * Keep the existing conservative request size used by the app. Chunks may
 * exceed this value when a single sentence itself is longer than the limit,
 * because splitting inside a sentence would break the requested semantics.
 */
export const COSYVOICE_TEXT_LIMIT = 220;

export function assertValidChunkId(chunkId: unknown): asserts chunkId is string {
  if (typeof chunkId !== "string" || !chunkId.trim() || /^(?:undefined|null)$/i.test(chunkId.trim())) {
    throw new Error("TTS 生成缺少有效的 chunkId");
  }
  if (chunkId !== chunkId.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(chunkId)) {
    throw new Error("TTS 生成收到非法的 chunkId");
  }
}

function legacyParagraphId(segment: Segment, fallbackIndex: number): string {
  if (segment.paragraphId) return segment.paragraphId;
  const match = segment.id.match(/^segment-(\d+)-/);
  return match ? `paragraph-${match[1]}` : `paragraph-${fallbackIndex}`;
}

function chunkText(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function storedChunkId(chunk: GenerationChunk): string | undefined {
  if (typeof chunk.chunkId === "string" && chunk.chunkId.trim()) return chunk.chunkId.trim();
  if (typeof chunk.id === "string" && chunk.id.trim()) return chunk.id.trim();
  return undefined;
}

function storedAudioPath(chunk: GenerationChunk): string | undefined {
  if (typeof chunk.audioPath !== "string" || !chunk.audioPath.trim()) return undefined;
  return chunk.audioPath;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "paragraph";
}

function uniqueChunkId(paragraphId: string, chunkIndex: number, usedIds: Set<string>): string {
  const base = `chunk-${safeIdPart(paragraphId)}-${chunkIndex}`;
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function pathKey(audioPath: string): string {
  return audioPath.replaceAll("\\", "/").toLowerCase();
}

function isKnownInvalidAudioPath(audioPath: string): boolean {
  const normalized = audioPath.toLowerCase();
  return normalized.includes("undefined.wav") || normalized.includes("null.wav");
}

/** Cache identity for a chunk audio asset. The generation prevents stale data URLs after overwrites. */
export function chunkAudioCacheKey(chunk: Pick<GenerationChunk, "chunkId" | "generation" | "audioPath">): string | undefined {
  if (typeof chunk.audioPath !== "string" || !chunk.audioPath.trim()) return undefined;
  return `chunk:${chunk.chunkId}:generation:${chunk.generation ?? 0}:${chunk.audioPath}`;
}

export function finalAudioCacheKey(projectId: string, audioPath: string): string {
  return `final:${projectId}:${audioPath}`;
}

function statusAfterTextChange(previous?: GenerationChunk): SegmentStatus {
  return previous ? "needs-update" : "pending";
}

function recoveredStatus(previous: GenerationChunk | undefined): SegmentStatus {
  return previous?.status === "generating" ? "needs-update" : previous?.status ?? "pending";
}

/**
 * Plan generation units from sentence-level segments. Sentence boundaries are
 * the only legal split points; a paragraph that fits stays one chunk.
 */
export function buildGenerationChunks(segments: Segment[], previous: GenerationChunk[] = []): GenerationChunk[] {
  const previousById = new Map<string, GenerationChunk>();
  for (const chunk of previous) {
    const previousId = storedChunkId(chunk);
    if (previousId) previousById.set(previousId, chunk);
  }
  const chunks: GenerationChunk[] = [];
  const usedChunkIds = new Set<string>();
  let segmentIndex = 0;

  while (segmentIndex < segments.length) {
    const paragraphId = legacyParagraphId(segments[segmentIndex], segmentIndex);
    const paragraphSegments: Segment[] = [];
    while (segmentIndex < segments.length && legacyParagraphId(segments[segmentIndex], segmentIndex) === paragraphId) {
      paragraphSegments.push(segments[segmentIndex]);
      segmentIndex += 1;
    }

    const paragraphChunks: Segment[][] = [];
    let current: Segment[] = [];
    for (const segment of paragraphSegments) {
      const candidate = [...current, segment];
      if (current.length > 0 && chunkText(candidate).length > COSYVOICE_TEXT_LIMIT) {
        paragraphChunks.push(current);
        current = [segment];
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) paragraphChunks.push(current);

    paragraphChunks.forEach((chunkSegments, chunkIndex) => {
      const text = chunkText(chunkSegments);
      const textHash = hashText(text);
      const chunkId = uniqueChunkId(paragraphId, chunkIndex, usedChunkIds);
      usedChunkIds.add(chunkId);
      const oldChunk = previousById.get(chunkId);
      const unchanged = oldChunk?.textHash === textHash;
      const status = unchanged ? recoveredStatus(oldChunk) : statusAfterTextChange(oldChunk);
      const oldGeneration = Number.isInteger(oldChunk?.generation) && (oldChunk?.generation ?? 0) >= 0 ? oldChunk!.generation : 0;

      chunks.push({
        chunkId,
        paragraphId,
        segmentIds: chunkSegments.map((segment) => segment.id),
        text,
        textHash,
        pauseMs: chunkSegments.at(-1)?.pauseMs ?? 0,
        status: unchanged && status === "success" && !storedAudioPath(oldChunk) ? "needs-update" : status,
        generation: unchanged ? oldGeneration : oldChunk ? oldGeneration + 1 : 0,
        audioPath: unchanged ? storedAudioPath(oldChunk) : undefined,
        requestId: unchanged ? oldChunk.requestId : undefined,
        error: unchanged ? oldChunk.error : undefined,
        updatedAt: unchanged ? oldChunk.updatedAt : undefined,
      });
    });
  }

  return chunks;
}

/** Make sentence rows reflect the state of the chunk that generates them. */
export function syncSegmentStatuses(segments: Segment[], chunks: GenerationChunk[]): Segment[] {
  const chunkBySegmentId = new Map<string, GenerationChunk>();
  for (const chunk of chunks) {
    for (const segmentId of chunk.segmentIds) chunkBySegmentId.set(segmentId, chunk);
  }

  return segments.map((segment) => {
    const chunk = chunkBySegmentId.get(segment.id);
    if (!chunk) return segment;
    return { ...segment, status: chunk.status, error: chunk.error };
  });
}

export function markGenerationChunksStale(chunks: GenerationChunk[]): GenerationChunk[] {
  return chunks.map((chunk) => {
    if (chunk.status !== "success" && chunk.status !== "generating") return chunk;
    return { ...chunk, status: "needs-update", audioPath: undefined, requestId: undefined, error: undefined };
  });
}

export function projectChunks(project: Project): GenerationChunk[] {
  return buildGenerationChunks(project.segments, project.generationChunks ?? []);
}

/**
 * Upgrade projects created by the sentence-audio version of the app and
 * invalidate any chunk audio that cannot be safely identified or loaded.
 */
export function normalizeProject(project: Project, invalidAudioPaths: ReadonlySet<string> = new Set()): Project {
  const segments = project.markdown ? parseMarkdown(project.markdown, project.segments) : [];
  const chunks = buildGenerationChunks(segments, project.generationChunks ?? []);
  const pathsToChunks = new Map<string, GenerationChunk[]>();
  const invalidChunkIds = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk.audioPath) continue;
    const key = pathKey(chunk.audioPath);
    const samePathChunks = pathsToChunks.get(key) ?? [];
    samePathChunks.push(chunk);
    pathsToChunks.set(key, samePathChunks);
    if (isKnownInvalidAudioPath(chunk.audioPath) || invalidAudioPaths.has(chunk.audioPath) || invalidAudioPaths.has(key)) {
      invalidChunkIds.add(chunk.chunkId);
    }
  }
  for (const samePathChunks of pathsToChunks.values()) {
    if (samePathChunks.length > 1) {
      for (const chunk of samePathChunks) invalidChunkIds.add(chunk.chunkId);
    }
  }

  const migratedChunks = chunks.map((chunk) =>
    invalidChunkIds.has(chunk.chunkId)
      ? { ...chunk, status: "needs-update" as const, audioPath: undefined, requestId: undefined, error: undefined }
      : chunk,
  );
  const syncedSegments = syncSegmentStatuses(segments, migratedChunks);
  const hasCompleteAudio = migratedChunks.length > 0 && migratedChunks.every((chunk) => chunk.status === "success" && Boolean(chunk.audioPath));

  return {
    ...project,
    segments: syncedSegments,
    generationChunks: migratedChunks,
    finalAudioPath: hasCompleteAudio ? project.finalAudioPath : undefined,
  };
}
