export type ToneSignal = {
  category: "aggressive" | "blame" | "urgency" | "dismissive";
  phrase: string;
  severity: "low" | "medium" | "high";
};

export const TONE_SIGNALS: ToneSignal[] = [
  { category: "aggressive", phrase: "this is unacceptable", severity: "high" },
  { category: "aggressive", phrase: "fix this now", severity: "high" },
  { category: "aggressive", phrase: "what is wrong with you", severity: "high" },
  { category: "blame", phrase: "you failed to", severity: "high" },
  { category: "blame", phrase: "why didn't you", severity: "medium" },
  { category: "blame", phrase: "this is your fault", severity: "high" },
  { category: "dismissive", phrase: "obviously", severity: "low" },
  { category: "dismissive", phrase: "just do it", severity: "medium" },
  { category: "dismissive", phrase: "as i already said", severity: "medium" },
  { category: "urgency", phrase: "asap", severity: "low" },
  { category: "urgency", phrase: "immediately", severity: "medium" },
  { category: "urgency", phrase: "urgent", severity: "low" }
];
