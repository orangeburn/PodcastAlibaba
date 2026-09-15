import { hashText } from "./hash";
import type { Segment } from "./types";

function cleanMarkdownLine(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/^\s*[-*_]{3,}\s*$/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\\([*_#\[\]()])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function pauseFor(text: string, isParagraphEnd: boolean): number {
  if (isParagraphEnd) return 620;
  if (/[。！？!?；;]$/.test(text)) return 320;
  if (/[，、,:：]$/.test(text)) return 135;
  return 220;
}

export function parseMarkdown(markdown: string, previous: Segment[] = []): Segment[] {
  const previousByHash = new Map<string, Segment[]>();
  for (const segment of previous) {
    const matches = previousByHash.get(segment.textHash) ?? [];
    matches.push(segment);
    previousByHash.set(segment.textHash, matches);
  }

  const next: Segment[] = [];
  const paragraphs: string[] = [];
  let currentLines: string[] = [];
  const flushParagraph = () => {
    const value = currentLines.join(" ").trim();
    if (value) paragraphs.push(value);
    currentLines = [];
  };

  let inCodeFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      if (!inCodeFence) flushParagraph();
      continue;
    }
    if (inCodeFence) continue;
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const structuralLine = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/.test(line);
    const cleaned = cleanMarkdownLine(line);
    if (!cleaned) continue;
    if (structuralLine) {
      flushParagraph();
      paragraphs.push(cleaned);
    } else {
      currentLines.push(cleaned);
    }
  }
  flushParagraph();

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = paragraph
      .split(/(?<=[。！？!?；;])\s*/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const paragraphId = `paragraph-${paragraphIndex}`;

    sentences.forEach((text, sentenceIndex) => {
      const textHash = hashText(text);
      const reused = previousByHash.get(textHash)?.shift();
      const isParagraphEnd = sentenceIndex === sentences.length - 1;
      const segment: Segment = reused
        ? {
            id: `segment-${paragraphIndex}-${sentenceIndex}-${textHash}`,
            paragraphId,
            sentenceIndex,
            text,
            textHash,
            pauseMs: pauseFor(text, isParagraphEnd),
            status: reused.status === "success" ? "success" : "needs-update",
            error: undefined,
            updatedAt: reused.updatedAt,
          }
        : {
            id: `segment-${paragraphIndex}-${sentenceIndex}-${textHash}`,
            paragraphId,
            sentenceIndex,
            text,
            textHash,
            pauseMs: pauseFor(text, isParagraphEnd),
            status: "pending",
          };
      next.push(segment);
    });
  });

  return next;
}
