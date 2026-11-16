import type { ParsedSide } from './parse.js';

/** Fallback for requirement text the rule-based parser cannot read. */
export interface RequirementsLlm {
  /** Returns the parsed hardware, or null to leave it unknown. */
  parse(text: string): Promise<ParsedSide | null>;
}

/** Default provider: never guesses, so unparsed fields stay unknown. */
export const noneLlm: RequirementsLlm = {
  async parse() {
    return null;
  },
};
