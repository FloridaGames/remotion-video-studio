// Curated free stock video library — Mixkit Free License (no attribution required)
// https://mixkit.co/license/
export type StockVideo = {
  id: string;
  url: string;
  thumb: string;
  title: string;
  tags: string[];
};

const mk = (id: number, title: string, tags: string[]): StockVideo => ({
  id: `mixkit-${id}`,
  url: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
  thumb: `https://assets.mixkit.co/videos/${id}/${id}-thumb-720-0.jpg`,
  title,
  tags,
});

export const CURATED_STOCK_VIDEOS: StockVideo[] = [
  mk(4503, "Students walking on campus", ["campus", "students"]),
  mk(4519, "Students walking in a university", ["campus", "students"]),
  mk(4520, "Students resting in a university garden", ["campus", "outdoor"]),
  mk(4566, "Students studying on a bench", ["study", "outdoor"]),
  mk(4613, "Teacher explaining mathematical formulas", ["lecture", "math"]),
  mk(4616, "Equations on a blackboard", ["math", "blackboard"]),
  mk(4619, "Solving formulas on a blackboard", ["math", "blackboard"]),
  mk(4794, "Students discussing in a cafeteria", ["students", "discussion"]),
  mk(8802, "Students studying quietly in a library", ["library", "study"]),
  mk(8882, "Academic research in college library", ["library", "research"]),
  mk(21595, "Library tour, shelves of books", ["library", "books"]),
  mk(23300, "Medical students sharing notes", ["medical", "students"]),
  mk(27729, "Medical lecture at a university", ["lecture", "medical"]),
  mk(48165, "University classroom with a professor", ["lecture", "classroom"]),
  mk(48166, "College students working together", ["classroom", "teamwork"]),
  mk(4510, "Boy reading a book in a library", ["library", "reading"]),
  mk(4531, "Girl doing homework in a library", ["library", "study"]),
  mk(4761, "Concentrated student studying at home", ["study", "remote"]),
  mk(28321, "Student studying his notes", ["study", "notes"]),
  mk(101309, "Panning shot of a college study desk", ["study", "desk"]),
];
