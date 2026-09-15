import { hashText } from "./hash";
import { parseMarkdown } from "./parser";
import type { GenerationChunk, Project, Segment, SegmentStatus } from "./types";

/**
 * Keep the existing conservative request size used by the app. Chunks may
 * exceed this value when a single sentence itself is longer than the limit,
 * because splitting inside a sentence would break the requested semantics.
 */
export const COSYVOICE_TEXT_LIMIT = 220;

function legacyParagraphId(segment: Segment, fallbackIndex: number): string {
  if (segment.paragraphId) return segment.paragraphId;
  const match = segment.id.match(/^segment-(\d+)-/);
  return match ? `paragraph-${match[1]}` : `paragraph-${fallbackIndex}`;
}

function chunkText(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function statusAfterTextChange(previous?: GenerationChunk): SegmentStatus {
  return previous ? "needs-update" : "pending";
}

function recoveredStatus(previous: GenerationChunk): SegmentStatus {
  return previous.status === "generating" ? "needs-update" : previous.status;
}

/**
 * Plan generation units from sentence-level segments. Sentence boundaries are
 * the only legal split points; a paragraph that fits stays one chunk.
 */
export function buildGenerationChunks(segments: Segment[], previous: GenerationChunk[] = []): GenerationChunk[] {
  const previousById = new Map(previous.map((chunk) => [chunk.id, chunk]));
  const chunks: GenerationChunk[] = [];
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
      const id = `chunk-${paragraphId}-${chunkIndex}`;
      const oldChunk = previousById.get(id);
      const unchanged = oldChunk?.textHash === textHash;
      const status = unchanged ? recoveredStatus(oldChunk) : statusAfterTextChange(oldChunk);

      chunks.push({
        id,
        paragraphId,
        segmentIds: chunkSegments.map((segment) => segment.id),
        text,
        textHash,
        pauseMs: chunkSegments.at(-1)?.pauseMs ?? 0,
        status: unchanged && status === "success" && !oldChunk?.audioPath ? "needs-update" : status,
        audioPath: unchanged ? oldChunk.audioPath : undefined,
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
  return project.generationChunks ?? buildGenerationChunks(project.segments);
}

/** Upgrade projects created by the sentence-audio version of the app. */
export function normalizeProject(project: Project): Project {
  const segments = project.markdown ? parseMarkdown(project.markdown, project.segments) : [];
  const chunks = buildGenerationChunks(segments, project.generationChunks ?? []);
  const syncedSegments = syncSegmentStatuses(segments, chunks);
  const hasCompleteAudio = chunks.length > 0 && chunks.every((chunk) => chunk.status === "success" && Boolean(chunk.audioPath));

  return {
    ...project,
    segments: syncedSegments,
    generationChunks: chunks,
    finalAudioPath: hasCompleteAudio ? project.finalAudioPath : undefined,
  };
}
