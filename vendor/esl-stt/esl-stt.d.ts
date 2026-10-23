/** Speech recognition success is not pronunciation assessment. */
export type ProfileName = 'elementaryQuestion' | 'sentencePractice' | 'controlledAnswer' | 'singleWord' | 'freeResponse';
export type Outcome = 'correct' | 'near-miss' | 'incomplete' | 'different-answer' | 'no-speech' | 'recognition-error' | 'pending';
export type MatchType = 'exact' | 'alias' | 'plural' | 'fuzzy' | 'phrase';
export type Aliases = Record<string, readonly string[]>;
export type Fuzz = 'question' | 'controlled' | 'none' | ((length: number) => number);
export interface Alternative { transcript: string; confidence?: number | null; final?: boolean | null }
export interface NormalizedAlternative { transcript: string; normalized: string; confidence: number | null; final: boolean | null; index: number }
export type Alternatives = string | readonly string[] | readonly Alternative[] | { alternatives: readonly (string | Alternative)[] };
export interface Evidence { canonical: string; heard: string; alternativeIndex: number; matchType: MatchType; distance: number }
export interface LookupDebug {
  word: string;
  alternativeIndex: number;
  bestToken: string | null;
  matchType: MatchType | null;
  distance: number | null;
  slack: number;
}
export interface ResultDebug {
  profile: ProfileName;
  options: Record<string, unknown>;
  rule: string;
  normalized: { alternativeIndex: number; tokens: string[] }[];
  lookups: LookupDebug[];
  competitorsHeard: Evidence[];
  decision: string;
}
export interface RecognitionError { code: string; kind: 'silence' | 'transient' | 'unavailable'; fallbackSuggested: boolean; message: string }
/** Every key is present. debug is undefined unless requested; JSON serialization omits undefined. */
export interface Result {
  ok: boolean;
  outcome: Outcome;
  profile: ProfileName;
  transcript: string;
  alternatives: NormalizedAlternative[];
  canonical: string | null;
  value: string | null;
  freeForm: boolean;
  matched: Record<string, boolean | string[]>;
  missing: string[];
  nearMiss: boolean;
  wrongCategory: string | null;
  evidence: Record<string, Evidence>;
  error: RecognitionError | null;
  debug: ResultDebug | undefined;
}
export interface CommonOptions { aliases?: Aliases; replaceAliases?: boolean; fuzz?: Fuzz; debug?: boolean }
export interface QuestionOptions extends CommonOptions {
  category: string;
  frame?: readonly string[];
  minFrame?: number;
  competitors?: readonly string[];
  hypotheses?: 'pool';
}
export interface SentenceOptions extends CommonOptions {
  content: string | readonly string[];
  id?: string;
  frame?: readonly string[];
  frameThreshold?: number;
  bonus?: readonly string[];
  minTokens?: number;
  hypotheses?: 'pool' | 'top';
  forbidden?: readonly string[];
}
export interface VocabularyItem { id: string; words: readonly string[] }
export type Vocabulary = readonly (string | VocabularyItem)[];
export interface AnswerOptions extends CommonOptions {
  vocabulary: Vocabulary;
  expected?: string;
  frame?: readonly string[];
  minFrame?: number;
}
export interface SingleWordOptions extends CommonOptions { target: string; vocabulary?: Vocabulary }
export interface Frame {
  anchor: readonly string[];
  leading: readonly string[];
  trailing: readonly string[];
  filler: readonly string[];
}
export interface FreeResponseOptions extends CommonOptions {
  frame?: 'i-like' | 'i-want' | 'i-have' | 'i-can' | Frame;
  minimumContentWords?: number;
  maxWords?: number;
  maxChars?: number;
  vocabulary?: Vocabulary;
}
export type MatcherOptions =
  | ({ profile: 'elementaryQuestion' } & QuestionOptions)
  | ({ profile: 'sentencePractice' } & SentenceOptions)
  | ({ profile: 'controlledAnswer' } & AnswerOptions)
  | ({ profile: 'singleWord' } & SingleWordOptions)
  | ({ profile: 'freeResponse' } & FreeResponseOptions);
export interface Matcher {
  match(alternatives: Alternatives): Result;
  /** Success-only judging: a correct result or pending, never a failure outcome. */
  matchLive(alternatives: Alternatives): Result & { outcome: 'correct' | 'pending' };
  debugLastResult(): (Result & { debug: ResultDebug }) | null;
}
export function createMatcher(options: MatcherOptions): Matcher;
export function match(options: MatcherOptions & { alternatives: Alternatives }): Result;
export function matchQuestion(alternatives: Alternatives, options: QuestionOptions): Result;
export function matchSentence(alternatives: Alternatives, options: SentenceOptions): Result;
export function matchAnswer(alternatives: Alternatives, options: AnswerOptions): Result;
export function matchSingleWord(alternatives: Alternatives, options: SingleWordOptions): Result;
export function matchFreeResponse(alternatives: Alternatives, options?: FreeResponseOptions): Result;
export function normalizeText(text: string): string;
export function normalizeAlternatives(alternatives: Alternatives): NormalizedAlternative[];
export function levenshtein(a: string, b: string): number;
export function classifyError(error: string | { error?: string; code?: string; message?: string }, options?: { consecutiveEmptySessions?: number } | number): RecognitionError;
export function resultFromError(error: string | RecognitionError | { error?: string; code?: string; message?: string }, options?: { profile?: ProfileName }): Result;
export const DEFAULT_ALIASES: Readonly<Aliases>;
export const FRAMES: Readonly<Record<'i-like' | 'i-want' | 'i-have' | 'i-can', Readonly<Frame>>>;
export const PROFILES: {
  readonly elementaryQuestion: { readonly frame: readonly ['what', 'like']; readonly minFrame: 1; readonly fuzz: 'question'; readonly hypotheses: 'pool' };
  readonly sentencePractice: { readonly frame: readonly []; readonly frameThreshold: 0.5; readonly bonus: readonly []; readonly minTokens: 2; readonly forbidden: readonly []; readonly fuzz: 'question'; readonly hypotheses: 'pool' };
  readonly controlledAnswer: { readonly frame: readonly []; readonly fuzz: 'controlled' };
  readonly singleWord: { readonly frame: readonly []; readonly fuzz: 'controlled' };
  readonly freeResponse: { readonly frame: 'i-like'; readonly minimumContentWords: 1; readonly maxWords: 4; readonly maxChars: 32; readonly fuzz: 'controlled' };
};
export const OUTCOMES: readonly Outcome[];

export type RecognizerState = 'idle' | 'starting' | 'listening' | 'stopping' | 'destroyed';
export type EndReason = 'final' | 'no-speech' | 'timeout' | 'stopped' | 'cancelled' | 'error';
export interface RecognitionEnd { alternatives: NormalizedAlternative[]; final: boolean; reason: EndReason }
/** Structural interface permits a fake constructor in Node without DOM library types. */
export interface NativeRecognitionAlternative { transcript: string; confidence?: number }
export interface NativeRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: NativeRecognitionAlternative;
}
export interface NativeRecognitionEvent {
  resultIndex?: number;
  results: { readonly length: number; readonly [index: number]: NativeRecognitionResult };
}
export interface NativeRecognizer {
  lang: string;
  maxAlternatives: number;
  interimResults: boolean;
  continuous: boolean;
  onstart: ((event?: unknown) => void) | null;
  onresult: ((event: NativeRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: ((event?: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => NativeRecognizer;
/** Injectable native constructor option; the key is the standard browser constructor name. */
export type ConstructorOption = { [key in `Speech${'Recognition'}`]?: RecognitionConstructor };
export type RecognizerOptions = ConstructorOption & {
  lang?: string;
  maxAlternatives?: number;
  interimResults?: boolean;
  continuous?: boolean;
  timeoutMs?: number;
  onStart?: () => void;
  onInterim?: (alternatives: NormalizedAlternative[]) => void;
  onFinal?: (alternatives: NormalizedAlternative[]) => void;
  onEnd?: (event: RecognitionEnd) => void;
  onError?: (error: RecognitionError) => void;
};
export interface Recognizer {
  readonly supported: boolean;
  readonly state: RecognizerState;
  readonly consecutiveEmptySessions: number;
  start(): boolean;
  stop(): void;
  cancel(): void;
  destroy(): void;
}
export function createRecognizer(options?: RecognizerOptions): Recognizer;
export function isRecognitionSupported(options?: ConstructorOption | RecognitionConstructor): boolean;

export interface CoachOptions { exerciseId?: string; target?: string | readonly string[]; focus?: readonly string[] }
export interface CoachAttemptFields { exerciseId: string | undefined; target: string | readonly string[] | undefined; focus: readonly string[] | undefined }
export interface CorrectCoachAttempt extends CoachAttemptFields { correct: true }
export interface NearMissCoachAttempt extends CoachAttemptFields {
  correct: false;
  transcript: string;
  alternatives: { transcript: string; confidence: number | null }[];
}
/** Returns null for outcomes the host handles itself. Never changes the result. */
export function toCoachAttempt(result: Result, options?: CoachOptions): CorrectCoachAttempt | NearMissCoachAttempt | null;
