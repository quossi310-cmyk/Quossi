import type { Range } from "../engines/ranges";

type Phase = { phase: string; description: string };
type MovieMap = Record<string, Record<Range, Phase>>;

const MOVIES: MovieMap = {
  Rocky: {
    Storm: { phase: "training", description: "you’re building mental muscle." },
    Flow:  { phase: "fight",    description: "you’re in the ring facing resistance." },
    Gold:  { phase: "victory",  description: "you’ve mastered emotional finance." },
  },
  Inception: {
    Storm: { phase: "dream layers", description: "you’re discovering your financial subconscious." },
    Flow:  { phase: "architect",    description: "you’re building clarity from chaos." },
    Gold:  { phase: "realization",  description: "your mind and money are aligned." },
  },
};

export function getMovieAnalogy(movie: string, range: Range) {
  const lib = MOVIES[movie] ?? MOVIES.Rocky;
  return lib[range];
}
