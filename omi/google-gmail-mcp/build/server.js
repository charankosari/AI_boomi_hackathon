import { McpServer, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import { fileURLToPath } from "url";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
// Set up OAuth2.0 scopes - we need full access to Gmail
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
];
// Resolve paths relative to the project root
// Use fileURLToPath to properly handle file:// URLs on all platforms (especially Windows)
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
// The token path is where we'll store the OAuth credentials
const TOKEN_PATH = path.join(PROJECT_ROOT, "token.json");
// The credentials path is where your OAuth client credentials are stored
const CREDENTIALS_PATH = path.join(PROJECT_ROOT, "credentials.json");
// Create an MCP server instance
const server = new McpServer({
    name: "google-gmail",
    version: "1.0.0",
});
/**
 * Load saved credentials if they exist, otherwise trigger the OAuth flow
 */
async function authorize() {
    try {
        // Load client secrets from a local file
        console.error("Reading credentials from:", CREDENTIALS_PATH);
        const content = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
        const keys = JSON.parse(content);
        const clientId = keys.installed.client_id;
        const clientSecret = keys.installed.client_secret;
        const redirectUri = keys.installed.redirect_uris[0];
        console.error("Using client ID:", clientId);
        console.error("Using redirect URI:", redirectUri);
        // Create an OAuth2 client
        const oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
        // Check if we have previously stored a token
        if (fs.existsSync(TOKEN_PATH)) {
            console.error("Found existing token, attempting to use it...");
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
            oAuth2Client.setCredentials(token);
            return oAuth2Client;
        }
        // No token found, use the local-auth library to get one
        console.error("No token found, starting OAuth flow...");
        const client = await authenticate({
            scopes: SCOPES,
            keyfilePath: CREDENTIALS_PATH,
        });
        if (client.credentials) {
            console.error("Authentication successful, saving token...");
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials));
            console.error("Token saved successfully to:", TOKEN_PATH);
        }
        else {
            console.error("Authentication succeeded but no credentials returned");
        }
        return client;
    }
    catch (err) {
        console.error("Error authorizing with Google:", err);
        if (err.message)
            console.error("Error message:", err.message);
        if (err.stack)
            console.error("Stack trace:", err.stack);
        throw err;
    }
}
// Create Gmail API client
let gmailClient;
// Initialize Google API clients
async function initClients() {
    try {
        console.error("Starting client initialization...");
        const auth = await authorize();
        console.error("Auth completed successfully:", !!auth);
        gmailClient = google.gmail({ version: "v1", auth: auth });
        console.error("Gmail client created:", !!gmailClient);
        return true;
    }
    catch (error) {
        console.error("Failed to initialize Google API clients:", error);
        return false;
    }
}
// Initialize clients when the server starts
initClients().then((success) => {
    if (!success) {
        console.error("Failed to initialize Google API clients. Server will not work correctly.");
    }
    else {
        console.error("Google API clients initialized successfully.");
    }
});
// Helper function to decode email body
function decodeEmailBody(message) {
    let body = "";
    if (message.payload) {
        if (message.payload.body?.data) {
            body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
        }
        else if (message.payload.parts) {
            for (const part of message.payload.parts) {
                if (part.body?.data && part.mimeType === "text/plain") {
                    body = Buffer.from(part.body.data, "base64").toString("utf-8");
                    break;
                }
            }
        }
    }
    return body;
}
// TOOLS
// Tool to list emails
server.tool("list-emails", {
    query: z
        .string()
        .optional()
        .describe("Gmail search query (e.g., 'is:spam', 'is:unread', 'from:example@gmail.com')"),
    maxResults: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of emails to return"),
}, async ({ query = "", maxResults = 10 }) => {
    try {
        const response = await gmailClient.users.messages.list({
            userId: "me",
            q: query,
            maxResults: maxResults,
        });
        const messages = response.data.messages || [];
        let content = `Found ${messages.length} email(s):\n\n`;
        if (messages.length === 0) {
            content += "No emails found.";
        }
        else {
            // Get full message details for each email
            for (const message of messages.slice(0, maxResults)) {
                const fullMessage = await gmailClient.users.messages.get({
                    userId: "me",
                    id: message.id,
                    format: "metadata",
                    metadataHeaders: ["Subject", "From", "Date"],
                });
                const headers = fullMessage.data.payload?.headers || [];
                const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
                const from = headers.find((h) => h.name === "From")?.value || "Unknown";
                const date = headers.find((h) => h.name === "Date")?.value || "Unknown";
                content += `ID: ${message.id}\n`;
                content += `Subject: ${subject}\n`;
                content += `From: ${from}\n`;
                content += `Date: ${date}\n\n`;
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error listing emails:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error listing emails: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to get spam emails
server.tool("get-spam-emails", {
    maxResults: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of spam emails to return"),
}, async ({ maxResults = 10 }) => {
    try {
        const response = await gmailClient.users.messages.list({
            userId: "me",
            q: "is:spam",
            maxResults: maxResults,
        });
        const messages = response.data.messages || [];
        let content = `Found ${messages.length} spam email(s):\n\n`;
        if (messages.length === 0) {
            content += "No spam emails found.";
        }
        else {
            // Get full message details for each email
            for (const message of messages.slice(0, maxResults)) {
                const fullMessage = await gmailClient.users.messages.get({
                    userId: "me",
                    id: message.id,
                    format: "full",
                });
                const headers = fullMessage.data.payload?.headers || [];
                const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
                const from = headers.find((h) => h.name === "From")?.value || "Unknown";
                const date = headers.find((h) => h.name === "Date")?.value || "Unknown";
                const body = decodeEmailBody(fullMessage.data);
                content += `ID: ${message.id}\n`;
                content += `Subject: ${subject}\n`;
                content += `From: ${from}\n`;
                content += `Date: ${date}\n`;
                content += `Body: ${body.substring(0, 200)}${body.length > 200 ? "..." : ""}\n\n`;
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error getting spam emails:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting spam emails: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to get a specific email by ID
server.tool("get-email", {
    messageId: z.string().describe("The ID of the email to retrieve"),
}, async ({ messageId }) => {
    try {
        const message = await gmailClient.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
        });
        const headers = message.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const to = headers.find((h) => h.name === "To")?.value || "Unknown";
        const date = headers.find((h) => h.name === "Date")?.value || "Unknown";
        const body = decodeEmailBody(message.data);
        let content = `Email ID: ${messageId}\n`;
        content += `Subject: ${subject}\n`;
        content += `From: ${from}\n`;
        content += `To: ${to}\n`;
        content += `Date: ${date}\n`;
        content += `\nBody:\n${body}\n`;
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error(`Error getting email ${messageId}:`, error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting email: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to send an email
server.tool("send-email", {
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
}, async ({ to, subject, body }) => {
    try {
        const message = [`To: ${to}`, `Subject: ${subject}`, "", body].join("\n");
        const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        const response = await gmailClient.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Email sent successfully!\nMessage ID: ${response.data.id}`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error sending email:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error sending email: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to create a draft email
server.tool("create-draft", {
    to: z.string().optional().describe("Recipient email address (optional)"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
}, async ({ to, subject, body }) => {
    try {
        // Build the email message
        const headers = [];
        if (to) {
            headers.push(`To: ${to}`);
        }
        headers.push(`Subject: ${subject}`);
        headers.push(""); // Empty line between headers and body
        const message = [...headers, body].join("\n");
        // Encode the message
        const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        // Create the draft
        const response = await gmailClient.users.drafts.create({
            userId: "me",
            requestBody: {
                message: {
                    raw: encodedMessage,
                },
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Draft created successfully!\nDraft ID: ${response.data.id}\nMessage ID: ${response.data.message?.id}\nThe draft has been saved to your Gmail drafts folder.`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating draft:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error creating draft: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to list drafts
server.tool("list-drafts", {
    maxResults: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of drafts to return"),
}, async ({ maxResults = 10 }) => {
    try {
        const response = await gmailClient.users.drafts.list({
            userId: "me",
            maxResults: maxResults,
        });
        const drafts = response.data.drafts || [];
        let content = `Found ${drafts.length} draft(s):\n\n`;
        if (drafts.length === 0) {
            content += "No drafts found.";
        }
        else {
            // Get full draft details for each draft
            for (const draft of drafts.slice(0, maxResults)) {
                const fullDraft = await gmailClient.users.drafts.get({
                    userId: "me",
                    id: draft.id,
                    format: "full",
                });
                const headers = fullDraft.data.message?.payload?.headers || [];
                const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
                const to = headers.find((h) => h.name === "To")?.value || "No recipient";
                const date = headers.find((h) => h.name === "Date")?.value || "Unknown";
                content += `Draft ID: ${draft.id}\n`;
                content += `Subject: ${subject}\n`;
                content += `To: ${to}\n`;
                content += `Date: ${date}\n\n`;
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error listing drafts:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error listing drafts: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to delete draft(s)
server.tool("delete-draft", {
    draftIds: z
        .union([z.string(), z.array(z.string())])
        .describe("The ID(s) of the draft(s) to delete. Can be a single ID, an array of IDs, or a comma-separated string of IDs"),
}, async ({ draftIds }) => {
    try {
        // Convert to array: handle comma-separated string, single ID, or array
        let ids;
        if (Array.isArray(draftIds)) {
            ids = draftIds;
        }
        else if (typeof draftIds === "string" && draftIds.includes(",")) {
            // Handle comma-separated string
            ids = draftIds
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
        }
        else {
            ids = [draftIds];
        }
        const results = [];
        const errors = [];
        for (const draftId of ids) {
            try {
                // Delete the draft
                await gmailClient.users.drafts.delete({
                    userId: "me",
                    id: draftId,
                });
                results.push(draftId);
            }
            catch (error) {
                errors.push(`${draftId}: ${error}`);
            }
        }
        if (errors.length > 0 && results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error deleting drafts:\n${errors.join("\n")}`,
                    },
                ],
                isError: true,
            };
        }
        let content = `Successfully deleted ${results.length} draft(s):\n`;
        results.forEach((id) => {
            content += `- ${id}\n`;
        });
        if (errors.length > 0) {
            content += `\nErrors:\n${errors.join("\n")}`;
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error deleting drafts:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error deleting drafts: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to send a draft as an email
server.tool("send-draft", {
    draftId: z.string().describe("The ID of the draft to send"),
    to: z
        .string()
        .optional()
        .describe("Optional recipient email address. If provided, will override the draft's recipient before sending"),
}, async ({ draftId, to }) => {
    try {
        // Get the draft first
        const draft = await gmailClient.users.drafts.get({
            userId: "me",
            id: draftId,
            format: "full",
        });
        // Get the message from the draft
        let message = draft.data.message;
        if (!message) {
            throw new Error("Draft does not contain a message");
        }
        // If a recipient is provided, update the draft first
        if (to) {
            // Get the raw message or build it from payload
            let rawMessage;
            if (message.raw) {
                // Decode the raw message
                rawMessage = Buffer.from(message.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
            }
            else {
                // Build from payload
                const headers = message.payload?.headers || [];
                const subject = headers.find((h) => h.name === "Subject")?.value || "";
                const body = decodeEmailBody(message);
                rawMessage = [`Subject: ${subject}`, "", body].join("\n");
            }
            // Replace or add the To header
            if (rawMessage.includes("To:")) {
                rawMessage = rawMessage.replace(/^To:.*$/m, `To: ${to}`);
            }
            else {
                // Add To header at the beginning
                rawMessage = `To: ${to}\n${rawMessage}`;
            }
            // Re-encode the message
            const encodedMessage = Buffer.from(rawMessage)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
            // Update the draft with the new recipient
            await gmailClient.users.drafts.update({
                userId: "me",
                id: draftId,
                requestBody: {
                    message: {
                        raw: encodedMessage,
                    },
                },
            });
        }
        // Send the draft
        const response = await gmailClient.users.drafts.send({
            userId: "me",
            requestBody: {
                id: draftId,
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Draft sent successfully as email!\nMessage ID: ${response.data.id}\nDraft ID: ${draftId}\nThe draft has been sent and remains in your drafts folder.`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error sending draft:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error sending draft: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to mark email(s) as spam
server.tool("mark-as-spam", {
    messageIds: z
        .union([z.string(), z.array(z.string())])
        .describe("The ID(s) of the email(s) to mark as spam. Can be a single ID, an array of IDs, or a comma-separated string of IDs"),
}, async ({ messageIds }) => {
    try {
        // Convert to array: handle comma-separated string, single ID, or array
        let ids;
        if (Array.isArray(messageIds)) {
            ids = messageIds;
        }
        else if (typeof messageIds === "string" && messageIds.includes(",")) {
            // Handle comma-separated string
            ids = messageIds
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
        }
        else {
            ids = [messageIds];
        }
        const results = [];
        const errors = [];
        for (const messageId of ids) {
            try {
                // Mark email as spam by adding SPAM label and removing INBOX label
                await gmailClient.users.messages.modify({
                    userId: "me",
                    id: messageId,
                    requestBody: {
                        addLabelIds: ["SPAM"],
                        removeLabelIds: ["INBOX"],
                    },
                });
                results.push(messageId);
            }
            catch (error) {
                errors.push(`${messageId}: ${error}`);
            }
        }
        if (errors.length > 0 && results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error marking emails as spam:\n${errors.join("\n")}`,
                    },
                ],
                isError: true,
            };
        }
        let content = `Successfully marked ${results.length} email(s) as spam:\n`;
        results.forEach((id) => {
            content += `- ${id}\n`;
        });
        if (errors.length > 0) {
            content += `\nErrors:\n${errors.join("\n")}`;
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error marking emails as spam:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error marking emails as spam: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to mark email(s) as important
server.tool("mark-as-important", {
    messageIds: z
        .union([z.string(), z.array(z.string())])
        .describe("The ID(s) of the email(s) to mark as important. Can be a single ID, an array of IDs, or a comma-separated string of IDs"),
}, async ({ messageIds }) => {
    try {
        // Convert to array: handle comma-separated string, single ID, or array
        let ids;
        if (Array.isArray(messageIds)) {
            ids = messageIds;
        }
        else if (typeof messageIds === "string" && messageIds.includes(",")) {
            // Handle comma-separated string
            ids = messageIds
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
        }
        else {
            ids = [messageIds];
        }
        const results = [];
        const errors = [];
        for (const messageId of ids) {
            try {
                // Mark email as important by adding IMPORTANT label
                // Also add UNREAD label to ensure they remain unread (unseen) so people can see which important emails haven't been read
                await gmailClient.users.messages.modify({
                    userId: "me",
                    id: messageId,
                    requestBody: {
                        addLabelIds: ["IMPORTANT", "UNREAD"],
                    },
                });
                results.push(messageId);
            }
            catch (error) {
                errors.push(`${messageId}: ${error}`);
            }
        }
        if (errors.length > 0 && results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error marking emails as important:\n${errors.join("\n")}`,
                    },
                ],
                isError: true,
            };
        }
        let content = `Successfully marked ${results.length} email(s) as important:\n`;
        results.forEach((id) => {
            content += `- ${id}\n`;
        });
        if (errors.length > 0) {
            content += `\nErrors:\n${errors.join("\n")}`;
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error marking emails as important:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error marking emails as important: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to mark email(s) as read
server.tool("mark-as-read", {
    messageIds: z
        .union([z.string(), z.array(z.string())])
        .describe("The ID(s) of the email(s) to mark as read. Can be a single ID, an array of IDs, or a comma-separated string of IDs"),
}, async ({ messageIds }) => {
    try {
        // Convert to array: handle comma-separated string, single ID, or array
        let ids;
        if (Array.isArray(messageIds)) {
            ids = messageIds;
        }
        else if (typeof messageIds === "string" && messageIds.includes(",")) {
            // Handle comma-separated string
            ids = messageIds
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
        }
        else {
            ids = [messageIds];
        }
        const results = [];
        const errors = [];
        for (const messageId of ids) {
            try {
                // Mark email as read by removing UNREAD label
                await gmailClient.users.messages.modify({
                    userId: "me",
                    id: messageId,
                    requestBody: {
                        removeLabelIds: ["UNREAD"],
                    },
                });
                results.push(messageId);
            }
            catch (error) {
                errors.push(`${messageId}: ${error}`);
            }
        }
        if (errors.length > 0 && results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error marking emails as read:\n${errors.join("\n")}`,
                    },
                ],
                isError: true,
            };
        }
        let content = `Successfully marked ${results.length} email(s) as read:\n`;
        results.forEach((id) => {
            content += `- ${id}\n`;
        });
        if (errors.length > 0) {
            content += `\nErrors:\n${errors.join("\n")}`;
        }
        return {
            content: [
                {
                    type: "text",
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error marking emails as read:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error marking emails as read: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Connect to the transport and start the server
async function main() {
    // Create a transport for communicating over stdin/stdout
    const transport = new StdioServerTransport();
    // Connect the server to the transport
    await server.connect(transport);
    console.error("Google Gmail MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
