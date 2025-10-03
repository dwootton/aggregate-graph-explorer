#!/usr/bin/env node
/*
  Ingests public/MC1_graph.json into Neo4j.

  Env vars required:
    NEO4J_URI        e.g. bolt://localhost:7687 or neo4j+s://...
    NEO4J_USER
    NEO4J_PASSWORD

  Usage:
    node scripts/ingest.js
*/

const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');

const sanitize = (name) => String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
const labelFor = (t) => sanitize(t);
const relFor = (t) => sanitize(t).toUpperCase();

async function main() {
  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.error('Missing NEO4J_* env vars');
    process.exit(1);
  }

  const dataPath = path.join(process.cwd(), 'public', 'MC1_graph.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`Graph JSON not found at ${dataPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const graph = JSON.parse(raw);
  const nodes = graph.nodes || [];
  const links = graph.links || [];

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });

  console.log(`Loaded JSON: ${nodes.length} nodes, ${links.length} links`);

  try {
    // Group nodes by type
    const nodesByType = nodes.reduce((acc, n) => {
      const t = n['Node Type'] || 'Unknown';
      (acc[t] = acc[t] || []).push(n);
      return acc;
    }, {});

    // Create constraints per label
    for (const [type] of Object.entries(nodesByType)) {
      const label = labelFor(type);
      const cypher = `CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`;
      await session.run(cypher);
    }

    // Ingest nodes per type in chunks
    const chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    for (const [type, list] of Object.entries(nodesByType)) {
      const label = labelFor(type);
      console.log(`Ingesting ${list.length} nodes of type ${type} as :${label}`);
      for (const group of chunk(list, 1000)) {
        // Remove reserved fields that shouldn't be duplicated
        const payload = group.map((n) => ({ ...n }));
        const cypher = `
          UNWIND $rows AS row
          MERGE (n:${label} { id: toString(row.id) })
          SET n += row
        `;
        await session.run(cypher, { rows: payload });
      }
    }

    // Ingest relationships grouped by type
    const linksByType = links.reduce((acc, e) => {
      const t = e['Edge Type'] || 'RELATED';
      (acc[t] = acc[t] || []).push(e);
      return acc;
    }, {});

    for (const [etype, list] of Object.entries(linksByType)) {
      const rel = relFor(etype);
      console.log(`Ingesting ${list.length} relationships of type ${etype} as :${rel}`);
      for (const group of chunk(list, 2000)) {
        // Prepare rows with clean properties (exclude type/source/target)
        const rows = group.map((e) => {
          const { source, target, ...rest } = e;
          // Remove Edge Type if present
          delete rest['Edge Type'];
          return { source: String(source), target: String(target), props: rest };
        });
        const cypher = `
          UNWIND $rows AS row
          MATCH (a { id: row.source })
          MATCH (b { id: row.target })
          MERGE (a)-[e:${rel}]->(b)
          SET e += row.props
        `;
        await session.run(cypher, { rows });
      }
    }

    console.log('Ingest complete');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

