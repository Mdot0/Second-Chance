export type ToneSignal = {
  category: "aggressive" | "blame" | "urgency" | "dismissive" | "negative";
  phrase: string;
  severity: "low" | "medium" | "high";
};

export type ProfanityEntry = {
  word: string;
  severity: "medium" | "high";
};

export const TONE_SIGNALS: ToneSignal[] = [
  // aggressive
  { category: "aggressive", phrase: "this is unacceptable", severity: "high" },
  { category: "aggressive", phrase: "fix this now", severity: "high" },
  { category: "aggressive", phrase: "what is wrong with you", severity: "high" },
  { category: "aggressive", phrase: "i am furious", severity: "high" },
  { category: "aggressive", phrase: "this makes me angry", severity: "medium" },
  // blame
  { category: "blame", phrase: "you failed to", severity: "high" },
  { category: "blame", phrase: "why didn't you", severity: "medium" },
  { category: "blame", phrase: "this is your fault", severity: "high" },
  { category: "blame", phrase: "you should have", severity: "medium" },
  { category: "blame", phrase: "you never", severity: "medium" },
  // dismissive
  { category: "dismissive", phrase: "obviously", severity: "low" },
  { category: "dismissive", phrase: "just do it", severity: "medium" },
  { category: "dismissive", phrase: "as i already said", severity: "medium" },
  { category: "dismissive", phrase: "as i said before", severity: "medium" },
  { category: "dismissive", phrase: "how many times", severity: "medium" },
  { category: "dismissive", phrase: "i shouldn't have to explain", severity: "high" },
  // urgency
  { category: "urgency", phrase: "asap", severity: "low" },
  { category: "urgency", phrase: "immediately", severity: "medium" },
  { category: "urgency", phrase: "urgent", severity: "low" },
  { category: "urgency", phrase: "right now", severity: "medium" },
  // negative sentiment
  { category: "negative", phrase: "terrible job", severity: "high" },
  { category: "negative", phrase: "absolutely useless", severity: "high" },
  { category: "negative", phrase: "completely wrong", severity: "medium" },
  { category: "negative", phrase: "waste of time", severity: "medium" },
  { category: "negative", phrase: "not good enough", severity: "medium" },
  { category: "negative", phrase: "this is ridiculous", severity: "medium" },
  { category: "negative", phrase: "never works", severity: "medium" },
  { category: "negative", phrase: "always broken", severity: "medium" },
  { category: "negative", phrase: "i can't believe", severity: "low" },
  { category: "negative", phrase: "disappointing", severity: "low" },
  { category: "negative", phrase: "unacceptable behavior", severity: "high" },
  { category: "negative", phrase: "deeply frustrated", severity: "medium" }
];

export const PROFANITY: ProfanityEntry[] = [
  { word: "fuck", severity: "high" },
  { word: "fucking", severity: "high" },
  { word: "shit", severity: "high" },
  { word: "bullshit", severity: "high" },
  { word: "asshole", severity: "high" },
  { word: "bastard", severity: "high" },
  { word: "bitch", severity: "medium" },
  { word: "damn", severity: "medium" },
  { word: "dammit", severity: "medium" },
  { word: "crap", severity: "medium" },
  { word: "moron", severity: "medium" },
  { word: "idiot", severity: "medium" },
  { word: "jerk", severity: "medium" },
  { word: "screw you", severity: "high" },
  { word: "piss off", severity: "high" },
  { word: "nigger", severity: "high" },
  { word: "nigga", severity: "high" },
  { word: "retard", severity: "high" },
  { word: "chink", severity: "high" },
  { word: "clanker", severity: "high" },
];
