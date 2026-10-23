// src/normalize.js
function normalizeText(text) {
  return String(text != null ? text : "").toLowerCase().replace(/['’]/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();
}
function normalizeAlternatives(input) {
  if (input && !Array.isArray(input) && typeof input === "object" && "alternatives" in input) input = input.alternatives;
  const list2 = Array.isArray(input) ? input : [input];
  return list2.flatMap((entry, index) => {
    var _a;
    const object = entry && typeof entry === "object";
    const transcript = String((_a = object ? entry.transcript : entry) != null ? _a : "");
    const normalized = normalizeText(transcript);
    return normalized ? [{
      transcript,
      normalized,
      confidence: object && Number.isFinite(entry.confidence) ? entry.confidence : null,
      final: object && typeof entry.final === "boolean" ? entry.final : null,
      index
    }] : [];
  });
}

// src/aliases/japanese-efl.js
var aliases = {
  food: ["food", "foot", "hood", "foods", "fud", "whod", "fudo", "foodo", "hudo", "fooddo", "fuudo", "foodu", "fuud"],
  color: ["color", "colour", "caller", "collar", "cooler", "kara", "kalar", "karaa", "colors", "kalaa", "karra", "colorr"],
  drink: ["drink", "dring", "drinks", "junk", "trink", "dorinku", "drinku", "dorink", "dorinks", "drinko", "dlink", "dorinko"],
  sport: ["sport", "spot", "sports", "spore", "support", "supotsu", "supo", "sportu", "supootsu", "supoto", "spooto", "spots"],
  animal: ["animal", "anime", "animals", "aniaml", "enemal", "animaru", "animol", "anemal", "anima", "animo", "aniaru", "animarus"],
  dog: ["dog", "dogs", "doggu", "dogu", "dock", "doggy"],
  cat: ["cat", "cats", "kat", "cut", "catto", "kyatto"],
  pig: ["pig", "pigs", "piggu", "pigu"],
  sheep: ["sheep"],
  wolf: ["wolf", "wolves"],
  // A lesson containing both horse and house must override this alias.
  horse: ["horse", "horses", "house", "hoss", "hoosu", "horsu"],
  ramen: ["ramen", "raamen", "rahmen", "lamen", "laamen", "ramon", "raman", "ramenu", "lamon"],
  what: ["what", "wat", "hwat", "watt", "wot", "but", "watto", "whatto", "hut", "whatt", "hwatto", "howatto", "wha"],
  like: ["like", "lick", "light", "rike", "raiku", "laiku", "riku", "raik", "laik", "rikes", "likes", "liked"],
  school: ["skool", "schoo", "scool"],
  library: ["libary", "librari", "libraries", "liberry"],
  hospital: ["hospitle", "hospitel", "hospita"],
  police: ["polis"],
  "fire station": ["firestation"],
  "post office": ["postoffice", "poster office"],
  "city hall": ["cityhall", "city hole"],
  bank: ["banks", "bunk"],
  station: ["train station", "stashon", "staton", "trainstation"],
  "train station": ["station", "stashon", "staton", "trainstation"],
  "bus station": ["busstation"],
  airport: ["air port", "airpot", "aeroport"],
  "gas station": ["gasstation"],
  stadium: ["stadion", "staduim", "stadiam", "studium"],
  park: ["parc", "parke"],
  gym: ["gim", "jim"],
  "swimming pool": ["swiming pool"],
  playground: ["play ground", "plaground"],
  zoo: ["zoos", "zu"],
  aquarium: ["aqarium", "aquariam", "aquarion", "aquaria"],
  museum: ["musium", "muesum", "museam"],
  "movie theater": ["movie theatre"],
  "amusement park": ["amusment park"],
  castle: ["casle", "cassel", "castel"],
  temple: ["tempel", "templ"],
  beach: ["beech", "bech"],
  farm: ["pharm", "farms"],
  mall: ["moll"],
  supermarket: ["super market", "supermarkt"],
  "convenience store": ["konbini", "conveni"],
  restaurant: ["restraunt", "resturant", "restrant"],
  cafe: ["caffe"],
  bakery: ["bakary", "bakerie"],
  bookstore: ["book store"],
  hotel: ["hotal", "hottel", "hotels"]
};
var DEFAULT_ALIASES = Object.freeze(Object.fromEntries(Object.entries(aliases).map(([k, v]) => [k, Object.freeze(v)])));

// src/profiles/index.js
var freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
var PROFILES = freeze({
  elementaryQuestion: { frame: ["what", "like"], minFrame: 1, fuzz: "question", hypotheses: "pool" },
  sentencePractice: { frame: [], frameThreshold: 0.5, bonus: [], minTokens: 2, forbidden: [], fuzz: "question", hypotheses: "pool" },
  controlledAnswer: { frame: [], fuzz: "controlled" },
  singleWord: { frame: [], fuzz: "controlled" },
  freeResponse: { frame: "i-like", minimumContentWords: 1, maxWords: 4, maxChars: 32, fuzz: "controlled" }
});
var common = {
  leading: ["a", "an", "the", "some", "to", "eat"],
  trailing: ["very much", "so much", "a lot", "too"],
  filler: ["it", "that", "this", "you", "them", "me", "uh", "um", "ah", "eh", "so", "very", "much", "lot", "and", "i"]
};
var FRAMES = freeze(Object.fromEntries(["like", "want", "have", "can"].map((anchor) => [`i-${anchor}`, { ...common, anchor: [anchor] }])));

// src/fuzzy.js
function levenshtein(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] !== b[j])));
    row = next;
  }
  return row[b.length];
}
var FUZZ = Object.freeze({
  question: (len) => len <= 4 ? 1 : len <= 7 ? 2 : 3,
  controlled: (len) => len <= 4 ? 0 : len <= 6 ? 1 : 2,
  none: () => 0
});
function slackFor(fuzz) {
  return typeof fuzz === "function" ? fuzz : FUZZ[fuzz] || FUZZ.none;
}

// src/alternatives.js
var tokensOf = (alternative) => alternative.normalized.split(" ");
function bestEvidence(hits) {
  return hits.filter(Boolean).sort((a, b) => a.distance - b.distance || a.alternativeIndex - b.alternativeIndex)[0] || null;
}
function provenance(hit) {
  if (!hit) return null;
  const { canonical, heard, alternativeIndex, matchType, distance } = hit;
  return { canonical, heard, alternativeIndex, matchType, distance };
}

// src/words.js
var priorities = { exact: 0, alias: 1, plural: 2, phrase: 0, fuzzy: 3 };
var matchRank = (hit) => hit ? priorities[hit.matchType] : Infinity;
function lookup(word, alternative, options, trace = [], excluded = []) {
  var _a, _b, _c, _d, _e;
  const canonical = normalizeText(word);
  const tokens = tokensOf(alternative);
  const variants = (options.aliases[canonical] || []).map(normalizeText);
  const slack = slackFor(options.fuzz)(canonical.length);
  const candidates = [];
  const addPhrase = (phrase, matchType) => {
    const parts = phrase.split(" ");
    for (let i = 0; i <= tokens.length - parts.length; i++) {
      const indices = parts.map((_, j) => i + j);
      if (indices.every((n) => !excluded.includes(n)) && parts.every((p, j) => tokens[i + j] === p))
        candidates.push({ heard: phrase, matchType, distance: 0, indices });
    }
  };
  if (canonical.includes(" ")) addPhrase(canonical, "phrase");
  for (const variant of variants) if (canonical.includes(" ") || variant.includes(" ")) addPhrase(variant, "alias");
  if (!canonical.includes(" ")) {
    tokens.forEach((token, index) => {
      if (excluded.includes(index) || !/^[a-z0-9]+$/.test(token)) return;
      let matchType = null;
      let distance = 0;
      if (token === canonical) matchType = "exact";
      else if (variants.includes(token)) matchType = "alias";
      else if ([token.endsWith("s") ? token.slice(0, -1) : "", token.endsWith("es") ? token.slice(0, -2) : ""].some((base) => base && (base === canonical || variants.includes(base)))) matchType = "plural";
      else {
        distance = levenshtein(token, canonical);
        if (distance <= slack) matchType = "fuzzy";
      }
      if (matchType) candidates.push({ heard: token, matchType, distance, indices: [index] });
    });
  } else if (!candidates.length) {
    const parts = [];
    const used = [...excluded];
    for (const part of canonical.split(" ")) {
      const found = lookup(part, alternative, options, trace, used);
      if (!found) {
        parts.length = 0;
        break;
      }
      parts.push(found);
      used.push(...found.indices);
    }
    if (parts.length) candidates.push({
      heard: parts.map((p) => p.heard).join(" "),
      matchType: "phrase",
      distance: parts.reduce((n, p) => n + p.distance, 0),
      indices: parts.flatMap((p) => p.indices)
    });
  }
  candidates.sort((a, b) => priorities[a.matchType] - priorities[b.matchType] || a.distance - b.distance);
  const best = candidates[0];
  const nearest = tokens.map((token, index) => ({ token, index, distance: levenshtein(token, canonical) })).filter((item) => !excluded.includes(item.index) && /^[a-z0-9]+$/.test(item.token)).sort((a, b) => a.distance - b.distance)[0];
  trace.push({
    word: canonical,
    alternativeIndex: alternative.index,
    bestToken: (_b = (_a = best == null ? void 0 : best.heard) != null ? _a : nearest == null ? void 0 : nearest.token) != null ? _b : null,
    matchType: (_c = best == null ? void 0 : best.matchType) != null ? _c : null,
    distance: (_e = (_d = best == null ? void 0 : best.distance) != null ? _d : nearest == null ? void 0 : nearest.distance) != null ? _e : null,
    slack
  });
  return best ? { canonical, alternativeIndex: alternative.index, ...best } : null;
}
function isNear(word, alternatives, options, excludedWords = []) {
  const parts = normalizeText(word).split(" ");
  return alternatives.some((alt) => parts.every((part) => tokensOf(alt).some((token) => /^[a-z0-9]+$/.test(token) && !excludedWords.includes(token) && levenshtein(token, part) <= slackFor(options.fuzz)(part.length) + 1)));
}

// src/recognition.js
var UNAVAILABLE = /* @__PURE__ */ new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
  "unsupported"
]);
var SILENCE = /* @__PURE__ */ new Set(["no-speech", "aborted"]);
var MESSAGES = {
  "no-speech": "No speech was detected.",
  aborted: "Recognition was aborted.",
  network: "Recognition network error.",
  "start-failed": "Recognition could not start.",
  "bad-grammar": "Recognition grammar error.",
  "not-allowed": "Microphone permission was denied.",
  "service-not-allowed": "Recognition service is not allowed.",
  "audio-capture": "No usable microphone is available.",
  "language-not-supported": "Recognition language is unavailable.",
  unsupported: "Speech recognition is unavailable."
};
var HANDLERS = [
  "onstart",
  "onresult",
  "onerror",
  "onend",
  "onnomatch",
  "onaudiostart",
  "onaudioend",
  "onsoundstart",
  "onsoundend",
  "onspeechstart",
  "onspeechend"
];
var STOP_GRACE_MS = 400;
function classifyError(error, options = {}) {
  const code = typeof error === "string" ? error : (error == null ? void 0 : error.error) || (error == null ? void 0 : error.code) || "unknown";
  const empty = typeof options === "number" ? options : options.consecutiveEmptySessions || 0;
  const kind = UNAVAILABLE.has(code) ? "unavailable" : SILENCE.has(code) ? "silence" : "transient";
  return {
    code,
    kind,
    fallbackSuggested: kind === "unavailable" || empty >= 3,
    message: MESSAGES[code] || "Recognition failed."
  };
}
function implementation(options = {}) {
  if (typeof options === "function") return options;
  if (options.SpeechRecognition !== void 0) return options.SpeechRecognition;
  return typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition;
}
function isRecognitionSupported(options = {}) {
  return typeof implementation(options) === "function";
}
function detach(recognition) {
  for (const name of HANDLERS) recognition[name] = null;
}
function aggregate(segments, maxAlternatives, finalsOnly = false) {
  const selected = segments.filter((segment) => segment && (!finalsOnly || segment.final));
  if (!selected.length) return [];
  const count = Math.min(maxAlternatives, Math.max(...selected.map((segment) => segment.alternatives.length)));
  return normalizeAlternatives(Array.from({ length: count }, (_, index) => {
    const parts = selected.map((segment) => segment.alternatives[index] || segment.alternatives[0]).filter(Boolean);
    const confidences = parts.map((part) => part.confidence).filter((value) => typeof value === "number" && Number.isFinite(value));
    return {
      transcript: parts.map((part) => part.transcript).join(" "),
      confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
      final: selected.every((segment) => segment.final)
    };
  }));
}
function createRecognizer(options = {}) {
  var _a, _b;
  const Constructor = implementation(options);
  const supported = typeof Constructor === "function";
  const maxAlternatives = (_a = options.maxAlternatives) != null ? _a : 5;
  const timeoutMs = (_b = options.timeoutMs) != null ? _b : 8e3;
  let state = "idle";
  let consecutiveEmptySessions = 0;
  let session = null;
  function clearTimers(current) {
    clearTimeout(current.safetyTimer);
    clearTimeout(current.finishTimer);
    current.safetyTimer = null;
    current.finishTimer = null;
  }
  function finish(current, reason, error) {
    var _a2, _b2;
    if (session !== current || current.finished) return;
    current.finished = true;
    clearTimers(current);
    detach(current.recognition);
    session = null;
    if (state !== "destroyed") state = "idle";
    if (reason !== "cancelled") {
      consecutiveEmptySessions = current.heardSpeech ? 0 : consecutiveEmptySessions + 1;
    }
    const alternatives = reason === "cancelled" ? [] : aggregate(current.segments, maxAlternatives);
    const final = alternatives.length > 0 && alternatives.every((alternative) => alternative.final === true);
    const errorCode = error || (!current.heardSpeech && reason !== "cancelled" ? "no-speech" : null);
    try {
      if (errorCode) (_a2 = options.onError) == null ? void 0 : _a2.call(options, classifyError(errorCode, { consecutiveEmptySessions }));
    } finally {
      (_b2 = options.onEnd) == null ? void 0 : _b2.call(options, { alternatives, final, reason });
    }
  }
  function requestStop(current, reason) {
    if (session !== current || current.finished || current.reason) return;
    current.reason = reason;
    state = "stopping";
    clearTimeout(current.safetyTimer);
    current.safetyTimer = null;
    current.finishTimer = setTimeout(() => finish(current, reason), STOP_GRACE_MS);
    try {
      current.recognition.stop();
    } catch {
      finish(current, reason);
    }
  }
  const adapter = {
    get supported() {
      return supported;
    },
    get state() {
      return state;
    },
    get consecutiveEmptySessions() {
      return consecutiveEmptySessions;
    },
    start() {
      var _a2, _b2, _c, _d, _e, _f, _g;
      if (state === "destroyed") return false;
      if (!supported) {
        (_a2 = options.onError) == null ? void 0 : _a2.call(options, classifyError("unsupported", { consecutiveEmptySessions }));
        return false;
      }
      if (session) {
        (_b2 = options.onError) == null ? void 0 : _b2.call(options, classifyError("start-failed", { consecutiveEmptySessions }));
        return false;
      }
      let recognition;
      try {
        recognition = new Constructor();
        recognition.lang = (_c = options.lang) != null ? _c : "en-US";
        recognition.maxAlternatives = maxAlternatives;
        recognition.interimResults = (_d = options.interimResults) != null ? _d : true;
        recognition.continuous = (_e = options.continuous) != null ? _e : false;
      } catch {
        (_f = options.onError) == null ? void 0 : _f.call(options, classifyError("start-failed", { consecutiveEmptySessions }));
        return false;
      }
      const current = {
        recognition,
        segments: [],
        heardSpeech: false,
        finished: false,
        safetyTimer: null,
        finishTimer: null,
        reason: null
      };
      session = current;
      state = "starting";
      let inStart = true;
      const queued = [];
      const handle = (callback) => (event) => {
        const deliver = () => {
          if (session === current && !current.finished) callback(event);
        };
        if (inStart) queued.push(deliver);
        else deliver();
      };
      recognition.onstart = handle(() => {
        var _a3;
        if (state === "starting") state = "listening";
        (_a3 = options.onStart) == null ? void 0 : _a3.call(options);
      });
      recognition.onresult = handle((event) => {
        var _a3, _b3, _c2;
        const results = event.results || [];
        let hasNewFinal = false;
        current.segments.length = results.length;
        for (let index = (_a3 = event.resultIndex) != null ? _a3 : 0; index < results.length; index += 1) {
          const result = results[index];
          const alternatives2 = normalizeAlternatives(Array.from({ length: Math.min(result.length, maxAlternatives) }, (_, rank) => {
            var _a4, _b4;
            return {
              transcript: ((_a4 = result[rank]) == null ? void 0 : _a4.transcript) || "",
              confidence: (_b4 = result[rank]) == null ? void 0 : _b4.confidence,
              final: Boolean(result.isFinal)
            };
          }));
          current.segments[index] = { alternatives: alternatives2, final: Boolean(result.isFinal) };
          hasNewFinal || (hasNewFinal = Boolean(result.isFinal) && alternatives2.length > 0);
        }
        const alternatives = aggregate(current.segments, maxAlternatives);
        if (!alternatives.length) return;
        current.heardSpeech = true;
        consecutiveEmptySessions = 0;
        if (hasNewFinal) (_b3 = options.onFinal) == null ? void 0 : _b3.call(options, aggregate(current.segments, maxAlternatives, true));
        if (session === current && current.segments.some((segment) => segment && !segment.final)) {
          (_c2 = options.onInterim) == null ? void 0 : _c2.call(options, alternatives);
        }
      });
      recognition.onerror = handle((event) => {
        const code = (event == null ? void 0 : event.error) || "unknown";
        finish(current, current.reason || (SILENCE.has(code) ? "no-speech" : "error"), code);
      });
      recognition.onend = handle(() => {
        finish(current, current.reason || (current.heardSpeech ? "final" : "no-speech"));
      });
      try {
        recognition.start();
      } catch {
        inStart = false;
        clearTimers(current);
        detach(recognition);
        session = null;
        state = "idle";
        (_g = options.onError) == null ? void 0 : _g.call(options, classifyError("start-failed", { consecutiveEmptySessions }));
        return false;
      }
      inStart = false;
      current.safetyTimer = setTimeout(() => requestStop(current, "timeout"), timeoutMs);
      for (const deliver of queued) deliver();
      return true;
    },
    stop() {
      if (session && state !== "destroyed") requestStop(session, "stopped");
    },
    cancel() {
      if (!session || state === "destroyed") return;
      const current = session;
      detach(current.recognition);
      try {
        current.recognition.abort();
      } catch {
      }
      finish(current, "cancelled");
    },
    destroy() {
      if (state === "destroyed") return;
      const current = session;
      state = "destroyed";
      if (current) {
        detach(current.recognition);
        try {
          current.recognition.abort();
        } catch {
        }
        finish(current, "cancelled");
      }
    }
  };
  return adapter;
}

// src/result.js
var OUTCOMES = Object.freeze(["correct", "near-miss", "incomplete", "different-answer", "no-speech", "recognition-error", "pending"]);
function makeResult(profile, alternatives, fields = {}) {
  var _a;
  const result = {
    ok: false,
    outcome: alternatives.length ? "different-answer" : "no-speech",
    profile,
    transcript: ((_a = alternatives[0]) == null ? void 0 : _a.transcript) || "",
    alternatives,
    canonical: null,
    value: null,
    freeForm: false,
    matched: {},
    missing: [],
    nearMiss: false,
    wrongCategory: null,
    evidence: {},
    error: null,
    debug: void 0,
    ...fields
  };
  result.nearMiss = result.outcome === "near-miss";
  return result;
}
function resultFromError(error, { profile = "elementaryQuestion" } = {}) {
  const classified = error && typeof error === "object" && error.kind ? { ...error } : classifyError(typeof error === "string" ? error : (error == null ? void 0 : error.code) || (error == null ? void 0 : error.error));
  return makeResult(profile, [], { outcome: classified.kind === "silence" ? "no-speech" : "recognition-error", error: classified });
}

// src/matchers/phrase.js
function matchPhrase(alternatives, options, debug) {
  var _a, _b, _c, _d, _e, _f, _g;
  const question = options.profile === "elementaryQuestion";
  const content = question ? [options.category] : options.content;
  const canonical = question ? options.category : (_a = options.id) != null ? _a : content[0];
  const perAlt = alternatives.map((alt) => ({ alt, hit: bestEvidence(content.map((word) => lookup(word, alt, options, debug.lookups))) }));
  const topOnly = options.hypotheses === "top";
  const contentPool = topOnly && ((_b = perAlt[0]) == null ? void 0 : _b.hit) ? perAlt.slice(0, 1) : perAlt;
  const eligible = !question && !topOnly ? contentPool.filter((item) => tokensOf(item.alt).length >= options.minTokens) : contentPool;
  const main = bestEvidence((eligible.some((item) => item.hit) ? eligible : contentPool).map((item) => item.hit));
  const framePool = topOnly ? perAlt.slice(0, 1) : perAlt;
  const matched = question ? { category: Boolean(main) } : { content: Boolean(main) };
  const evidence = {};
  if (main) evidence[question ? "category" : "content"] = provenance(main);
  for (const word of options.frame) {
    const hit = bestEvidence(framePool.map(({ alt, hit: noun }) => lookup(word, alt, options, debug.lookups, question ? (noun == null ? void 0 : noun.indices) || [] : [])));
    matched[word] = Boolean(hit);
    if (hit) evidence[word] = provenance(hit);
  }
  const frameHits = options.frame.filter((word) => matched[word]).length;
  const required = question ? options.minFrame : Math.ceil(options.frame.length * options.frameThreshold);
  let wrongCategory = null;
  if (question) {
    for (const competitor of options.competitors) {
      const hit = bestEvidence(alternatives.map((alt) => lookup(competitor, alt, options, debug.lookups)));
      if ((hit == null ? void 0 : hit.distance) === 0) debug.competitorsHeard.push(provenance(hit));
    }
    if (!perAlt.some((item) => {
      var _a2;
      return ((_a2 = item.hit) == null ? void 0 : _a2.distance) === 0;
    })) wrongCategory = ((_c = debug.competitorsHeard[0]) == null ? void 0 : _c.canonical) || null;
  } else {
    matched.bonus = [];
    matched.forbidden = [];
    for (const word of options.bonus) {
      const hit = bestEvidence(framePool.map(({ alt }) => lookup(word, alt, options, debug.lookups)));
      if (hit) {
        matched.bonus.push(word);
        evidence[`bonus:${word}`] = provenance(hit);
      }
    }
    for (const word of options.forbidden) {
      const hit = bestEvidence(framePool.map(({ alt }) => lookup(word, alt, { ...options, fuzz: "none" }, debug.lookups)));
      if (hit) {
        matched.forbidden.push(word);
        evidence[`forbidden:${word}`] = provenance(hit);
      }
    }
  }
  const contentAlt = alternatives.find((alt) => alt.index === (main == null ? void 0 : main.alternativeIndex));
  const enoughTokens = question || Boolean(contentAlt && tokensOf(contentAlt).length >= options.minTokens);
  const forbidden = ((_d = matched.forbidden) == null ? void 0 : _d.length) > 0;
  const ok = Boolean(main && frameHits >= required && enoughTokens && !wrongCategory && !forbidden);
  const missing = [!main && (question ? options.category : canonical), ...options.frame.filter((word) => !matched[word])].filter(Boolean);
  const excluded = ["do", "you", "i", ...options.frame, ...debug.competitorsHeard.map((e) => e.heard)];
  for (const item of debug.lookups) if (options.frame.includes(item.word) && item.matchType && item.bestToken) excluded.push(item.bestToken);
  const near = !main && content.some((word) => isNear(word, alternatives, options, excluded));
  const outcome = !alternatives.length ? "no-speech" : ok ? "correct" : wrongCategory || forbidden ? "different-answer" : main ? "incomplete" : near ? "near-miss" : frameHits ? "incomplete" : "different-answer";
  debug.rule = question ? "category and minimum frame anchors, with no unopposed exact competitor" : "any content keyword, minimum token count and frame fraction, without forbidden words";
  debug.decision = ok ? "accepted: content and required frame evidence heard" : wrongCategory ? `rejected: wrong category ${wrongCategory} heard at distance 0, ${canonical} absent or only fuzzy` : forbidden ? `rejected: forbidden ${matched.forbidden.join(", ")} heard` : `rejected: ${outcome}; ${main ? "content heard" : "content missing"}, ${frameHits}/${required} required frame anchors, token minimum ${enoughTokens ? "met" : "unmet"}`;
  return makeResult(options.profile, alternatives, {
    ok,
    outcome,
    canonical,
    matched,
    evidence,
    missing,
    wrongCategory,
    transcript: (_g = (_f = contentAlt == null ? void 0 : contentAlt.transcript) != null ? _f : (_e = alternatives[0]) == null ? void 0 : _e.transcript) != null ? _g : ""
  });
}

// src/matchers/answer.js
function vocabularyItems(vocabulary = []) {
  return vocabulary.map((item) => typeof item === "string" ? { id: item, words: [item] } : { id: item.id, words: item.words });
}
function findVocabulary(alternatives, options, trace) {
  var _a;
  const items = vocabularyItems(options.vocabulary);
  const found = [];
  for (const alt of alternatives) {
    const candidates = items.map((item) => ({ item, hit: bestEvidence(item.words.map((word) => lookup(word, alt, options, trace))) }));
    candidates.sort((a, b) => {
      var _a2, _b, _c, _d;
      return ((_b = (_a2 = a.hit) == null ? void 0 : _a2.distance) != null ? _b : Infinity) - ((_d = (_c = b.hit) == null ? void 0 : _c.distance) != null ? _d : Infinity) || matchRank(a.hit) - matchRank(b.hit);
    });
    if ((_a = candidates[0]) == null ? void 0 : _a.hit) found.push({ ...candidates[0], alt });
  }
  return found;
}
function matchVocabulary(alternatives, options, debug) {
  var _a, _b, _c, _d, _e, _f;
  const found = findVocabulary(alternatives, options, debug.lookups);
  const winner = found[0];
  const matched = { content: Boolean(winner) };
  const evidence = {};
  if (winner) evidence.content = provenance(winner.hit);
  for (const word of options.frame) {
    const hit = bestEvidence(alternatives.map((alt) => lookup(word, alt, options, debug.lookups)));
    matched[word] = Boolean(hit);
    if (hit) evidence[word] = provenance(hit);
  }
  const frameHits = options.frame.filter((word) => matched[word]).length;
  const frameOK = frameHits >= options.minFrame;
  const wrongCategory = winner && options.expected != null && winner.item.id !== options.expected ? winner.item.id : null;
  debug.competitorsHeard = found.filter((candidate) => candidate.item.id !== options.expected).map((candidate) => provenance(candidate.hit));
  const ok = Boolean(winner && !wrongCategory && frameOK);
  const items = vocabularyItems(options.vocabulary);
  const targets = options.expected == null ? items : items.filter((item) => item.id === options.expected);
  const excluded = found.flatMap((candidate) => candidate.hit.heard.split(" "));
  for (const entry of debug.lookups) if (options.frame.includes(entry.word) && entry.matchType && entry.bestToken) excluded.push(entry.bestToken);
  const near = !winner && targets.some((item) => item.words.some((word) => isNear(word, alternatives, options, [...excluded, "i", "do", "you"])));
  const outcome = !alternatives.length ? "no-speech" : ok ? "correct" : wrongCategory ? "different-answer" : winner ? "incomplete" : near ? "near-miss" : frameHits ? "incomplete" : "different-answer";
  debug.rule = "closest vocabulary item per hypothesis; first ranked vocabulary hypothesis decides; required frame anchors";
  debug.decision = ok ? `accepted: ${winner.item.id} from alternative ${winner.alt.index}` : wrongCategory ? `rejected: ranked answer ${wrongCategory} differs from expected ${options.expected}` : `rejected: ${outcome}`;
  return makeResult(options.profile, alternatives, {
    ok,
    outcome,
    value: (_a = winner == null ? void 0 : winner.item.id) != null ? _a : null,
    canonical: (_b = winner == null ? void 0 : winner.item.id) != null ? _b : null,
    transcript: (_e = (_d = winner == null ? void 0 : winner.alt.transcript) != null ? _d : (_c = alternatives[0]) == null ? void 0 : _c.transcript) != null ? _e : "",
    wrongCategory,
    matched,
    evidence,
    missing: [...!winner ? [(_f = options.expected) != null ? _f : "content"] : [], ...options.frame.filter((word) => !matched[word])]
  });
}

// src/matchers/free.js
function matchFree(alternatives, options, debug) {
  var _a;
  const frame = options.frame;
  const anchors = alternatives.map((alt) => ({ alt, hit: bestEvidence(frame.anchor.map((word) => lookup(word, alt, options, debug.lookups))) }));
  const known = ((_a = options.vocabulary) == null ? void 0 : _a.length) ? findVocabulary(alternatives, options, debug.lookups) : [];
  const anchor = bestEvidence(anchors.map((item) => item.hit));
  if (known.length && anchor) {
    const winner = known[0];
    debug.rule = "prefer known vocabulary, otherwise extract bounded content after a frame anchor";
    debug.decision = `accepted: known vocabulary ${winner.item.id} preferred over free form`;
    return makeResult(options.profile, alternatives, {
      ok: true,
      outcome: "correct",
      value: winner.item.id,
      canonical: winner.item.id,
      transcript: winner.alt.transcript,
      matched: { anchor: true, content: true },
      evidence: { anchor: provenance(anchor), content: provenance(winner.hit) }
    });
  }
  for (const { alt, hit } of anchors) {
    if (!hit) continue;
    let words = tokensOf(alt).slice(Math.max(...hit.indices) + 1);
    while (words.length && frame.leading.includes(words[0])) words.shift();
    let phrase = words.join(" ");
    for (const tail of [...frame.trailing].map(normalizeText).sort((a, b) => b.length - a.length)) {
      if (phrase === tail) {
        phrase = "";
        break;
      }
      if (phrase.endsWith(` ${tail}`)) {
        phrase = phrase.slice(0, -tail.length - 1);
        break;
      }
    }
    words = phrase ? phrase.split(" ") : [];
    if (words.filter((word) => !frame.filler.includes(word)).length < options.minimumContentWords) continue;
    words = words.slice(0, options.maxWords);
    while (words.join(" ").length > options.maxChars) words.pop();
    if (!words.length || words.filter((word) => !frame.filler.includes(word)).length < options.minimumContentWords) continue;
    const value = words.join(" ");
    debug.rule = "prefer known vocabulary, otherwise extract bounded content after a frame anchor";
    debug.decision = `accepted: extracted ${value} from alternative ${alt.index}`;
    return makeResult(options.profile, alternatives, {
      ok: true,
      outcome: "correct",
      value,
      freeForm: true,
      transcript: alt.transcript,
      matched: { anchor: true, content: true },
      evidence: { anchor: provenance(hit), content: { canonical: value, heard: value, alternativeIndex: alt.index, matchType: "phrase", distance: 0 } }
    });
  }
  debug.rule = "frame anchor and minimum non-filler content, truncated on word boundaries";
  debug.decision = anchor ? "rejected: incomplete content after frame anchor" : "rejected: frame anchor missing";
  return makeResult(options.profile, alternatives, {
    outcome: !alternatives.length ? "no-speech" : anchor ? "incomplete" : "different-answer",
    matched: { anchor: Boolean(anchor), content: false },
    evidence: anchor ? { anchor: provenance(anchor) } : {},
    missing: anchor ? ["content"] : ["anchor", "content"]
  });
}

// src/coach.js
function toCoachAttempt(result, { exerciseId, target, focus } = {}) {
  if (result.ok) return { exerciseId, target, focus, correct: true };
  if (result.outcome !== "near-miss") return null;
  return {
    exerciseId,
    target,
    focus,
    correct: false,
    transcript: result.transcript,
    alternatives: result.alternatives.map(({ transcript, confidence }) => ({ transcript, confidence }))
  };
}

// src/index.js
var list = (value) => value == null ? [] : Array.isArray(value) ? [...value] : [value];
function resolve(input) {
  var _a, _b, _c, _d;
  const profile = input.profile;
  if (!Object.prototype.hasOwnProperty.call(PROFILES, profile)) throw new Error(`Unknown profile: ${profile}`);
  const options = { ...PROFILES[profile], ...input };
  const required = { elementaryQuestion: "category", sentencePractice: "content", controlledAnswer: "vocabulary", singleWord: "target" }[profile];
  if (required && (!options[required] || !list(options[required]).length)) throw new Error(`${profile} requires ${required}`);
  const aliases2 = {};
  for (const source of [input.replaceAliases ? {} : DEFAULT_ALIASES, input.aliases || {}]) {
    for (const [key, values] of Object.entries(source)) {
      const canonical = normalizeText(key);
      aliases2[canonical] = [.../* @__PURE__ */ new Set([...aliases2[canonical] || [], ...list(values).map(normalizeText)])];
    }
  }
  options.aliases = aliases2;
  if (profile === "freeResponse") {
    options.frame = typeof options.frame === "string" ? FRAMES[options.frame] : options.frame;
    if (!((_b = (_a = options.frame) == null ? void 0 : _a.anchor) == null ? void 0 : _b.length)) throw new Error("freeResponse requires a known frame or frame object with anchor");
    options.frame = { leading: [], trailing: [], filler: [], ...options.frame };
  } else {
    options.frame = list(options.frame).map(normalizeText);
    (_c = options.minFrame) != null ? _c : options.minFrame = options.frame.length;
  }
  if (profile === "elementaryQuestion") {
    options.category = normalizeText(options.category);
    options.competitors = list((_d = input.competitors) != null ? _d : ["color", "food", "animal", "sport", "drink"].filter((word) => word !== options.category)).map(normalizeText);
  }
  if (profile === "sentencePractice") {
    options.content = list(options.content).map(normalizeText);
    options.bonus = list(options.bonus).map(normalizeText);
    options.forbidden = list(options.forbidden).map(normalizeText);
  }
  if (profile === "singleWord") {
    options.vocabulary = [options.target, ...list(input.vocabulary).filter((item) => (typeof item === "string" ? item : item.id) !== options.target)];
    options.expected = options.target;
    options.frame = [];
    options.minFrame = 0;
  }
  if (options.vocabulary) {
    options.vocabulary = vocabularyItems(list(options.vocabulary));
    if (options.vocabulary.some((item) => {
      var _a2;
      return typeof item.id !== "string" || !((_a2 = item.words) == null ? void 0 : _a2.length) || item.words.some((word) => !normalizeText(word));
    }))
      throw new Error(`${profile} requires vocabulary strings or { id, words } entries`);
  }
  if (required && typeof options[required] === "string" && !normalizeText(options[required])) throw new Error(`${profile} requires ${required}`);
  return options;
}
function createMatcher(input = {}) {
  const options = resolve(input);
  let last = null;
  const judge = (inputAlternatives, live) => {
    const alternatives = normalizeAlternatives(inputAlternatives);
    const debug = {
      profile: options.profile,
      options: JSON.parse(JSON.stringify(options)),
      rule: "",
      normalized: alternatives.map((alt) => ({ alternativeIndex: alt.index, tokens: alt.normalized.split(" ") })),
      lookups: [],
      competitorsHeard: [],
      decision: ""
    };
    const result = options.profile === "freeResponse" ? matchFree(alternatives, options, debug) : options.profile === "controlledAnswer" || options.profile === "singleWord" ? matchVocabulary(alternatives, options, debug) : matchPhrase(alternatives, options, debug);
    if (live && !result.ok) {
      result.outcome = "pending";
      result.nearMiss = false;
      debug.decision = `pending: ${debug.decision}`;
    }
    last = { ...result, debug };
    if (options.debug) result.debug = debug;
    return result;
  };
  return {
    match: (alternatives) => judge(alternatives, false),
    matchLive: (alternatives) => judge(alternatives, true),
    debugLastResult: () => last === null ? null : JSON.parse(JSON.stringify(last))
  };
}
function match({ alternatives, ...options } = {}) {
  return createMatcher(options).match(alternatives);
}
var convenience = (profile) => (alternatives, options = {}) => match({ ...options, profile, alternatives });
var matchQuestion = convenience("elementaryQuestion");
var matchAnswer = convenience("controlledAnswer");
var matchSingleWord = convenience("singleWord");
var matchFreeResponse = convenience("freeResponse");
var matchSentence = convenience("sentencePractice");
export {
  DEFAULT_ALIASES,
  FRAMES,
  OUTCOMES,
  PROFILES,
  classifyError,
  createMatcher,
  createRecognizer,
  isRecognitionSupported,
  levenshtein,
  match,
  matchAnswer,
  matchFreeResponse,
  matchQuestion,
  matchSentence,
  matchSingleWord,
  normalizeAlternatives,
  normalizeText,
  resultFromError,
  toCoachAttempt
};
