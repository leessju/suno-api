/**
 * Context Assembler — pure function, no I/O, deterministic
 *
 * Assembly order:
 * 1. system: channel.systemPrompt + forbidden words + lyric format
 * 2. system: constraints_json (verbatim, NEVER summarized)
 * 3. system: session.summary
 * 4. system: session.mediaAnalysis
 * 5. recentMessages (sliding window, oldest→newest)
 * 6. user: userInput
 */

export type AssemblyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AssemblyInput = {
  channel: {
    systemPrompt: string;
    forbiddenWords?: string[];
    recommendedWords?: string[];
    lyricFormat?: string;
  };
  session: {
    summary: string | null;
    constraintsJson: string | null;
    mediaAnalysis: object | null;
  };
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    tokenCount: number;
  }>;
  userInput: string;
  budget: {
    maxTokens: number;
    reserveForResponse: number;
  };
  countTokens?: (text: string) => number;
};

export type AssemblyOutput = {
  messages: AssemblyMessage[];
  usedTokens: number;
  compressionNeeded: boolean;
};

const defaultCountTokens = (text: string): number => Math.ceil(text.length / 4);

export function buildContext(input: AssemblyInput): AssemblyOutput {
  const count = input.countTokens ?? defaultCountTokens;
  const available = input.budget.maxTokens - input.budget.reserveForResponse;

  const messages: AssemblyMessage[] = [];
  let usedTokens = 0;

  // 1. System: channel persona
  const systemContent = buildChannelSystemContent(input.channel);
  messages.push({ role: 'system', content: systemContent });
  usedTokens += count(systemContent);

  // 2. System: constraints_json (verbatim, never summarized)
  if (input.session.constraintsJson) {
    const constraintsContent =
      `## Session Constraints (NEVER MODIFY)\n${input.session.constraintsJson}`;
    messages.push({ role: 'system', content: constraintsContent });
    usedTokens += count(constraintsContent);
  }

  // 3. System: session summary
  if (input.session.summary) {
    const summaryContent = `## Session Summary\n${input.session.summary}`;
    messages.push({ role: 'system', content: summaryContent });
    usedTokens += count(summaryContent);
  }

  // 4. System: media analysis (confidence gate: omit chord_progression if confidence < 0.5)
  if (input.session.mediaAnalysis) {
    const analysis = input.session.mediaAnalysis as Record<string, unknown>;
    const gatedAnalysis: Record<string, unknown> = { ...analysis };
    const confidence =
      typeof gatedAnalysis.chord_progression_confidence === 'number'
        ? gatedAnalysis.chord_progression_confidence
        : 1;
    if (confidence < 0.5) {
      delete gatedAnalysis.chord_progression;
    }
    const mediaContent =
      `## Reference Track Analysis\n${JSON.stringify(gatedAnalysis, null, 2)}`;
    messages.push({ role: 'system', content: mediaContent });
    usedTokens += count(mediaContent);
  }

  // 5. Sliding window: recent messages (trim from oldest if over budget)
  const userInputTokens = count(input.userInput);
  let windowBudget = available - usedTokens - userInputTokens;
  let compressionNeeded = false;

  // Build window from oldest to newest, trimming from front if needed
  const windowMessages = [...input.recentMessages];
  while (windowMessages.length > 0) {
    const totalWindowTokens = windowMessages.reduce((s, m) => s + m.tokenCount, 0);
    if (totalWindowTokens <= windowBudget) break;
    windowMessages.shift(); // Remove oldest
    if (windowMessages.length <= 2) {
      compressionNeeded = true;
      break;
    }
  }

  for (const msg of windowMessages) {
    messages.push({ role: msg.role, content: msg.content });
    usedTokens += msg.tokenCount;
  }

  // 6. User input
  messages.push({ role: 'user', content: input.userInput });
  usedTokens += userInputTokens;

  return { messages, usedTokens, compressionNeeded };
}

function buildChannelSystemContent(channel: AssemblyInput['channel']): string {
  const parts: string[] = [channel.systemPrompt];

  const forbidden = channel.forbiddenWords ?? [];
  const lyricFormat = channel.lyricFormat ?? 'free';

  const recommended = channel.recommendedWords ?? [];
  const constraints: string[] = ['## 출력 제약'];
  if (forbidden.length > 0) {
    constraints.push(`금지어 (절대 사용 금지): ${forbidden.join(', ')}`);
  }
  if (recommended.length > 0) {
    constraints.push(`권장어 (적극 활용): ${recommended.join(', ')}`);
  }
  if (lyricFormat === 'jp2_en1') {
    constraints.push('가사 형식: [일어 2줄 + 영문 1줄] × N연 (N≥2) 엄격 준수');
  } else if (lyricFormat !== 'free') {
    constraints.push(`가사 형식: ${lyricFormat}`);
  }

  if (constraints.length > 1) {
    parts.push(constraints.join('\n'));
  }

  return parts.join('\n\n');
}
