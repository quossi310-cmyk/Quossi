import { getRange } from "./ranges";
import { getMovieAnalogy } from "./moviesDB";

export function getStoryAnalogy(qScore: number, favoriteMovie: string) {
  const range = getRange(qScore);
  const analogy = getMovieAnalogy(favoriteMovie, range);
  return {
    range,
    message: `You're in your ${analogy.phase} phase — ${analogy.description}`,
  };
}
