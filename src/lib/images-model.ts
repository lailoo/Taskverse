import type { Task } from "./types";

export function taskImages(task: Task): string[] {
  return task.images ?? (task.image ? [task.image] : []);
}
