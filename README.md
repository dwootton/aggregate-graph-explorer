# INCREMENT

INCREMENT is an interactive graph exploration tool that provides a tool for constructing graph queries through a natural, incremental process. 

![INCREMENT Interface](interface-2.png)

[**Try the live demo**](https://increment-xi.vercel.app/) · [**Watch the demo video**](https://www.youtube.com/watch?v=V8L0LfLVn7M)

## What Makes INCREMENT Different

Many graph tools require you to write queries ahead of time or show you complicated diagrams. INCREMENT is different: it lets you explore your graph one step at a time, starting with a simple view of all node types. As you click through node types and edge types, the interface shows you the next relevant options, guiding you naturally through the graph.

You don’t need to know the graph’s structure before you start. The interface updates as you go, showing useful details and connections at each step. You can add filters whenever you want, and they will carry forward, making it easy to build complex queries without any code.

## Getting Started

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/dwootton/increment.git
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

This repo ships with the sample data from the MC1 graph. You can replace it with your own graph data at `public/MC1_graph.json` or modify the data loading path in `src/App.tsx`.

## Architecture

INCREMENT is built with React and D3.js. The application maintains navigation state through a query stack, allowing forward navigation through the graph and backward traversal through history. Filters are scoped to specific query steps, and the entire application state can be serialized to URLs for sharing.


## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## Credits

INCREMENT was created by [Racquel Fygenson](https://www.racquelfygenson.com) and [Dylan Wootton](https://x.com/WoottonDylan) for their submission to the 2025 IEEE VAST Challenge.

## Questions or Feedback?

For questions, bug reports, or feature requests, please contact [dwootton@mit.edu](mailto:dwootton@mit.edu).

Licensed under MIT
