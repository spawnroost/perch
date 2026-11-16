export type VocabKind = 'mood' | 'theme' | 'pacing' | 'form';

export interface VocabEntry {
  readonly id: string;
  readonly kind: VocabKind;
  readonly label: string;
}

/** Neutral taste vocabulary. Source-agnostic: IGDB (and other sources) map onto these ids. */
export const VOCAB = [
  // mood
  { id: 'dark', kind: 'mood', label: 'Dark' },
  { id: 'cozy', kind: 'mood', label: 'Cozy' },
  { id: 'melancholic', kind: 'mood', label: 'Melancholic' },
  { id: 'high-tension', kind: 'mood', label: 'High tension' },
  { id: 'whimsical', kind: 'mood', label: 'Whimsical' },
  { id: 'wholesome', kind: 'mood', label: 'Wholesome' },
  { id: 'comedic', kind: 'mood', label: 'Comedic' },
  { id: 'atmospheric', kind: 'mood', label: 'Atmospheric' },
  { id: 'emotional', kind: 'mood', label: 'Emotional' },
  // theme
  { id: 'sci-fi', kind: 'theme', label: 'Sci-fi' },
  { id: 'fantasy', kind: 'theme', label: 'Fantasy' },
  { id: 'post-apocalyptic', kind: 'theme', label: 'Post-apocalyptic' },
  { id: 'mythology', kind: 'theme', label: 'Mythology' },
  { id: 'horror', kind: 'theme', label: 'Horror' },
  { id: 'heist', kind: 'theme', label: 'Heist' },
  { id: 'mystery', kind: 'theme', label: 'Mystery' },
  { id: 'war', kind: 'theme', label: 'War' },
  { id: 'historical', kind: 'theme', label: 'Historical' },
  { id: 'cyberpunk', kind: 'theme', label: 'Cyberpunk' },
  { id: 'crime', kind: 'theme', label: 'Crime' },
  { id: 'romance', kind: 'theme', label: 'Romance' },
  { id: 'supernatural', kind: 'theme', label: 'Supernatural' },
  { id: 'found-family', kind: 'theme', label: 'Found family' },
  { id: 'story-rich', kind: 'theme', label: 'Story-rich' },
  // pacing
  { id: 'slow-burn', kind: 'pacing', label: 'Slow burn' },
  { id: 'fast-paced', kind: 'pacing', label: 'Fast-paced' },
  { id: 'relaxed', kind: 'pacing', label: 'Relaxed' },
  { id: 'methodical', kind: 'pacing', label: 'Methodical' },
  { id: 'challenging', kind: 'pacing', label: 'Challenging' },
  // form
  { id: 'exploration', kind: 'form', label: 'Exploration' },
  { id: 'roguelike', kind: 'form', label: 'Roguelike' },
  { id: 'open-world', kind: 'form', label: 'Open world' },
  { id: 'puzzle', kind: 'form', label: 'Puzzle' },
  { id: 'strategy', kind: 'form', label: 'Strategy' },
  { id: 'competitive', kind: 'form', label: 'Competitive' },
  { id: 'co-op', kind: 'form', label: 'Co-op' },
  { id: 'sandbox', kind: 'form', label: 'Sandbox' },
  { id: 'survival', kind: 'form', label: 'Survival' },
  { id: 'stealth', kind: 'form', label: 'Stealth' },
  { id: 'first-person', kind: 'form', label: 'First-person' },
  { id: 'metroidvania', kind: 'form', label: 'Metroidvania' },
  { id: 'action', kind: 'form', label: 'Action' },
  { id: 'shooter', kind: 'form', label: 'Shooter' },
  { id: 'platformer', kind: 'form', label: 'Platformer' },
  { id: 'rpg', kind: 'form', label: 'RPG' },
  { id: 'management', kind: 'form', label: 'Management & building' },
] as const satisfies readonly VocabEntry[];

export type VocabId = (typeof VOCAB)[number]['id'];

export const VOCAB_IDS: readonly VocabId[] = VOCAB.map((v) => v.id);
