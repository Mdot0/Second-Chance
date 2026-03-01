import type { AnalysisIssue, IssueCategory, IssueSeverity } from "./smartPause";

const LT_API_URL = "https://api.languagetool.org/v2/check";
const LT_TIMEOUT_MS = 5000;
const MAX_ISSUES = 12;

type LtMatch = {
  message: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  context: { text: string; offset: number; length: number };
  rule: {
    id: string;
    category: { id: string; name: string };
    issueType: string;
  };
};

type LtResponse = { matches: LtMatch[] };

function mapCategory(match: LtMatch): IssueCategory | null {
  const catId = match.rule.category.id;
  const issueType = match.rule.issueType;
  if (issueType === "misspelling" || catId === "TYPOS") return "grammar";
  if (catId === "GRAMMAR" || issueType === "grammar") return "grammar";
  if (catId === "PUNCTUATION" || catId === "TYPOGRAPHY") return "formatting";
  if (catId === "STYLE" || catId === "TONE_OF_VOICE") return "tone";
  return null;
}

function mapSeverity(match: LtMatch): IssueSeverity {
  if (match.rule.issueType === "misspelling") return "medium";
  if (match.rule.issueType === "grammar") return "medium";
  return "low";
}

function extractWord(match: LtMatch): string {
  const { text, offset, length } = match.context;
  return text.slice(offset, offset + length);
}

function buildMessage(match: LtMatch): string {
  const word = extractWord(match);
  if (match.replacements.length > 0) {
    return `${match.message} "${word}" → "${match.replacements[0].value}"`;
  }
  return match.message;
}

export async function fetchLanguageToolIssues(
  text: string,
  customDictionary: string[]
): Promise<AnalysisIssue[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LT_TIMEOUT_MS);
  const ignoreSet = new Set(customDictionary.map((w) => w.toLowerCase()));

  try {
    const body = new URLSearchParams({ text, language: "en-US" });
    const response = await fetch(LT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal
    });

    if (!response.ok) return [];

    const data = (await response.json()) as LtResponse;

    return data.matches
      .map((match): AnalysisIssue | null => {
        const category = mapCategory(match);
        if (!category) return null;

        const word = extractWord(match).toLowerCase();
        if (ignoreSet.has(word)) return null;

        return {
          category,
          severity: mapSeverity(match),
          message: buildMessage(match),
          evidence: extractWord(match)
        };
      })
      .filter((issue): issue is AnalysisIssue => issue !== null)
      .slice(0, MAX_ISSUES);
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}
