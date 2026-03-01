import type { AnalysisIssue, IssueCategory, IssueLocation, IssueSeverity } from "./smartPause";

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

function pickPreferredReplacement(match: LtMatch, original: string): string | null {
  const replacements = match.replacements
    .map((entry) => entry.value.trim())
    .filter((value) => value.length > 0);

  if (replacements.length === 0) {
    return null;
  }

  const looksLikeSingleWord = /^[A-Za-z]+$/.test(original);
  if (looksLikeSingleWord) {
    const spaceCandidate = replacements.find((value) => value.includes(" "));
    if (spaceCandidate) {
      return spaceCandidate;
    }
  }

  return replacements[0];
}

function buildMessage(match: LtMatch): string {
  const word = extractWord(match);
  const replacement = pickPreferredReplacement(match, word);
  if (replacement) {
    return `${match.message} "${word}" -> "${replacement}"`;
  }
  return match.message;
}

function isNewlinePunctuationFalsePositive(match: LtMatch, evidence: string, sourceText: string): boolean {
  const categoryId = match.rule.category.id;
  if (categoryId !== "PUNCTUATION" && categoryId !== "TYPOGRAPHY") {
    return false;
  }

  const ruleMessage = match.message.toLowerCase();
  if (ruleMessage.includes("space after the comma")) {
    const charAtOffset = sourceText.charAt(match.offset);
    const nextChar = sourceText.charAt(match.offset + 1);
    if (charAtOffset === "," && (nextChar === "\n" || nextChar === "\r")) {
      return true;
    }
  }

  if (evidence.includes("\n")) {
    return true;
  }

  if (match.context.text.includes("\n")) {
    return true;
  }

  const slice = sourceText.slice(match.offset, match.offset + Math.max(match.length, 1));
  return slice.includes("\n");
}

function normalizeDictionaryToken(input: string): string {
  return input.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

export async function fetchLanguageToolIssues(
  text: string,
  customDictionary: string[],
  location: IssueLocation
): Promise<AnalysisIssue[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LT_TIMEOUT_MS);
  const ignoreSet = new Set(customDictionary.map((w) => normalizeDictionaryToken(w)).filter(Boolean));

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

        const evidence = extractWord(match);
        if (isNewlinePunctuationFalsePositive(match, evidence, text)) {
          return null;
        }

        const word = normalizeDictionaryToken(evidence);
        if (word && ignoreSet.has(word)) return null;

        return {
          category,
          severity: mapSeverity(match),
          message: buildMessage(match),
          evidence,
          location,
          offset: match.offset,
          length: match.length
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
