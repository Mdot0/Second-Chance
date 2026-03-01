import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, type PauseSettings } from "./defaults";
import { fetchLanguageToolIssues } from "./languageTool";
import { PROFANITY } from "./toneRules";
import type { ComposeContext } from "../interceptor/composeContext";
import leoProfanity from "leo-profanity";

// Words already covered by the manual PROFANITY list (severity-controlled).
const MANUAL_PROFANITY_WORDS = new Set(PROFANITY.map((e) => e.word));
// All remaining leo-profanity words not in the manual list — computed once at load.
const LEO_EXTENDED_WORDS: string[] = leoProfanity.list().filter((w: string) => !MANUAL_PROFANITY_WORDS.has(w));

function normalizeLeet(text: string): string {
  return text
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[!1]/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/\+/g, "t")
    .replace(/[*."'`]/g, "");
}

export type IssueCategory = "grammar" | "formatting" | "tone" | "context";
export type IssueSeverity = "low" | "medium" | "high";

export type IssueLocation = "subject" | "body";

export type AnalysisIssue = {
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  evidence?: string;
  location?: IssueLocation;
  offset?: number;
  length?: number;
};

export type AnalysisSummary = {
  category: IssueCategory;
  headline: string;
  count: number;
};

export type PauseAnalysis = {
  delaySeconds: number;
  summaries: AnalysisSummary[];
  issuesByCategory: Record<IssueCategory, AnalysisIssue[]>;
};

const HEADLINES: Record<IssueCategory, string> = {
  grammar: "Grammar needs to be fixed",
  formatting: "Formatting should be cleaned up",
  tone: "Profanity or offensive language detected",
  context: "Generalized context suggests a quick review"
};

function clampDelay(seconds: number): number {
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(seconds)));
}

function makeIssueMap(): Record<IssueCategory, AnalysisIssue[]> {
  return {
    grammar: [],
    formatting: [],
    tone: [],
    context: []
  };
}

function addIssue(map: Record<IssueCategory, AnalysisIssue[]>, issue: AnalysisIssue): void {
  map[issue.category].push(issue);
}

function lines(raw: string): string[] {
  return raw.split("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maxConsecutiveEmptyLines(raw: string): number {
  const bodyLines = lines(raw);
  let maxRun = 0;
  let currentRun = 0;

  for (const line of bodyLines) {
    if (line.trim().length === 0) {
      currentRun += 1;
      if (currentRun > maxRun) {
        maxRun = currentRun;
      }
    } else {
      currentRun = 0;
    }
  }

  return maxRun;
}

function isLineBreakChar(ch: string): boolean {
  return ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029";
}

function hasLineBreakAfterComma(text: string, commaIndex: number): boolean {
  let cursor = commaIndex + 1;
  let sawLineBreak = false;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (isLineBreakChar(ch)) {
      sawLineBreak = true;
      cursor += 1;
      continue;
    }
    if (/\s/u.test(ch)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return sawLineBreak;
}

function isCommaSpacingAcrossLineBreak(issue: AnalysisIssue, bodyRaw: string): boolean {
  if (issue.location !== "body") {
    return false;
  }

  if (!issue.message.toLowerCase().includes("space after the comma")) {
    return false;
  }

  const offset = issue.offset;
  if (typeof offset === "number" && offset >= 0 && offset < bodyRaw.length) {
    const candidateIndexes = [offset - 3, offset - 2, offset - 1, offset, offset + 1, offset + 2, offset + 3];
    for (const commaIndex of candidateIndexes) {
      if (commaIndex >= 0 && commaIndex < bodyRaw.length && bodyRaw[commaIndex] === ",") {
        if (hasLineBreakAfterComma(bodyRaw, commaIndex)) {
          return true;
        }
      }
    }
  }

  const evidence = issue.evidence ?? "";
  const match = evidence.match(/^,\s*([A-Za-z0-9]+)/);
  if (!match) {
    return false;
  }

  const token = match[1];
  const lineBreakPattern = new RegExp(`,\\s*[\\r\\n\\u2028\\u2029]+\\s*${escapeRegex(token)}\\b`, "i");
  return lineBreakPattern.test(bodyRaw);
}

const ATTACHMENT_KEYWORDS =
  /\b(attached|attachment|attaching|find attached|please find|see attached|as attached|enclosed|i'?ve attached|i have attached)\b/i;

function runContextChecks(context: ComposeContext, issueMap: Record<IssueCategory, AnalysisIssue[]>): void {
  if (context.toCount >= 2) {
    addIssue(issueMap, {
      category: "context",
      severity: context.toCount >= 7 ? "high" : context.toCount >= 4 ? "medium" : "low",
      message: `You are sending to ${context.toCount} recipients.`,
      evidence: `${context.toCount} recipients detected`
    });
  }

  if (context.hasAttachment) {
    addIssue(issueMap, {
      category: "context",
      severity: "medium",
      message: "Attachment detected. Confirm this is the final version.",
      evidence: "Attachment is present"
    });
  }

  const fullText = `${context.subject} ${context.bodyText}`.trim();
  if (!context.hasAttachment && fullText.length > 0 && ATTACHMENT_KEYWORDS.test(fullText)) {
    addIssue(issueMap, {
      category: "context",
      severity: "high",
      message: "You mentioned an attachment but no file is attached.",
      evidence: "Attachment reference without file",
      location: ATTACHMENT_KEYWORDS.test(context.subject) ? "subject" : "body"
    });
  }
}


function runFormattingChecks(context: ComposeContext, issueMap: Record<IssueCategory, AnalysisIssue[]>): void {
  const bodyLines = lines(context.bodyRaw);
  const bodyBlocks = context.bodyBlocks;

  if (bodyLines.length === 0 && bodyBlocks.length === 0) {
    return;
  }

  const tabIndented = bodyLines.filter((line) => /^\t+/.test(line)).length;
  const spaceIndented = bodyLines.filter((line) => /^ {2,}\S/.test(line)).length;
  if (tabIndented > 0 && spaceIndented > 0) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "medium",
      message: "Mixed tabs and spaces detected in indentation.",
      evidence: "Tabs and spaces are both used",
      location: "body"
    });
  }

  const emptyLineRun = maxConsecutiveEmptyLines(context.bodyRaw);
  if (emptyLineRun >= 4) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "There are large blank gaps in the email body.",
      location: "body"
    });
  }

  const hasBulletListItems = bodyBlocks.some((block) => block.type === "bullet-item");
  const hasNumberListItems = bodyBlocks.some((block) => block.type === "number-item");
  const hasMixedListStylesInBlocks = hasBulletListItems && hasNumberListItems;
  const hasMixedListStylesInLines =
    bodyLines.some((line) => /^[-*]\s+/.test(line.trim())) &&
    bodyLines.some((line) => /^\d+[.)]\s+/.test(line.trim()));

  if (hasMixedListStylesInBlocks || hasMixedListStylesInLines) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "Bullet styles are mixed. Use one list style.",
      location: "body"
    });
  }

  const trailingSpaceLine = bodyLines.find((line) => /\s+$/.test(line));
  if (trailingSpaceLine) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "Trailing spaces detected.",
      evidence: trailingSpaceLine,
      location: "body"
    });
  }

  const nonBlankBlocks = bodyBlocks.filter((block) => block.type !== "blank");
  if (nonBlankBlocks.length > 0) {
    const indentLevels = nonBlankBlocks.map((block) => block.indentLevel);
    const minIndent = Math.min(...indentLevels);
    const maxIndent = Math.max(...indentLevels);
    if (maxIndent - minIndent >= 2) {
      addIssue(issueMap, {
        category: "formatting",
        severity: "low",
        message: "Indentation depth is inconsistent across sections.",
        evidence: `Indent levels ${minIndent}-${maxIndent}`,
        location: "body"
      });
    }
  }
}

function runProfanityChecks(context: ComposeContext, issueMap: Record<IssueCategory, AnalysisIssue[]>): void {
  const subjectRaw = context.subject.toLowerCase();
  const bodyRaw = context.bodyRaw.toLowerCase();
  const subjectNorm = normalizeLeet(subjectRaw);
  const bodyNorm = normalizeLeet(bodyRaw);

  function escapeRegex(word: string): string {
    return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Manual list: severity-mapped, checked on both raw and leet-normalized text.
  PROFANITY.forEach((entry) => {
    const pattern = new RegExp(`\\b${escapeRegex(entry.word)}\\b`, "i");
    const inSubject = pattern.test(subjectRaw) || pattern.test(subjectNorm);
    const inBody = pattern.test(bodyRaw) || pattern.test(bodyNorm);
    if (inSubject || inBody) {
      addIssue(issueMap, {
        category: "tone",
        severity: entry.severity,
        message: `Offensive language detected: "${entry.word}"`,
        evidence: entry.word,
        location: inSubject ? "subject" : "body"
      });
    }
  });

  // Leo-profanity extended list: broad coverage, checked on normalized text only.
  LEO_EXTENDED_WORDS.forEach((word) => {
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    const inSubject = pattern.test(subjectNorm);
    const inBody = pattern.test(bodyNorm);
    if (inSubject || inBody) {
      addIssue(issueMap, {
        category: "tone",
        severity: "medium",
        message: `Offensive language detected: "${word}"`,
        evidence: word,
        location: inSubject ? "subject" : "body"
      });
    }
  });
}

function issueWeight(severity: IssueSeverity): number {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function calculateDelay(baseDelay: number, issueMap: Record<IssueCategory, AnalysisIssue[]>, strict: boolean): number {
  const allIssues = Object.values(issueMap).flat();
  const weightedScore = allIssues.reduce((sum, issue) => sum + issueWeight(issue.severity), 0);
  const strictMultiplier = strict ? 1.35 : 1;
  const dynamicDelay = Math.ceil(weightedScore * strictMultiplier);
  return clampDelay(baseDelay + dynamicDelay);
}

function buildSummaries(issueMap: Record<IssueCategory, AnalysisIssue[]>): AnalysisSummary[] {
  return (Object.keys(issueMap) as IssueCategory[])
    .filter((category) => issueMap[category].length > 0)
    .map((category) => ({
      category,
      headline: HEADLINES[category],
      count: issueMap[category].length
    }));
}

export async function computePauseAnalysis(context: ComposeContext, settings: PauseSettings): Promise<PauseAnalysis> {
  const issueMap = makeIssueMap();

  runContextChecks(context, issueMap);

  if (settings.checkGrammar) {
    const ltIssues = (
      await Promise.all([
        context.subject.trim().length > 0
          ? fetchLanguageToolIssues(context.subject, settings.customDictionary, "subject")
          : Promise.resolve([]),
        context.bodyRaw.trim().length > 0
          ? fetchLanguageToolIssues(context.bodyRaw, settings.customDictionary, "body")
          : Promise.resolve([])
      ])
    )
      .flat()
      .filter((issue) => !isCommaSpacingAcrossLineBreak(issue, context.bodyRaw));
    ltIssues.forEach((issue) => addIssue(issueMap, issue));
  }

  if (settings.checkFormatting) {
    runFormattingChecks(context, issueMap);
  }
  runProfanityChecks(context, issueMap);

  const delaySeconds = calculateDelay(
    settings.delaySeconds,
    issueMap,
    settings.strictness === "strict"
  );

  return {
    delaySeconds,
    summaries: buildSummaries(issueMap),
    issuesByCategory: issueMap
  };
}
