/**
 * Deterministic parser that walks tokenized lines and emits a hierarchy of
 * partial section entries. HierarchyBuilder converts those into a full tree.
 */
import { SECTION_RANK, type SectionType } from "../types";
import { tokenize, type TokenLine } from "./Tokenizer";
import { detectLineType, type PatternHit } from "./Patterns";

export interface ParseEvent {
  type: SectionType;
  number: string | null;
  label: string;
  title: string;
  bodyText: string;
  originalText: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
}

export interface ParseResult {
  events: ParseEvent[];
  parserMethod: string;
  parserVersion: string;
}

const PARSER_VERSION = "1.0.0";
const PARSER_METHOD = "deterministic-regex-statemachine";

export function parseDocument(input: string): ParseResult {
  const lines = tokenize(input);
  const events: ParseEvent[] = [];
  const stack: ParseEvent[] = [];

  const flushBodyLine = (target: ParseEvent | undefined, line: TokenLine) => {
    if (!target) return;
    target.bodyText += (target.bodyText ? "\n" : "") + line.text;
    target.originalText += (target.originalText ? "\n" : "") + line.raw;
    target.endOffset = line.endOffset;
  };

  for (const line of lines) {
    if (line.blank) {
      // Only push blank into current top's original text to preserve structure — skip trim body
      const top = stack[stack.length - 1];
      if (top) {
        top.originalText += "\n";
        top.endOffset = line.endOffset;
      }
      continue;
    }

    const hit = detectLineType(line.text);
    if (hit) {
      const event = eventFromHit(hit, line);
      // Pop stack to appropriate parent rank
      while (stack.length > 0 && SECTION_RANK[stack[stack.length - 1].type] >= SECTION_RANK[event.type]) {
        stack.pop();
      }
      events.push(event);
      stack.push(event);
      continue;
    }

    // Plain body line — attach to the nearest active event
    flushBodyLine(stack[stack.length - 1], line);
  }

  return { events, parserMethod: PARSER_METHOD, parserVersion: PARSER_VERSION };
}

function eventFromHit(hit: PatternHit, line: TokenLine): ParseEvent {
  const title = hit.restOfLine ?? "";
  return {
    type: hit.type,
    number: hit.number,
    label: hit.label,
    title,
    bodyText: title,
    originalText: line.raw,
    startOffset: line.startOffset,
    endOffset: line.endOffset,
    confidence: 0.9,
  };
}

export const parserInfo = { method: PARSER_METHOD, version: PARSER_VERSION };
