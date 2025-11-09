// mcp-manager.js - Modular MCP Server Manager
const fs = require("node:fs");
const path = require("node:path");

const MCP_CLIENTS = new Map(); // name -> { client, transport, config }

/**
 * Generic MCP server starter
 * @param {string} name - MCP server name (e.g., "notion", "filesystem")
 * @param {object} config - Configuration object
 * @param {string} config.packageName - npm package name (e.g., "@notionhq/notion-mcp-server")
 * @param {string} config.binName - bin name in package.json (optional, defaults to package name)
 * @param {object} config.env - Environment variables to pass
 * @param {function} config.adaptTool - Optional function to adapt tool calls
 * @param {function} config.detectTrigger - Function(text) -> boolean to detect when to enable
 * @returns {Promise<object>} MCP client proxy
 */
async function startMCP(name, config) {
  if (MCP_CLIENTS.has(name)) {
    return MCP_CLIENTS.get(name).proxy;
  }

  const { Client: MCPClient } = await import(
    "@modelcontextprotocol/sdk/client/index.js"
  );
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const {
    packageName,
    binName,
    env = {},
    adaptTool,
    detectTrigger,
    type = "stdio",
    url,
    command: customCommand,
    script,
  } = config;

  let transport;
  let command, args;

  // Handle HTTP-based MCP servers (via mcp-remote)
  if (type === "http" && url) {
    console.log(`🔌 Starting ${name} MCP (HTTP) -> npx mcp-remote ${url}`);
    command = "npx";
    args = ["-y", "mcp-remote", url];
    // Prepare environment
    const mcpEnv = { ...process.env, ...env };
    // Remove undefined values
    Object.keys(mcpEnv).forEach((key) => {
      if (mcpEnv[key] === undefined) delete mcpEnv[key];
    });
    transport = new StdioClientTransport({
      command,
      args,
      env: mcpEnv,
    });
  } else if (type === "python" && customCommand && script) {
    // Handle Python-based MCP servers (e.g., WhatsApp MCP using uv or python)
    console.log(
      `🔌 Starting ${name} MCP (Python) -> ${customCommand} run ${script}`
    );

    // Check if using uv or python
    if (customCommand === "uv" || customCommand.includes("uv")) {
      command = customCommand;
      args = ["--directory", packageName, "run", script];
    } else {
      // Fallback to python
      command = customCommand || "python";
      args = [path.join(packageName, script)];
    }

    // Prepare environment
    const mcpEnv = { ...process.env, ...env };
    // Remove undefined values
    Object.keys(mcpEnv).forEach((key) => {
      if (mcpEnv[key] === undefined) delete mcpEnv[key];
    });

    transport = new StdioClientTransport({
      command,
      args,
      env: mcpEnv,
    });

    // Skip to client creation for Python MCPs
    const client = new MCPClient({
      name: `omi-server-${name}`,
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
    } catch (err) {
      throw new Error(`Failed to connect to ${name} MCP: ${err.message}`);
    }

    // List tools for verification
    let availableTools = [];
    try {
      const tools = await client.listTools();
      availableTools = (tools.tools || []).map((t) => t.name);
      console.log(
        `🧰 ${name} MCP tools (${availableTools.length}):`,
        availableTools
      );
    } catch (e) {
      console.warn(`⚠️ Could not list ${name} MCP tools:`, e?.message);
    }

    // Create proxy
    const proxy = {
      name,
      async call(toolName, args = {}) {
        const { tools } = await client.listTools();
        const names = new Set((tools || []).map((t) => t.name));

        if (!names.has(toolName)) {
          throw new Error(
            `Unknown ${name} tool "${toolName}". Available: ${[...names].join(
              ", "
            )}`
          );
        }

        // Apply adapter if provided
        const adaptedArgs = adaptTool ? adaptTool(toolName, args) : args;

        const result = await client.callTool({
          name: toolName,
          arguments: adaptedArgs,
        });

        // Normalize response
        return result?.data || result?.content || result;
      },
      async listTools() {
        const { tools } = await client.listTools();
        return tools || [];
      },
      getAvailableTools: () => availableTools,
      detectTrigger: detectTrigger || (() => false),
    };

    // Store
    MCP_CLIENTS.set(name, { client, transport, proxy, config });
    console.log(`✅ ${name} MCP connected`);
    return proxy;
  } else {
    // Handle stdio-based MCP servers
    // Resolve package and bin
    let pkgJson, binAbs;
    try {
      // Check if it's an absolute path to a local MCP server
      if (fs.existsSync(packageName) && fs.statSync(packageName).isFile()) {
        binAbs = path.resolve(packageName);
        console.log(`📁 Using local MCP server: ${binAbs}`);
      } else {
        // Try to resolve as npm package
        try {
          pkgJson = require.resolve(`${packageName}/package.json`);
          const pkgDir = path.dirname(pkgJson);
          const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));

          const binKey = binName || packageName.split("/").pop() || packageName;
          let binRel;
          if (typeof pkg.bin === "string") {
            binRel = pkg.bin;
          } else if (pkg.bin && pkg.bin[binKey]) {
            binRel = pkg.bin[binKey];
          } else if (pkg.bin && Object.keys(pkg.bin).length > 0) {
            binRel = Object.values(pkg.bin)[0];
          } else {
            // If no bin found, try using npx as fallback
            console.log(
              `⚠️ No bin found in ${packageName}, using npx as fallback`
            );
            command = "npx";
            args = ["-y", packageName];
            const mcpEnv = { ...process.env, ...env };
            Object.keys(mcpEnv).forEach((key) => {
              if (mcpEnv[key] === undefined) delete mcpEnv[key];
            });
            transport = new StdioClientTransport({
              command,
              args,
              env: mcpEnv,
            });
            // Skip to client creation
            const client = new MCPClient({
              name: `omi-server-${name}`,
              version: "1.0.0",
            });
            await client.connect(transport);
            // Continue with tool listing and proxy creation (code below)
            let availableTools = [];
            try {
              const tools = await client.listTools();
              availableTools = (tools.tools || []).map((t) => t.name);
              console.log(
                `🧰 ${name} MCP tools (${availableTools.length}):`,
                availableTools
              );
            } catch (e) {
              console.warn(`⚠️ Could not list ${name} MCP tools:`, e?.message);
            }
            const proxy = {
              name,
              async call(toolName, args = {}) {
                const { tools } = await client.listTools();
                const names = new Set((tools || []).map((t) => t.name));
                if (!names.has(toolName)) {
                  throw new Error(
                    `Unknown ${name} tool "${toolName}". Available: ${[
                      ...names,
                    ].join(", ")}`
                  );
                }
                const adaptedArgs = adaptTool
                  ? adaptTool(toolName, args)
                  : args;
                const result = await client.callTool({
                  name: toolName,
                  arguments: adaptedArgs,
                });
                return result?.data || result?.content || result;
              },
              async listTools() {
                const { tools } = await client.listTools();
                return tools || [];
              },
              getAvailableTools: () => availableTools,
              detectTrigger: detectTrigger || (() => false),
            };
            MCP_CLIENTS.set(name, { client, transport, proxy, config });
            console.log(`✅ ${name} MCP connected`);
            return proxy;
          }

          binAbs = path.resolve(pkgDir, binRel);
        } catch (resolveErr) {
          // If package not found locally, try using npx
          console.log(
            `⚠️ Package ${packageName} not found locally, using npx as fallback`
          );
          command = "npx";
          args = ["-y", packageName];
          const mcpEnv = { ...process.env, ...env };
          Object.keys(mcpEnv).forEach((key) => {
            if (mcpEnv[key] === undefined) delete mcpEnv[key];
          });
          transport = new StdioClientTransport({
            command,
            args,
            env: mcpEnv,
          });
          // Skip to client creation
          const client = new MCPClient({
            name: `omi-server-${name}`,
            version: "1.0.0",
          });
          await client.connect(transport);
          // Continue with tool listing and proxy creation (code below)
          let availableTools = [];
          try {
            const tools = await client.listTools();
            availableTools = (tools.tools || []).map((t) => t.name);
            console.log(
              `🧰 ${name} MCP tools (${availableTools.length}):`,
              availableTools
            );
          } catch (e) {
            console.warn(`⚠️ Could not list ${name} MCP tools:`, e?.message);
          }
          const proxy = {
            name,
            async call(toolName, args = {}) {
              const { tools } = await client.listTools();
              const names = new Set((tools || []).map((t) => t.name));
              if (!names.has(toolName)) {
                throw new Error(
                  `Unknown ${name} tool "${toolName}". Available: ${[
                    ...names,
                  ].join(", ")}`
                );
              }
              const adaptedArgs = adaptTool ? adaptTool(toolName, args) : args;
              const result = await client.callTool({
                name: toolName,
                arguments: adaptedArgs,
              });
              return result?.data || result?.content || result;
            },
            async listTools() {
              const { tools } = await client.listTools();
              return tools || [];
            },
            getAvailableTools: () => availableTools,
            detectTrigger: detectTrigger || (() => false),
          };
          MCP_CLIENTS.set(name, { client, transport, proxy, config });
          console.log(`✅ ${name} MCP connected`);
          return proxy;
        }
      }
    } catch (err) {
      throw new Error(
        `Failed to resolve MCP server "${name}" (${packageName}): ${err.message}\n` +
          `Make sure the package is installed: npm install ${packageName}\n` +
          `Or provide an absolute path to a local MCP server script.`
      );
    }

    console.log(`🔌 Starting ${name} MCP -> node ${binAbs}`);

    // Prepare environment
    const mcpEnv = { ...process.env, ...env };
    // Remove undefined values
    Object.keys(mcpEnv).forEach((key) => {
      if (mcpEnv[key] === undefined) delete mcpEnv[key];
    });

    // Create transport
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [binAbs],
      env: mcpEnv,
    });
  }

  // Create client
  const client = new MCPClient({
    name: `omi-server-${name}`,
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
  } catch (err) {
    throw new Error(`Failed to connect to ${name} MCP: ${err.message}`);
  }

  // List tools for verification
  let availableTools = [];
  try {
    const tools = await client.listTools();
    availableTools = (tools.tools || []).map((t) => t.name);
    console.log(
      `🧰 ${name} MCP tools (${availableTools.length}):`,
      availableTools
    );
  } catch (e) {
    console.warn(`⚠️ Could not list ${name} MCP tools:`, e?.message);
  }

  // Create proxy
  const proxy = {
    name,
    async call(toolName, args = {}) {
      const { tools } = await client.listTools();
      const names = new Set((tools || []).map((t) => t.name));

      if (!names.has(toolName)) {
        throw new Error(
          `Unknown ${name} tool "${toolName}". Available: ${[...names].join(
            ", "
          )}`
        );
      }

      // Apply adapter if provided
      const adaptedArgs = adaptTool ? adaptTool(toolName, args) : args;

      const result = await client.callTool({
        name: toolName,
        arguments: adaptedArgs,
      });

      // Normalize response
      return result?.data || result?.content || result;
    },
    async listTools() {
      const { tools } = await client.listTools();
      return tools || [];
    },
    getAvailableTools: () => availableTools,
    detectTrigger: detectTrigger || (() => false),
  };

  // Store
  MCP_CLIENTS.set(name, { client, transport, proxy, config });

  console.log(`✅ ${name} MCP connected`);
  return proxy;
}

/**
 * Notion MCP specific adapters
 */
function adaptNotionTool(toolName, args) {
  // Apply Notion-specific transformations if needed
  // Most tools work as-is, but we can add custom logic here
  return args;
}

function detectNotionTrigger(text = "") {
  return /\bnotion\b/i.test(text);
}

/**
 * Filesystem MCP adapter
 */
function detectFilesystemTrigger(text = "") {
  const triggers = [
    /\bfile\b/i,
    /\bfolder\b/i,
    /\bdirectory\b/i,
    /\bread\s+(file|dir)/i,
    /\bwrite\s+(file|to\s+file)/i,
    /\bcreate\s+(file|directory)/i,
    /\bdelete\s+(file|folder)/i,
    /\bsearch\s+(files?|in\s+files?)/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Fetch/HTTP MCP adapter
 */
function detectFetchTrigger(text = "") {
  const triggers = [
    /\bfetch\b/i,
    /\bhttp\b/i,
    /\bhttps?\b/i,
    /\bapi\s+call/i,
    /\bget\s+(data|content)\s+from\s+(url|website)/i,
    /\bdownload\b/i,
    /\brequest\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * GitHub MCP adapter
 */
function detectGitHubTrigger(text = "") {
  return /\bgithub\b/i.test(text);
}

/**
 * Google Docs MCP adapter
 */
function detectGoogleDocsTrigger(text = "") {
  const triggers = [
    /\bgoogle\s+doc\b/i,
    /\bgoogle\s+docs?\b/i,
    /\bcreate\s+(a\s+)?(google\s+)?doc\b/i,
    /\bcreate\s+(a\s+)?document\b/i,
    /\bwrite\s+(a\s+)?(google\s+)?doc\b/i,
    /\bwrite\s+(a\s+)?document\b/i,
    /\bmake\s+(a\s+)?(google\s+)?doc\b/i,
    /\bnew\s+(google\s+)?doc\b/i,
    /\bgoogle\s+document\b/i,
    /\bsave\s+(as\s+)?(a\s+)?(google\s+)?doc\b/i,
    /\bdelete\s+(a\s+)?(google\s+)?doc\b/i,
    /\bdelete\s+(a\s+)?document\b/i,
    /\bremove\s+(a\s+)?(google\s+)?doc\b/i,
    /\bremove\s+(a\s+)?document\b/i,
    /\bupdate\s+(a\s+)?(google\s+)?doc\b/i,
    /\bupdate\s+(a\s+)?document\b/i,
    /\bedit\s+(a\s+)?(google\s+)?doc\b/i,
    /\bedit\s+(a\s+)?document\b/i,
    /\bfind\s+(the\s+)?(google\s+)?documents?\b/i,
    /\bfind\s+(the\s+)?documents?\b/i,
    /\bget\s+(the\s+)?(google\s+)?documents?\b/i,
    /\bget\s+(the\s+)?documents?\b/i,
    /\blist\s+(the\s+)?(google\s+)?documents?\b/i,
    /\blist\s+(the\s+)?documents?\b/i,
    /\bshow\s+(the\s+)?(google\s+)?documents?\b/i,
    /\bshow\s+(the\s+)?documents?\b/i,
    /\bsearch\s+(for\s+)?(google\s+)?documents?\b/i,
    /\bsearch\s+(for\s+)?documents?\b/i,
    /\bmy\s+(google\s+)?documents?\b/i,
    /\bmy\s+documents?\b/i,
    /\bdocuments?\s+(created|made|written)\s+(today|yesterday|this\s+week)\b/i,
    /\bdocuments?\s+from\s+(today|yesterday|this\s+week)\b/i,
    /\bdocuments?\s+that\s+(have\s+)?(created|made|written)\s+(today|yesterday)\b/i,
    /\bview\s+(the\s+)?(google\s+)?documents?\b/i,
    /\bview\s+(the\s+)?documents?\b/i,
    /\bread\s+(the\s+)?(google\s+)?documents?\b/i,
    /\bread\s+(the\s+)?documents?\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Google Calendar MCP adapter
 */
function detectGoogleCalendarTrigger(text = "") {
  const triggers = [
    /\bgoogle\s+calendar\b/i,
    /\bcalendar\b/i,
    /\bevent\b/i,
    /\bschedule\b/i,
    /\bmeeting\b/i,
    /\bappointment\b/i,
    /\bcreate\s+event\b/i,
    /\badd\s+event\b/i,
    /\bcalendar\s+event\b/i,
    /\bsync\s+calendar\b/i,
    /\bavailable\s+slots?\b/i, // "available slots"
    /\bfree\s+slots?\b/i, // "free slots"
    /\bslots?\s+(of|in|for|at)\s+(main|calendar|me)/i, // "slots of main" or "slots in calendar"
    /\bview\s+(calendar|events?|schedule)\b/i,
    /\bshow\s+(calendar|events?|schedule)\b/i,
    /\blist\s+(calendar|events?|schedule)\b/i,
    /\bsee\s+(calendar|events?|schedule|slots?)\b/i,
    /\bbook\s+(a\s+)?slot\b/i, // "book a slot" or "book slot"
    /\breserve\s+(a\s+)?slot\b/i, // "reserve a slot"
    /\bcreate\s+(a\s+)?slot\b/i, // "create a slot"
    /\b(10am|11am|12pm|1pm|2pm|3pm|4pm|5pm|6pm|7pm|8pm|9pm|10pm)\s+to\s+(11am|12pm|1pm|2pm|3pm|4pm|5pm|6pm|7pm|8pm|9pm|10pm|11pm)/i, // Time ranges like "10AM to 11AM"
    /\b(november|december|january|february|march|april|may|june|july|august|september|october)\s+(eighth|8th|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|ninth|9th|tenth|10th)/i, // Dates
    /\btomorrow\b/i, // "tomorrow"
    /\b(book|reserve|create|add)\s+(an?\s+)?(event|appointment|meeting|slot)/i, // Action verbs with calendar terms
    // French and other language triggers
    /\bbouquez\b/i, // French "book" (bouquez)
    /\bréserver\b/i, // French "reserve"
    /\bcréer\s+(un\s+)?(événement|rendez-vous)/i, // French "create event/appointment"
    // Context-based: if previous messages mentioned calendar/events and current has time/date
    /(november|december|january|february|march|april|may|june|july|august|september|october).*(10am|11am|12pm|1pm|2pm|3pm|4pm|5pm|6pm|7pm|8pm|9pm|10pm)/i,
    /(10am|11am|12pm|1pm|2pm|3pm|4pm|5pm|6pm|7pm|8pm|9pm|10pm).*(november|december|january|february|march|april|may|june|july|august|september|october)/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Browser/Playwright MCP adapter
 */
function detectBrowserTrigger(text = "") {
  const triggers = [
    /\bbrowser\b/i,
    /\bscreenshot\b/i,
    /\bclick\b/i,
    /\bnavigate\b/i,
    /\bscrape\b/i,
    /\bweb\s+page\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * WhatsApp MCP adapter - detects WhatsApp messaging requests
 */
function detectWhatsAppTrigger(text = "") {
  const triggers = [
    /\bwhatsapp\b/i,
    /\bwhats\s+app\b/i,
    /\bsend\s+(a\s+)?(whatsapp|whats)\s+message\b/i,
    /\bmessage\s+(on\s+)?whatsapp\b/i,
    /\btext\s+(on\s+)?whatsapp\b/i,
    /\bcontact\s+(on\s+)?whatsapp\b/i,
    /\bsend\s+to\s+(\d+|contact|number)\s+(on\s+)?whatsapp\b/i,
    /\bwhatsapp\s+(contact|number|phone)\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Gmail MCP adapter - detects email-related queries
 */
function detectGmailTrigger(text = "") {
  const triggers = [
    /\bgmail\b/i,
    /\bemail\b/i,
    /\bemails?\b/i,
    /\bsend\s+(an?\s+)?email\b/i,
    /\bcompose\s+(an?\s+)?email\b/i,
    /\bwrite\s+(an?\s+)?email\b/i,
    /\bcreate\s+(an?\s+)?email\b/i,
    /\bmail\b/i,
    /\binbox\b/i,
    /\bcheck\s+(email|mail|inbox)\b/i,
    /\bread\s+(email|mail|emails?)\b/i,
    /\bsearch\s+(email|mail|emails?)\b/i,
    /\bfind\s+(email|mail|emails?)\b/i,
    /\breply\s+(to\s+)?(email|mail)\b/i,
    /\bforward\s+(email|mail)\b/i,
    /\bdelete\s+(email|mail|emails?)\b/i,
    /\bmark\s+(as\s+)?(read|unread)\b/i,
    /\bunread\s+(email|mail|emails?)\b/i,
    /\battachments?\b/i,
    /\bspam\b/i,
    /\bspam\s+(mail|email|emails?)\b/i,
    /\bspam\s+mails?\b/i,
    /\bjunk\s+(mail|email|emails?)\b/i,
    /\bjunk\s+mails?\b/i,
    /\bsee\s+(spam|junk)\s+(mail|email|emails?)\b/i,
    /\breceive\s+(spam|junk)\s+(mail|email|emails?)\b/i,
    /\bdraft\b/i,
    /\bdrafts?\b/i,
    /\bcreate\s+(an?\s+)?draft\b/i,
    /\bdelete\s+(an?\s+)?draft\b/i,
    /\bdelete\s+drafts?\b/i,
    /\bremove\s+(an?\s+)?draft\b/i,
    /\blist\s+drafts?\b/i,
    /\bshow\s+drafts?\b/i,
    /\bmy\s+drafts?\b/i,
    /\bget\s+drafts?\b/i,
    /\bcheck\s+drafts?\b/i,
    /\bsend\s+(an?\s+)?draft\b/i,
    /\bsend\s+drafts?\b/i,
    /\bsend\s+the\s+last\s+draft\b/i,
    /\bsend\s+the\s+most\s+recent\s+draft\b/i,
    /\bsend\s+draft\s+to\b/i,
    /\bmark\s+(as\s+)?important\b/i,
    /\bimportant\s+(email|mail|emails?)\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Google Slides/Presentations MCP adapter - detects presentation-related queries
 */
function detectGoogleSlidesTrigger(text = "") {
  const triggers = [
    /\bgoogle\s+slides?\b/i,
    /\bgoogle\s+presentation\b/i,
    /\bpresentation\b/i,
    /\bpresentations?\b/i,
    /\bslides?\b/i,
    /\bcreate\s+(a\s+)?(google\s+)?(slide|presentation)\b/i,
    /\bcreate\s+(a\s+)?presentation\b/i,
    /\bcreate\s+(a\s+)?slide\b/i,
    /\bmake\s+(a\s+)?(google\s+)?(slide|presentation)\b/i,
    /\bmake\s+(a\s+)?presentation\b/i,
    /\bnew\s+(google\s+)?(slide|presentation)\b/i,
    /\bnew\s+presentation\b/i,
    /\bgoogle\s+presentations?\b/i,
    /\bpowerpoint\b/i,
    /\bppt\b/i,
    /\badd\s+slide\b/i,
    /\bedit\s+(slide|presentation)\b/i,
    /\bupdate\s+(slide|presentation)\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * Zomato MCP adapter - detects food/restaurant related queries
 */
function detectZomatoTrigger(text = "") {
  const triggers = [
    /\bzomato\b/i,
    /\brestaurant\b/i,
    /\bfood\b/i,
    /\border\s+food\b/i,
    /\border\s+(a\s+)?(food|meal|dish|item)\b/i,
    /\bplace\s+(an?\s+)?order\b/i,
    /\bcreate\s+(an?\s+)?order\b/i,
    /\bedit\s+(an?\s+)?order\b/i,
    /\bmodify\s+(an?\s+)?order\b/i,
    /\bupdate\s+(an?\s+)?order\b/i,
    /\border\s+history\b/i,
    /\bmy\s+orders?\b/i,
    /\bpast\s+orders?\b/i,
    /\bget\s+history\b/i,
    /\bget\s+(my\s+)?order\b/i,
    /\border\s+status\b/i,
    /\bsaved\s+address\b/i,
    /\bmy\s+addresses?\b/i,
    /\bget\s+address\b/i,
    /\bsaved\s+locations?\b/i,
    /\bmenu\b/i,
    /\bdelivery\b/i,
    /\btakeaway\b/i,
    /\bfind\s+(restaurants?|food|places?)\b/i,
    /\bsearch\s+(for\s+)?(food|restaurants?|dishes?)\b/i,
    /\blook\s+for\s+(food|restaurants?|dishes?)\b/i,
    /\bhungry\b/i,
    /\beat\b/i,
    /\bdinner\b/i,
    /\blunch\b/i,
    /\bbreakfast\b/i,
    /\bpizza\b/i,
    /\bburger\b/i,
    /\bcuisine\b/i,
    /\brestaurants?\s+near\s+me\b/i,
    /\bfood\s+delivery\b/i,
    /\bbiryani\b/i,
    /\bchicken\s+biryani\b/i,
    /\bprice\s+range\b/i,
    /\bunder\s+\d+\b/i,
    /\bbetween\s+\d+\s+and\s+\d+\b/i,
    /\b\d+\s*-\s*\d+\s*(rupees?|rs|inr)\b/i,
    /\bnear\s+(me|my\s+location|my\s+area)\b/i,
  ];
  return triggers.some((pattern) => pattern.test(text));
}

/**
 * MCP Registry - Configuration for all available MCPs
 */
const MCP_REGISTRY = {
  notion: {
    packageName: "@notionhq/notion-mcp-server",
    binName: "notion-mcp-server",
    env: {
      NOTION_TOKEN: process.env.NOTION_TOKEN,
    },
    adaptTool: adaptNotionTool,
    detectTrigger: detectNotionTrigger,
    enabled: !!process.env.NOTION_TOKEN, // Only enable if token is provided
  },
  filesystem: {
    packageName: "@modelcontextprotocol/server-filesystem",
    env: {
      // Can specify allowed directories via env vars
      ALLOWED_DIRECTORIES: process.env.FILESYSTEM_ALLOWED_DIRS || process.cwd(),
    },
    detectTrigger: detectFilesystemTrigger,
    enabled: true, // Usually safe to enable
  },
  fetch: {
    // Note: @modelcontextprotocol/server-fetch doesn't exist in npm registry
    // Disabled until correct package name is found or alternative is configured
    packageName: "@modelcontextprotocol/server-fetch",
    detectTrigger: detectFetchTrigger,
    enabled: false, // Disabled - package not found in npm registry
  },
  github: {
    packageName: "@modelcontextprotocol/server-github",
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN,
    },
    detectTrigger: detectGitHubTrigger,
    enabled: !!process.env.GITHUB_TOKEN,
  },
  googlecalendar: {
    // Using @cocal/google-calendar-mcp (official package)
    // See: https://github.com/nspady/google-calendar-mcp
    packageName:
      process.env.GOOGLE_CALENDAR_MCP_PATH ||
      process.env.GOOGLE_CALENDAR_MCP_PACKAGE ||
      "@cocal/google-calendar-mcp",
    binName: process.env.GOOGLE_CALENDAR_MCP_BIN || "google-calendar-mcp",
    env: (() => {
      const fs = require("fs");
      const path = require("path");

      // Determine credentials file path
      let credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;

      // If not set, check for file in project root
      if (!credentialsPath) {
        const projectRootPath = path.join(process.cwd(), "gcp-oauth.keys.json");
        if (fs.existsSync(projectRootPath)) {
          // Use absolute path to ensure MCP server can find it
          credentialsPath = path.resolve(projectRootPath);
          console.log(
            `📁 Auto-detected Google Calendar credentials: ${credentialsPath}`
          );
        }
      } else if (credentialsPath && !path.isAbsolute(credentialsPath)) {
        // If relative path provided, resolve it to absolute
        credentialsPath = path.resolve(process.cwd(), credentialsPath);
      }

      return {
        // OAuth credentials file path (required)
        // Should point to gcp-oauth.keys.json file downloaded from Google Cloud Console
        GOOGLE_OAUTH_CREDENTIALS: credentialsPath,
        // Custom token storage path (optional)
        // Default: ~/.config/google-calendar-mcp/tokens.json (macOS/Linux)
        //         %APPDATA%\google-calendar-mcp\tokens.json (Windows)
        GOOGLE_CALENDAR_MCP_TOKEN_PATH:
          process.env.GOOGLE_CALENDAR_MCP_TOKEN_PATH,
      };
    })(),
    detectTrigger: detectGoogleCalendarTrigger,
    enabled: (() => {
      const fs = require("fs");
      const path = require("path");
      return !!(
        process.env.GOOGLE_OAUTH_CREDENTIALS ||
        process.env.GOOGLE_CALENDAR_MCP_PATH ||
        // Also check for default location in project root
        fs.existsSync(path.join(process.cwd(), "gcp-oauth.keys.json"))
      );
    })(),
  },
  gmail: {
    // Using local TypeScript-based MCP server (similar to google-docs-mcp)
    // Configured similar to Google Docs - uses same OAuth credentials
    packageName: path.resolve(
      process.cwd(),
      "google-gmail-mcp",
      "build",
      "server.js"
    ),
    env: (() => {
      const fs = require("fs");
      const path = require("path");

      // Determine credentials file path - same as Google Calendar
      let credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;

      // If not set, check for file in project root
      if (!credentialsPath) {
        const projectRootPath = path.join(process.cwd(), "gcp-oauth.keys.json");
        if (fs.existsSync(projectRootPath)) {
          credentialsPath = path.resolve(projectRootPath);
          console.log(
            `📁 Auto-detected Google Gmail credentials: ${credentialsPath}`
          );
        }
      } else if (credentialsPath && !path.isAbsolute(credentialsPath)) {
        credentialsPath = path.resolve(process.cwd(), credentialsPath);
      }

      // Copy credentials to google-gmail-mcp directory if needed
      if (credentialsPath && fs.existsSync(credentialsPath)) {
        const targetCredentialsPath = path.join(
          process.cwd(),
          "google-gmail-mcp",
          "credentials.json"
        );
        if (!fs.existsSync(targetCredentialsPath)) {
          try {
            fs.copyFileSync(credentialsPath, targetCredentialsPath);
            console.log(
              `📋 Copied credentials to google-gmail-mcp/credentials.json`
            );
          } catch (err) {
            console.error(
              `⚠️ Failed to copy credentials to google-gmail-mcp:`,
              err
            );
          }
        }
      }

      return {
        GOOGLE_OAUTH_CREDENTIALS: credentialsPath,
        GOOGLE_GMAIL_MCP_TOKEN_PATH: process.env.GOOGLE_GMAIL_MCP_TOKEN_PATH,
      };
    })(),
    detectTrigger: detectGmailTrigger,
    enabled: (() => {
      const fs = require("fs");
      const path = require("path");
      const serverPath = path.join(
        process.cwd(),
        "google-gmail-mcp",
        "build",
        "server.js"
      );
      const credentialsPath = path.join(
        process.cwd(),
        "google-gmail-mcp",
        "credentials.json"
      );
      return (
        fs.existsSync(serverPath) &&
        (fs.existsSync(credentialsPath) ||
          fs.existsSync(path.join(process.cwd(), "gcp-oauth.keys.json")))
      );
    })(),
  },
  googleslides: {
    // Using local TypeScript-based MCP server (similar to google-docs-mcp)
    // Configured similar to Google Docs - uses same OAuth credentials
    packageName: path.resolve(
      process.cwd(),
      "google-slides-mcp",
      "build",
      "server.js"
    ),
    env: (() => {
      const fs = require("fs");
      const path = require("path");

      // Determine credentials file path - same as Google Calendar
      let credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;

      // If not set, check for file in project root
      if (!credentialsPath) {
        const projectRootPath = path.join(process.cwd(), "gcp-oauth.keys.json");
        if (fs.existsSync(projectRootPath)) {
          credentialsPath = path.resolve(projectRootPath);
          console.log(
            `📁 Auto-detected Google Slides credentials: ${credentialsPath}`
          );
        }
      } else if (credentialsPath && !path.isAbsolute(credentialsPath)) {
        credentialsPath = path.resolve(process.cwd(), credentialsPath);
      }

      // Copy credentials to google-slides-mcp directory if needed
      if (credentialsPath && fs.existsSync(credentialsPath)) {
        const targetCredentialsPath = path.join(
          process.cwd(),
          "google-slides-mcp",
          "credentials.json"
        );
        if (!fs.existsSync(targetCredentialsPath)) {
          try {
            fs.copyFileSync(credentialsPath, targetCredentialsPath);
            console.log(
              `📋 Copied credentials to google-slides-mcp/credentials.json`
            );
          } catch (err) {
            console.error(
              `⚠️ Failed to copy credentials to google-slides-mcp:`,
              err
            );
          }
        }
      }

      return {
        GOOGLE_OAUTH_CREDENTIALS: credentialsPath,
        GOOGLE_SLIDES_MCP_TOKEN_PATH: process.env.GOOGLE_SLIDES_MCP_TOKEN_PATH,
      };
    })(),
    detectTrigger: detectGoogleSlidesTrigger,
    enabled: (() => {
      const fs = require("fs");
      const path = require("path");
      const serverPath = path.join(
        process.cwd(),
        "google-slides-mcp",
        "build",
        "server.js"
      );
      const credentialsPath = path.join(
        process.cwd(),
        "google-slides-mcp",
        "credentials.json"
      );
      return (
        fs.existsSync(serverPath) &&
        (fs.existsSync(credentialsPath) ||
          fs.existsSync(path.join(process.cwd(), "gcp-oauth.keys.json")))
      );
    })(),
  },
  zomato: {
    // Zomato MCP is HTTP-based, accessed via mcp-remote
    type: "http",
    url: process.env.ZOMATO_MCP_URL || "https://mcp-server.zomato.com/mcp",
    env: {
      // Zomato may require OAuth tokens (set if needed)
      // Add any required environment variables here
    },
    detectTrigger: detectZomatoTrigger,
    enabled: true, // Zomato MCP is publicly accessible, no auth required for basic usage
  },
  googledocs: {
    // Using MCP-Google-Doc from https://github.com/ophydami/MCP-Google-Doc
    // This is a local TypeScript-based MCP server
    // Configured similar to Google Calendar - uses same OAuth credentials
    packageName: path.resolve(
      process.cwd(),
      "google-docs-mcp",
      "build",
      "server.js"
    ),
    env: (() => {
      const fs = require("fs");
      const path = require("path");

      // Determine credentials file path - same as Google Calendar
      let credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;

      // If not set, check for file in project root
      if (!credentialsPath) {
        const projectRootPath = path.join(process.cwd(), "gcp-oauth.keys.json");
        if (fs.existsSync(projectRootPath)) {
          credentialsPath = path.resolve(projectRootPath);
          console.log(
            `📁 Auto-detected Google Docs credentials: ${credentialsPath}`
          );
        }
      } else if (credentialsPath && !path.isAbsolute(credentialsPath)) {
        credentialsPath = path.resolve(process.cwd(), credentialsPath);
      }

      // Copy credentials to google-docs-mcp directory if needed
      const docsCredentialsPath = path.join(
        process.cwd(),
        "google-docs-mcp",
        "credentials.json"
      );
      if (
        credentialsPath &&
        fs.existsSync(credentialsPath) &&
        !fs.existsSync(docsCredentialsPath)
      ) {
        try {
          fs.copyFileSync(credentialsPath, docsCredentialsPath);
          console.log(
            `📋 Copied credentials to google-docs-mcp/credentials.json`
          );
        } catch (err) {
          console.warn(`⚠️  Could not copy credentials: ${err.message}`);
        }
      }

      return {
        // The server uses credentials.json in its own directory
        // We ensure it's available via the copy above
      };
    })(),
    detectTrigger: detectGoogleDocsTrigger,
    enabled: (() => {
      const fs = require("fs");
      const path = require("path");
      const serverPath = path.join(
        process.cwd(),
        "google-docs-mcp",
        "build",
        "server.js"
      );
      const credentialsPath = path.join(
        process.cwd(),
        "google-docs-mcp",
        "credentials.json"
      );
      const rootCredentialsPath = path.join(
        process.cwd(),
        "gcp-oauth.keys.json"
      );
      // Enable if server exists and credentials are available (same pattern as Google Calendar)
      return (
        fs.existsSync(serverPath) &&
        (fs.existsSync(credentialsPath) ||
          fs.existsSync(rootCredentialsPath) ||
          !!process.env.GOOGLE_OAUTH_CREDENTIALS)
      );
    })(),
  },
  whatsapp: {
    // Using WhatsApp MCP from https://github.com/lharries/whatsapp-mcp
    // This is a Python-based MCP server that requires a Go bridge
    // The Go bridge (whatsapp-bridge) must be running separately on localhost:8080
    type: "python",
    command: (() => {
      // Check if uv is available, otherwise use python
      try {
        const { execSync } = require("child_process");
        execSync("uv --version", { stdio: "ignore" });
        return process.env.UV_PATH || "uv";
      } catch (e) {
        // uv not available, use python
        return process.env.PYTHON_PATH || "python";
      }
    })(),
    packageName: path.resolve(
      process.cwd(),
      "whatsapp-mcp",
      "whatsapp-mcp-server"
    ),
    script: "main.py",
    env: {
      // The Python server connects to the Go bridge at http://localhost:8080
    },
    detectTrigger: detectWhatsAppTrigger,
    enabled: (() => {
      const fs = require("fs");
      const serverPath = path.join(
        process.cwd(),
        "whatsapp-mcp",
        "whatsapp-mcp-server",
        "main.py"
      );
      return fs.existsSync(serverPath);
    })(),
  },
  // Uncomment and configure as needed:
  // browser: {
  //   packageName: "@modelcontextprotocol/server-playwright",
  //   detectTrigger: detectBrowserTrigger,
  //   enabled: true,
  // },
  // sqlite: {
  //   packageName: "@modelcontextprotocol/server-sqlite",
  //   env: {
  //     SQLITE_DB_PATH: process.env.SQLITE_DB_PATH || "./db.sqlite",
  //   },
  //   detectTrigger: (text) => /\b(sqlite|database|db|query)\b/i.test(text),
  //   enabled: true,
  // },
};

/**
 * Get enabled MCPs based on user text
 */
function getEnabledMCPs(text = "") {
  const enabled = [];
  for (const [name, config] of Object.entries(MCP_REGISTRY)) {
    if (!config.enabled) {
      // Log why MCP is disabled (for debugging)
      if (config.detectTrigger && config.detectTrigger(text)) {
        console.log(
          `⚠️ ${name} MCP detected but not enabled (missing credentials/config)`
        );
      }
      continue;
    }
    if (config.detectTrigger && config.detectTrigger(text)) {
      enabled.push(name);
    }
  }
  return enabled;
}

/**
 * Start MCP by name
 */
async function getMCP(name) {
  const config = MCP_REGISTRY[name];
  if (!config) {
    throw new Error(
      `Unknown MCP: ${name}. Available: ${Object.keys(MCP_REGISTRY).join(", ")}`
    );
  }
  if (!config.enabled) {
    throw new Error(`MCP ${name} is not enabled (missing config or env vars)`);
  }
  return startMCP(name, config);
}

/**
 * Get all available MCPs
 */
function getAvailableMCPs() {
  return Object.keys(MCP_REGISTRY).filter((name) => MCP_REGISTRY[name].enabled);
}

module.exports = {
  startMCP,
  getMCP,
  getEnabledMCPs,
  getAvailableMCPs,
  MCP_REGISTRY,
};
