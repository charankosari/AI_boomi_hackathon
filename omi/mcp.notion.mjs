// mcp.notion.mjs
import { spawn } from "node:child_process";
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client;

/** Boot the Notion MCP server (child process) and connect a client */
export async function startNotionMCP() {
  if (client) return client;

  const child = spawn("npx", ["-y", "@notionhq/notion-mcp-server"], {
    env: { ...process.env, NOTION_TOKEN: process.env.NOTION_TOKEN },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const transport = new StdioClientTransport({
    stdin: child.stdin,
    stdout: child.stdout,
  });

  client = new MCPClient({
    name: "omi-server",
    version: "1.0.0",
    transport,
  });

  await client.connect();

  try {
    const tools = await client.listTools();
    console.log(
      "🧰 Notion MCP tools:",
      tools.tools?.map((t) => t.name)
    );
  } catch (e) {
    console.warn("Could not list Notion MCP tools:", e?.message);
  }

  return client;
}

/** Proxy any Notion MCP tool call */
export async function callNotionTool(toolName, args = {}) {
  if (!client) await startNotionMCP();

  const { tools } = await client.listTools();
  const found = tools.find((t) => t.name === toolName);
  if (!found) throw new Error(`Notion MCP tool not found: ${toolName}`);

  const res = await client.callTool({ name: toolName, arguments: args });
  return res?.structuredContent ?? res?.content ?? res;
}
