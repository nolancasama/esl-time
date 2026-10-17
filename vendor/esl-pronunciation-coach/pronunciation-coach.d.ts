/** Hand-written declarations for the offline pronunciation coach public API. */
export type HintLanguage = 'ja' | 'en' | 'both';
export type CustomHint = string | { ja?: string; en?: string };
export type Accent = 'en-US' | 'en-GB';
export type AgeGroup = 'elementary' | 'secondary' | 'adult';
export type AnalysisStatus = 'ok' | 'estimated' | 'ambiguous' | 'unanalyzable';
export type PronunciationSource = 'dictionary' | 'user-dictionary' | 'g2p' | 'none';
export type Dictionary = Record<string, string | string[]>;
export interface CompressedDictionary {
  format: 'prefix-v1';
  count?: number;
  symbols: string[];
  alphabet: string;
  entries: string;
}
export interface PronunciationContext {
  pronunciation?: string | number;
  pos?: string;
  sense?: string;
  tense?: string;
}
export interface CoachOptions {
  learnerLanguage?: 'ja';
  hintLanguage?: HintLanguage;
  accent?: Accent;
  ageGroup?: AgeGroup;
  maxHints?: number;
  ruleOverrides?: Record<string, { enabled?: boolean; tier?: 1 | 2 | 3 | 4; weight?: number }>;
  customHints?: Record<string, CustomHint[] | { hints: CustomHint[]; mode: 'replace' | 'prepend' }>;
  dictionary?: Dictionary;
  useTranscriptRanking?: boolean;
}
export interface Pronunciation {
  phonemes: string[];
  syllables: number;
  stress: number[];
}
export interface Hint {
  id: string;
  ruleId: string | null;
  kind: 'pronunciation' | 'listening' | 'fallback' | 'teacher';
  text: string;
  texts: { ja: string; en: string };
  textEn?: string;
  fallbackLanguage?: 'ja' | 'en';
  sounds: string[];
  tier: number;
  score: number;
  basis: 'heuristic' | 'teacher' | 'assessment';
}
export interface HintPlan {
  target: string;
  normalized: string;
  status: AnalysisStatus;
  source: PronunciationSource;
  pronunciation: Pronunciation | null;
  hints: Hint[];
  support: Hint[];
}
export interface HintStep {
  hint: Hint;
  step: number;
  remaining: number;
  exhausted: boolean;
  kind: Hint['kind'];
}
export interface Alternative { transcript: string; confidence?: number }
export interface Assessment { phonemes: Array<{ phoneme: string; score: number }> }
export type AttemptClassification = 'correct' | 'no-speech' | 'recognition-error' | 'different-word' | 'possible-pronunciation';
export interface Attempt {
  target: string;
  exerciseId?: string;
  context?: PronunciationContext;
  correct?: boolean;
  transcript?: string;
  alternatives?: Alternative[];
  error?: string;
  assessment?: Assessment;
}
export interface AttemptResult {
  classification: AttemptClassification;
  advanced: boolean;
  hint: Hint | null;
  message: string | null;
  messageEn?: string;
  messages?: { ja: string; en: string };
  step: number;
  remaining: number;
  exhausted: boolean;
  kind?: Hint['kind'];
}
export interface CoachState { target: string | null; step: number; shownHintIds: string[] }
export class PronunciationCoach {
  constructor(options?: CoachOptions);
  readonly options: Readonly<CoachOptions>;
  getHints(target: string, options?: { context?: PronunciationContext }): HintPlan;
  nextHint(attempt: { target: string; exerciseId?: string; context?: PronunciationContext }): HintStep;
  handleAttempt(attempt: Attempt): AttemptResult;
  reset(exerciseId: string): void;
  resetAll(): void;
  getState(exerciseId: string): CoachState;
}
export interface AnalysisOptions {
  accent?: Accent;
  context?: PronunciationContext;
  dictionary?: Dictionary;
}
export interface WordAnalysis extends Pronunciation {
  target: string;
  normalized: string;
  accent: Accent;
  status: AnalysisStatus;
  source: PronunciationSource;
  variants: string[][];
  syllableData: Array<{ index: number; start: number; end: number; nucleus: number; phonemes: string[]; stress: number }>;
  accentAdjustedPositions: number[];
  wordIndex: number;
  phonemeOffset: number;
  confidence?: number;
}
export interface RuleMatch {
  ruleId: string;
  positions: number[];
  sounds: string[];
  [property: string]: unknown;
}
export interface Analysis extends Pronunciation {
  target: string;
  normalized: string;
  accent: Accent;
  status: AnalysisStatus;
  source: PronunciationSource;
  pronunciation: Pronunciation | null;
  variants: string[][];
  words: WordAnalysis[];
  matches: RuleMatch[];
}
export function analyzeWord(word: string, options?: AnalysisOptions): Analysis;
export function registerDictionary(data: Dictionary | CompressedDictionary): void;
export const SIMILARITY_THRESHOLDS: Readonly<{
  possiblePronunciation: number;
  relatedConsonantCost: number;
  relatedVowelCost: number;
}>;
export interface HintUITheme {
  primary?: string;
  background?: string;
  text?: string;
  radius?: string | number;
  fontFamily?: string;
  fontSize?: string | number;
}
export interface HintDisplayOptions {
  language?: HintLanguage;
  showTryAgain?: boolean;
  showListen?: boolean;
  showTarget?: boolean;
  note?: string;
}
export interface HintUIOptions extends HintDisplayOptions {
  container?: HTMLElement;
  placement?: 'inline' | 'overlay';
  accent?: Accent;
  speechRate?: number;
  theme?: HintUITheme;
  injectStyles?: boolean;
  labels?: { listen?: string; tryAgain?: string; ariaLabel?: string };
  onTryAgain?: () => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}
export interface HintUIShowOptions extends HintDisplayOptions { target: string; hint?: Hint | null }
export class PronunciationHintUI {
  constructor(options?: HintUIOptions);
  show(options: HintUIShowOptions): void;
  hide(): void;
  speak(): void;
  stopSpeaking(): void;
  destroy(): void;
}
export type GameClassification = AttemptClassification | 'disabled' | 'not-pronunciation' | 'different-answer' | 'error';
export interface GameAttemptResult {
  classification: GameClassification;
  hint: Hint | null;
  coachedWord: string | null;
  shown: boolean;
  message?: string | null;
}
export interface GameCoachOptions {
  enabled?: boolean;
  coach?: CoachOptions;
  ui?: HintUIOptions | false;
  onHint?: (result: GameAttemptResult) => void;
  pauseListening?: () => void;
  resumeListening?: () => void;
  onTryAgain?: () => void;
  log?: boolean;
}
export interface GameAttemptInput {
  exerciseId?: string;
  target: string | string[];
  focus?: string[];
  answerSet?: string[];
  reveal?: boolean;
  transcript?: string;
  alternatives?: Alternative[];
}
export type GameAttempt = GameAttemptInput & ({ correct: boolean; error?: string } | { correct?: boolean; error: string });
export interface GameCoach {
  readonly enabled: boolean;
  attempt(attempt: GameAttempt): GameAttemptResult;
  clear(): void;
  reset(exerciseId: string): void;
  resetAll(): void;
  destroy(): void;
}
export function createGameCoach(options?: GameCoachOptions): GameCoach;
export const DEFAULT_FUNCTION_WORDS: readonly string[];

