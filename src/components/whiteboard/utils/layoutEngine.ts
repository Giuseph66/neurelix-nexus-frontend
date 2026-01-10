
interface Node {
    id: string;
    type: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
}

interface Edge {
    from: string;
    to: string;
}

interface LayoutOptions {
    horizontalSpacing: number;
    verticalSpacing: number;
    direction: 'TB' | 'LR'; // Top-Bottom or Left-Right
}

export function calculateGraphLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = { horizontalSpacing: 50, verticalSpacing: 100, direction: 'LR' }
): Node[] {
    const nodeMap = new Map<string, Node>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    const adjacency = new Map<string, string[]>();
    const reverseAdjacency = new Map<string, string[]>();

    // Initialize adjacency
    nodes.forEach(n => {
        adjacency.set(n.id, []);
        reverseAdjacency.set(n.id, []);
    });

    // Build graph
    edges.forEach(e => {
        if (adjacency.has(e.from) && adjacency.has(e.to)) {
            adjacency.get(e.from)!.push(e.to);
            reverseAdjacency.get(e.to)!.push(e.from);
        }
    });

    // Find roots (nodes with no incoming edges)
    const roots = nodes.filter(n => (reverseAdjacency.get(n.id)?.length || 0) === 0);

    // If no roots (cycles?), pick the first one
    const startNodes = roots.length > 0 ? roots : [nodes[0]];

    // Assign levels (BFS)
    const levels = new Map<string, number>();
    const queue: { id: string, level: number }[] = startNodes.map(n => ({ id: n.id, level: 0 }));
    const visited = new Set<string>();

    let maxLevel = 0;

    while (queue.length > 0) {
        const { id, level } = queue.shift()!;

        if (visited.has(id)) continue;
        visited.add(id);

        levels.set(id, level);
        maxLevel = Math.max(maxLevel, level);

        const neighbors = adjacency.get(id) || [];
        neighbors.forEach(neighborId => {
            queue.push({ id: neighborId, level: level + 1 });
        });
    }

    // Handle disconnected components or unvisited nodes
    nodes.forEach(n => {
        if (!levels.has(n.id)) {
            levels.set(n.id, 0); // Place them at level 0 or handle separately
        }
    });

    // Group by level
    const nodesByLevel: Node[][] = Array(maxLevel + 1).fill(null).map(() => []);
    nodes.forEach(n => {
        const level = levels.get(n.id)!;
        nodesByLevel[level].push(n);
    });

    // Calculate positions
    let currentX = 0;
    let currentY = 0;

    if (options.direction === 'LR') {
        // Left to Right layout
        nodesByLevel.forEach(levelNodes => {
            let levelHeight = 0;
            let startY = 0; // Should center vertically relative to parent, but simple stacking for now

            levelNodes.forEach((node, index) => {
                node.x = currentX;
                node.y = startY;

                startY += node.height + options.verticalSpacing;
                levelHeight = Math.max(levelHeight, startY);
            });

            // Find max width in this level to advance X
            const maxNodeWidth = Math.max(...levelNodes.map(n => n.width));
            currentX += maxNodeWidth + options.horizontalSpacing;
        });
    } else {
        // Top to Bottom layout
        nodesByLevel.forEach(levelNodes => {
            let startX = 0;

            levelNodes.forEach((node) => {
                node.x = startX;
                node.y = currentY;

                startX += node.width + options.horizontalSpacing;
            });

            const maxNodeHeight = Math.max(...levelNodes.map(n => n.height));
            currentY += maxNodeHeight + options.verticalSpacing;
        });
    }

    // Center alignment pass (optional, simple version)
    // For each node, try to center it relative to its children or parents
    // ... (Skipping complex alignment for MVP, simple level stacking is better than linear)

    return nodes;
}
