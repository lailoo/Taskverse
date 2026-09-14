type PositionedNode = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
};

export function preserveSelection<T extends { id: string; selected?: boolean; measured?: { width?: number; height?: number } }>(
  frame: T[],
  current: T[],
): T[] {
  const live = new Map(current.map((node) => [node.id, node]));
  return frame.map((node) => ({
    ...node,
    selected: live.get(node.id)?.selected ?? false,
    // React Flow clears cached handles when measured dimensions disappear.
    ...(live.get(node.id)?.measured ? { measured: live.get(node.id)!.measured } : {}),
  }));
}

export function adjacentNode<T extends PositionedNode>(
  nodes: T[],
  id: string,
  key: string,
): T | undefined {
  const origin = nodes.find((node) => node.id === id);
  if (!origin) return;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const center = (node: T) => ({
    x: node.position.x + (node.width ?? 260) / 2,
    y: node.position.y + (node.height ?? 140) / 2,
  });
  const start = center(origin);
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      const end = center(node);
      const forward = (horizontal ? end.x - start.x : end.y - start.y) * sign;
      const cross = Math.abs(horizontal ? end.y - start.y : end.x - start.x);
      return { node, forward, score: forward + cross * 2 };
    })
    .filter((candidate) => candidate.forward > 1)
    .sort((a, b) => a.score - b.score)[0]?.node;
}
