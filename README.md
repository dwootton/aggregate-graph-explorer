# INCREMENT

INCREMENT is an interactive graph exploration tool that transforms how we navigate and analyze connected data. Rather than relying on rigid queries or predetermined visualizations, INCREMENT treats graph exploration as a natural, incremental process. You start broad and progressively refine your view by selecting node types, edge types, and applying filters, building up queries step by step through direct interaction with the data.

![INCREMENT Interface](interface-2.png)

[**Try the live demo**](https://increment-xi.vercel.app/) · [**Watch the demo video**](https://www.youtube.com/watch?v=V8L0LfLVn7M)

## What Makes INCREMENT Different

Most graph tools force you to write queries upfront or present you with overwhelming node-link diagrams. INCREMENT takes a different approach: it guides you through the graph structure itself. You begin by seeing all node types as proportionally-sized tiles in a treemap. Click a node type, and you see its connected edge types. Click an edge type, and you see the specific nodes. Each step reveals the next natural choice, letting the data structure guide your exploration.

This incremental approach means you don't need to know the graph schema in advance. The interface adapts as you navigate, showing relevant attributes, counts, and connections at each step. Filters can be applied at any point and carry forward through subsequent steps, creating sophisticated queries without writing a single line of code.

## Key Features

**Incremental Navigation**: Explore graphs through a natural drill-down pattern: node types → edge types → specific nodes → and beyond. Each step reveals only the relevant next choices.

**Visual Proportional Encoding**: Treemaps show node and edge type distributions proportionally, making it immediately clear where the data density lies.

**Contextual Filtering**: Apply filters at any navigation step. Filters remain scoped to their context and cascade through subsequent queries, enabling complex multi-step refinements.

**Derived Attributes**: Build new node attributes by defining subgraph patterns. For example, create a boolean attribute "has_suspicious_connection" or a numeric attribute "count_of_related_events" through visual pattern building rather than writing code.

**Query Composition**: Save intermediate query results and compose them using set operations (union, intersection, difference) or path-finding operations (connect two sets of nodes through the graph).

**Cypher Backend Support** (Optional): For larger graphs, INCREMENT can compile queries to Cypher and execute them against a Neo4j database, providing the same incremental exploration interface with backend performance.

## Use Cases

INCREMENT was designed for investigative analysis and sense-making in domains where relationships matter. Some example scenarios:

- **Investigative journalism**: Navigate networks of people, organizations, transactions, and events to uncover hidden patterns
- **Network analysis**: Explore social, biological, or infrastructure networks to understand structure and identify key nodes
- **Knowledge graphs**: Browse interconnected concepts, documents, and entities to find relevant information
- **Fraud detection**: Trace suspicious patterns across accounts, transactions, and entities
- **Provenance tracking**: Follow chains of influence, attribution, or causation through connected data

The tool is domain-agnostic and works with any graph data that can be represented as typed nodes and typed edges with attributes.

## Getting Started

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/increment.git
cd increment
npm install
```

### Running Locally

Start the development server:

```bash
npm start
```

The application will open at `http://localhost:3000`.

### Data Format

INCREMENT expects graph data as JSON in the following format:

```json
{
  "nodes": [
    {
      "id": "unique_id",
      "Node Type": "Person",
      "name": "Alice",
      "age": 30
    }
  ],
  "links": [
    {
      "source": "id1",
      "target": "id2",
      "Edge Type": "knows",
      "since": 2020
    }
  ]
}
```

Place your graph data at `public/MC1_graph.json` or modify the data loading path in `src/App.tsx`.

## Architecture

INCREMENT is built with React and D3.js. The application maintains navigation state through a query stack, allowing forward navigation through the graph and backward traversal through history. Filters are scoped to specific query steps, and the entire application state can be serialized to URLs for sharing.

For larger datasets, INCREMENT supports a Cypher backend mode that compiles the incremental query pattern to Cypher queries and executes them against Neo4j. This provides the same interaction model with database-scale performance.

The treemap visualization adapts to different views: node type distributions at the root level, edge type distributions when a node type is selected, and individual node tables when drilling into specific nodes. Attributes are shown contextually in the left panel, updating to reflect the current navigation state.

## Optional: Neo4j Backend

For large graphs, you can use INCREMENT with a Neo4j database:

1. Install and start Neo4j
2. Set environment variables:

```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=your_password
```

3. Ingest your graph data:

```bash
npm run ingest:neo4j
```

4. Enable the Cypher backend:

```bash
export REACT_APP_USE_CYPHER_BACKEND=true
export REACT_APP_NEO4J_URI=$NEO4J_URI
export REACT_APP_NEO4J_USER=$NEO4J_USER
export REACT_APP_NEO4J_PASSWORD=$NEO4J_PASSWORD
npm start
```

INCREMENT will then compile queries to Cypher and execute them against Neo4j transparently.

## Building for Production

Create an optimized production build:

```bash
npm run build
```

The build artifacts will be in the `build/` directory, ready for deployment to any static hosting service.

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## Credits

INCREMENT was created by [Racquel Fygenson](https://www.racquelfygenson.com) and [Dylan Wootton](https://x.com/WoottonDylan).

## Questions or Feedback?

For questions, bug reports, or feature requests, please contact [dwootton@mit.edu](mailto:dwootton@mit.edu).

---

Built with React, D3.js, and Neo4j • Licensed under MIT
