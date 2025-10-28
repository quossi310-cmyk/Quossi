export function generateTasks(qScore: number) {
  if (qScore < 40)
    return ["Track your top 3 expenses today", "Write 1 thing you want peace with financially"];
  if (qScore < 70)
    return ["Plan a no-spend weekend", "Do a 5-minute confidence reflection"];
  return ["Mentor someone financially", "Write your 3 golden habits for wealth balance"];
}
