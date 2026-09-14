import type { Task } from "./types";

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };

export function resolveTaskReference(tasks: Task[], reference: string): Task | undefined {
  const exact = tasks.find(task => task.id === reference);
  if (exact) return exact;
  if (!/^task-[a-f0-9]{8}$/i.test(reference)) return;
  const matches = tasks.filter(task => task.id.startsWith(`${reference}-`));
  return matches.length === 1 ? matches[0] : undefined;
}

export function remarkTaskReferences({ tasks }: { tasks: Task[] }) {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (!node.children || ["link", "linkReference", "code", "html"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type === "inlineCode") {
          const task = resolveTaskReference(tasks, child.value || "");
          return task ? [{ type: "link", url: `#task/${encodeURIComponent(task.id)}`, children: [{ type: "text", value: task.title }] }] : [child];
        }
        if (child.type !== "text") { walk(child); return [child]; }
        const value = child.value || "";
        const output: MarkdownNode[] = [];
        let end = 0;
        for (const match of value.matchAll(/\b[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*\b/g)) {
          if (match.index < end) continue;
          const task = resolveTaskReference(tasks, match[0]);
          if (!task) continue;
          output.push({ type: "text", value: value.slice(end, match.index) });
          output.push({ type: "link", url: `#task/${encodeURIComponent(task.id)}`, children: [{ type: "text", value: task.title }] });
          end = match.index + match[0].length;
          const suffix = value.slice(end);
          const gap = suffix.match(/^\s*/)?.[0] || "";
          if (suffix.slice(gap.length).startsWith(task.title)) end += gap.length + task.title.length;
        }
        if (!output.length) return [child];
        output.push({ type: "text", value: value.slice(end) });
        return output;
      });
    };
    walk(tree);
  };
}
