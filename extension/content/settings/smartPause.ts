import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, type PauseSettings } from "./defaults";
import { analyzeSpelling } from "./spellcheck";
import { TONE_SIGNALS } from "./toneRules";
import type { ComposeContext } from "../interceptor/composeContext";

export type IssueCategory = "grammar" | "formatting" | "tone" | "context";
export type IssueSeverity = "low" | "medium" | "high";

export type AnalysisIssue = {
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  evidence?: string;
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
  tone: "Tone may feel negative",
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
}

function runGrammarChecks(
  context: ComposeContext,
  settings: PauseSettings,
  issueMap: Record<IssueCategory, AnalysisIssue[]>
): void {
  const fullText = `${context.subject} ${context.bodyText}`.trim();
  const rawText = `${context.subject}\n${context.bodyRaw}`.trim();
  if (!fullText) {
    return;
  }

  analyzeSpelling(rawText, {
    strict: settings.strictness === "strict",
    customDictionary: settings.customDictionary
  }).forEach((finding) => {
    addIssue(issueMap, {
      category: "grammar",
      severity: finding.severity,
      message: finding.message,
      evidence: finding.evidence
    });
  });

  const repeatedPunctuation = fullText.match(/[!?]{3,}/);
  if (repeatedPunctuation) {
    addIssue(issueMap, {
      category: "grammar",
      severity: "low",
      message: "Repeated punctuation looks unpolished.",
      evidence: repeatedPunctuation[0]
    });
  }

  const firstLetter = fullText.match(/[A-Za-z]/)?.[0] ?? "";
  if (firstLetter.length > 0 && firstLetter === firstLetter.toLowerCase()) {
    addIssue(issueMap, {
      category: "grammar",
      severity: "low",
      message: "Opening sentence should start with a capital letter."
    });
  }

  if (!/[.!?]\s*$/.test(fullText) && fullText.length >= 35) {
    addIssue(issueMap, {
      category: "grammar",
      severity: "low",
      message: "Email may be missing ending punctuation."
    });
  }
}

function runFormattingChecks(context: ComposeContext, issueMap: Record<IssueCategory, AnalysisIssue[]>): void {
  const bodyLines = lines(context.bodyRaw);
  if (bodyLines.length === 0) {
    return;
  }

  const tabIndented = bodyLines.filter((line) => /^\t+/.test(line)).length;
  const spaceIndented = bodyLines.filter((line) => /^ {2,}\S/.test(line)).length;
  if (tabIndented > 0 && spaceIndented > 0) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "medium",
      message: "Mixed tabs and spaces detected in indentation.",
      evidence: "Tabs and spaces are both used"
    });
  }

  if (/\n\s*\n\s*\n/.test(context.bodyRaw)) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "There are large blank gaps in the email body."
    });
  }

  const hasDashBullets = bodyLines.some((line) => /^[-*]\s+/.test(line.trim()));
  const hasNumberBullets = bodyLines.some((line) => /^\d+[.)]\s+/.test(line.trim()));
  if (hasDashBullets && hasNumberBullets) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "Bullet styles are mixed. Use one list style."
    });
  }

  const trailingSpaceLine = bodyLines.find((line) => /\s+$/.test(line));
  if (trailingSpaceLine) {
    addIssue(issueMap, {
      category: "formatting",
      severity: "low",
      message: "Trailing spaces detected.",
      evidence: trailingSpaceLine
    });
  }
}

function runToneChecks(context: ComposeContext, issueMap: Record<IssueCategory, AnalysisIssue[]>): void {
  const haystack = `${context.subject}\n${context.bodyRaw}`.toLowerCase();
  const seenPhrases = new Set<string>();

  TONE_SIGNALS.forEach((signal) => {
    if (!seenPhrases.has(signal.phrase) && haystack.includes(signal.phrase)) {
      seenPhrases.add(signal.phrase);
      addIssue(issueMap, {
        category: "tone",
        severity: signal.severity,
        message: `Tone phrase detected: "${signal.phrase}"`,
        evidence: signal.category
      });
    }
  });

  const allCapsWords = (`${context.subject} ${context.bodyRaw}`.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (allCapsWords >= 2) {
    addIssue(issueMap, {
      category: "tone",
      severity: allCapsWords >= 4 ? "high" : "medium",
      message: "Multiple ALL CAPS words may read as aggressive.",
      evidence: `${allCapsWords} all-caps words`
    });
  }

  const exclamations = (`${context.subject} ${context.bodyRaw}`.match(/!/g) ?? []).length;
  if (exclamations >= 3) {
    addIssue(issueMap, {
      category: "tone",
      severity: exclamations >= 5 ? "high" : "medium",
      message: "Heavy exclamation usage may feel confrontational.",
      evidence: `${exclamations} exclamation marks`
    });
  }
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

export function computePauseAnalysis(context: ComposeContext, settings: PauseSettings): PauseAnalysis {
  const issueMap = makeIssueMap();

  runContextChecks(context, issueMap);

  if (settings.checkGrammar) {
    runGrammarChecks(context, settings, issueMap);
  }
  if (settings.checkFormatting) {
    runFormattingChecks(context, issueMap);
  }
  if (settings.checkTone) {
    runToneChecks(context, issueMap);
  }

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
