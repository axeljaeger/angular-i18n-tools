export const localizationSemanticTokenTypes = ["namespace", "string", "variable"] as const;

export type LocalizationSemanticTokenType = (typeof localizationSemanticTokenTypes)[number];

export interface LocalizationSemanticToken {
  line: number;
  character: number;
  length: number;
  tokenType: LocalizationSemanticTokenType;
}

interface MetadataSegment {
  start: number;
  length: number;
  tokenType: LocalizationSemanticTokenType;
}

export function getLocalizationSemanticTokens(text: string, languageId: string): LocalizationSemanticToken[] {
  const lineStarts = getLineStarts(text);
  const segments =
    languageId === "html" ? getTemplateMetadataSegments(text) : languageId === "typescript" ? getLocalizeMetadataSegments(text) : [];

  return segments
    .flatMap((segment) => toSemanticTokens(text, lineStarts, segment))
    .sort((left, right) => left.line - right.line || left.character - right.character || left.length - right.length);
}

function getTemplateMetadataSegments(text: string): MetadataSegment[] {
  const segments: MetadataSegment[] = [];
  const attributePattern = /\bi18n(?:-[\w-]+)?\s*=\s*(["'])/g;

  for (const match of text.matchAll(attributePattern)) {
    const quote = match[1]!;
    const metadataStart = match.index + match[0].length;
    const metadataEnd = text.indexOf(quote, metadataStart);

    if (metadataEnd === -1) {
      continue;
    }

    segments.push(...parseAngularMetadata(text.slice(metadataStart, metadataEnd), metadataStart));
  }

  return segments;
}

function getLocalizeMetadataSegments(text: string): MetadataSegment[] {
  const segments: MetadataSegment[] = [];
  const marker = "$localize`";
  let markerIndex = text.indexOf(marker);

  while (markerIndex !== -1) {
    const metadataDelimiter = markerIndex + marker.length;

    if (text[metadataDelimiter] === ":") {
      const metadataStart = metadataDelimiter + 1;
      const metadataEnd = findUnescaped(text, ":", metadataStart);

      if (metadataEnd !== -1) {
        segments.push(...parseAngularMetadata(text.slice(metadataStart, metadataEnd), metadataStart));
      }
    }

    markerIndex = text.indexOf(marker, markerIndex + marker.length);
  }

  return segments;
}

function parseAngularMetadata(metadata: string, absoluteStart: number): MetadataSegment[] {
  const customIdMatch = /@@([A-Za-z0-9_.-]+)/.exec(metadata);

  if (!customIdMatch || customIdMatch.index === undefined) {
    return [];
  }

  const customIdStart = customIdMatch.index + 2;
  const customId = customIdMatch[1]!;
  const prefix = metadata.slice(0, customIdMatch.index);
  const pipeIndex = prefix.indexOf("|");
  const segments: MetadataSegment[] = [
    {
      start: absoluteStart + customIdStart,
      length: customId.length,
      tokenType: "variable"
    }
  ];

  if (pipeIndex === -1) {
    addSegment(segments, absoluteStart, 0, prefix.length, "string");
    return segments;
  }

  addSegment(segments, absoluteStart, 0, pipeIndex, "namespace");
  addSegment(segments, absoluteStart, pipeIndex + 1, prefix.length - pipeIndex - 1, "string");

  return segments;
}

function addSegment(
  segments: MetadataSegment[],
  absoluteStart: number,
  relativeStart: number,
  length: number,
  tokenType: LocalizationSemanticTokenType
): void {
  if (length <= 0) {
    return;
  }

  segments.push({
    start: absoluteStart + relativeStart,
    length,
    tokenType
  });
}

function toSemanticTokens(
  text: string,
  lineStarts: number[],
  segment: MetadataSegment
): LocalizationSemanticToken[] {
  const tokens: LocalizationSemanticToken[] = [];
  let start = segment.start;
  const end = segment.start + segment.length;

  while (start < end) {
    const line = lineForOffset(lineStarts, start);
    const lineEnd = line + 1 < lineStarts.length ? lineStarts[line + 1]! - 1 : text.length;
    const tokenEnd = Math.min(end, lineEnd);

    if (tokenEnd > start) {
      tokens.push({
        line,
        character: start - lineStarts[line]!,
        length: tokenEnd - start,
        tokenType: segment.tokenType
      });
    }

    start = tokenEnd + 1;
  }

  return tokens;
}

function getLineStarts(text: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

function lineForOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle]!;
    const nextLineStart = middle + 1 < lineStarts.length ? lineStarts[middle + 1]! : Number.POSITIVE_INFINITY;

    if (offset < lineStart) {
      high = middle - 1;
    } else if (offset >= nextLineStart) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return 0;
}

function findUnescaped(text: string, needle: string, fromIndex: number): number {
  let index = text.indexOf(needle, fromIndex);

  while (index !== -1) {
    if (!isEscaped(text, index)) {
      return index;
    }

    index = text.indexOf(needle, index + 1);
  }

  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}
