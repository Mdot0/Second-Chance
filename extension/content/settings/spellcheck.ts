import { BUILT_IN_ALLOWLIST, COMMON_MISSPELLINGS, COMMON_WORDS } from "./spellDictionary";

type SpellingSeverity = "low" | "medium";

export type SpellingIssue = {
  severity: SpellingSeverity;
  message: string;
  evidence?: string;
};

export type SpellingOptions = {
  strict: boolean;
  customDictionary: string[];
  maxIssues?: number;
};

type Token = {
  raw: string;
  normalized: string;
  index: number;
};

const MAX_SUGGESTION_DISTANCE = 2;
const DEFAULT_MAX_ISSUES = 8;

const CONFUSION_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\byour\s+(welcome|right|going|not|able)\b/i, message: 'Use "you\'re" in this phrase.' },
  { pattern: /\bits\s+(a|an|the|been|going)\b/i, message: 'Use "it\'s" when you mean "it is".' },
  { pattern: /\btheir\s+(is|are|was|were)\b/i, message: 'Use "there" in this phrase.' },
  { pattern: /\bmore then\b/i, message: 'Use "than" after comparatives ("more than").' },
  { pattern: /\bless then\b/i, message: 'Use "than" after comparatives ("less than").' },
  { pattern: /\brather then\b/i, message: 'Use "than" in the phrase "rather than".' }
];

const DICTIONARY_SET = new Set(COMMON_WORDS);
const INDEX_BY_LENGTH = new Map<number, string[]>();

for (const word of COMMON_WORDS) {
  const bucket = INDEX_BY_LENGTH.get(word.length) ?? [];
  bucket.push(word);
  INDEX_BY_LENGTH.set(word.length, bucket);
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^'+|'+$/g, "");
}

function collectTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /[A-Za-z][A-Za-z'-]{1,}/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const raw = match[0];
    tokens.push({
      raw,
      normalized: normalizeWord(raw),
      index: match.index
    });
    match = regex.exec(text);
  }
  return tokens;
}

function isMostlyEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 25) {
    return true;
  }
  const latin = text.match(/[A-Za-z]/g) ?? [];
  return latin.length / letters.length >= 0.75;
}

function isUrlLike(text: string): boolean {
  return /^https?:\/\//i.test(text) || /^www\./i.test(text);
}

function isEmailLike(text: string): boolean {
  return /\S+@\S+\.\S+/.test(text);
}

function isLikelyAcronym(raw: string): boolean {
  return raw === raw.toUpperCase() && raw.length <= 6;
}

function isLikelyProperNoun(token: Token, sourceText: string): boolean {
  if (!/^[A-Z][a-z]/.test(token.raw)) {
    return false;
  }
  const prevChar = sourceText[token.index - 1] ?? "";
  const startsSentence = token.index === 0 || /[.!?\n]\s*$/.test(sourceText.slice(Math.max(0, token.index - 3), token.index + 1));
  return !startsSentence && (prevChar === " " || prevChar === "\n");
}

function damerauLevenshtein(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    d[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    d[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function candidateWords(word: string): string[] {
  const candidates: string[] = [];
  for (let length = word.length - 2; length <= word.length + 2; length += 1) {
    const bucket = INDEX_BY_LENGTH.get(length);
    if (!bucket) {
      continue;
    }
    candidates.push(
      ...bucket.filter(
        (candidate) =>
          candidate[0] === word[0] ||
          (candidate.length > 1 && word.length > 1 && candidate[1] === word[1])
      )
    );
  }
  return candidates;
}

function suggestWord(word: string): string | undefined {
  let best: { word: string; distance: number } | undefined;
  for (const candidate of candidateWords(word)) {
    const distance = damerauLevenshtein(word, candidate);
    if (distance > MAX_SUGGESTION_DISTANCE) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { word: candidate, distance };
      if (distance === 1) {
        break;
      }
    }
  }
  return best?.word;
}

function shouldSkipToken(token: Token, sourceText: string, ignoreSet: Set<string>): boolean {
  if (token.normalized.length < 3) {
    return true;
  }
  if (ignoreSet.has(token.normalized)) {
    return true;
  }
  if (isLikelyAcronym(token.raw)) {
    return true;
  }
  if (isLikelyProperNoun(token, sourceText)) {
    return true;
  }
  if (isUrlLike(token.raw) || isEmailLike(token.raw)) {
    return true;
  }
  if (/\d/.test(token.raw)) {
    return true;
  }
  return false;
}

function addConfusionIssues(text: string, output: SpellingIssue[], limit: number): void {
  for (const item of CONFUSION_PATTERNS) {
    if (output.length >= limit) {
      return;
    }
    const match = text.match(item.pattern);
    if (match) {
      output.push({
        severity: "medium",
        message: item.message,
        evidence: match[0]
      });
    }
  }
}

export function analyzeSpelling(text: string, options: SpellingOptions): SpellingIssue[] {
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
  const issues: SpellingIssue[] = [];

  if (!text.trim()) {
    return issues;
  }

  if (!isMostlyEnglish(text)) {
    issues.push({
      severity: "low",
      message: "Language appears non-English; typo checks are limited."
    });
    return issues;
  }

  const ignoreSet = new Set([
    ...BUILT_IN_ALLOWLIST,
    ...options.customDictionary.map((term) => term.toLowerCase())
  ]);

  addConfusionIssues(text, issues, maxIssues);
  if (issues.length >= maxIssues) {
    return issues.slice(0, maxIssues);
  }

  const tokens = collectTokens(text);
  const lowConfidenceIssues: SpellingIssue[] = [];
  let unknownTokenCount = 0;

  for (const token of tokens) {
    if (issues.length + lowConfidenceIssues.length >= maxIssues) {
      break;
    }
    if (shouldSkipToken(token, text, ignoreSet)) {
      continue;
    }
    if (DICTIONARY_SET.has(token.normalized)) {
      continue;
    }

    unknownTokenCount += 1;
    const misspellingFix = COMMON_MISSPELLINGS[token.normalized];
    if (misspellingFix) {
      issues.push({
        severity: "medium",
        message: `Possible typo: "${token.raw}" -> "${misspellingFix}"`,
        evidence: token.raw
      });
      continue;
    }

    const suggestion = suggestWord(token.normalized);
    if (suggestion) {
      lowConfidenceIssues.push({
        severity: options.strict ? "medium" : "low",
        message: `Possible typo: "${token.raw}" -> "${suggestion}"`,
        evidence: token.raw
      });
    }
  }

  const unknownRatio = tokens.length > 0 ? unknownTokenCount / tokens.length : 0;
  if (unknownRatio <= 0.35) {
    issues.push(...lowConfidenceIssues);
  } else if (issues.length === 0) {
    issues.push({
      severity: "low",
      message: "Email contains many unknown terms; typo confidence is reduced."
    });
  }

  return issues.slice(0, maxIssues);
}
