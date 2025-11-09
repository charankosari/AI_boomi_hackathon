import { McpServer, ResourceTemplate, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import { fileURLToPath } from "url";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
// Set up OAuth2.0 scopes - we need full access to Slides and Drive
const SCOPES = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.readonly", // Add read-only scope as a fallback
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
    name: "google-slides",
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
// Create Slides and Drive API clients
let slidesClient;
let driveClient;
// Initialize Google API clients
async function initClients() {
    try {
        console.error("Starting client initialization...");
        const auth = await authorize();
        console.error("Auth completed successfully:", !!auth);
        slidesClient = google.slides({ version: "v1", auth: auth });
        console.error("Slides client created:", !!slidesClient);
        driveClient = google.drive({ version: "v3", auth: auth });
        console.error("Drive client created:", !!driveClient);
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
// RESOURCES
// Resource for listing presentations
server.resource("list-presentations", "googleslides://list", async (uri) => {
    try {
        const response = await driveClient.files.list({
            q: "mimeType='application/vnd.google-apps.presentation'",
            fields: "files(id, name, createdTime, modifiedTime)",
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: "allDrives",
        });
        const files = response.data.files || [];
        let content = "Google Slides presentations in your Drive:\n\n";
        if (files.length === 0) {
            content += "No Google Slides presentations found.";
        }
        else {
            files.forEach((file) => {
                content += `Title: ${file.name}\n`;
                content += `ID: ${file.id}\n`;
                content += `Created: ${file.createdTime}\n`;
                content += `Last Modified: ${file.modifiedTime}\n\n`;
            });
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error listing presentations:", error);
        return {
            contents: [
                {
                    uri: uri.href,
                    text: `Error listing presentations: ${error}`,
                },
            ],
        };
    }
});
// Resource to get a specific presentation by ID
server.resource("get-presentation", new ResourceTemplate("googleslides://{presentationId}", { list: undefined }), async (uri, { presentationId }) => {
    try {
        const presentation = await slidesClient.presentations.get({
            presentationId: presentationId,
        });
        // Extract the presentation content
        let content = `Presentation: ${presentation.data.title}\n\n`;
        // Process the presentation content
        if (presentation.data.slides) {
            content += `Total slides: ${presentation.data.slides.length}\n\n`;
            presentation.data.slides.forEach((slide, index) => {
                content += `Slide ${index + 1}:\n`;
                // Extract text from slide elements
                if (slide.pageElements) {
                    slide.pageElements.forEach((element) => {
                        if (element.shape && element.shape.text) {
                            const textElements = element.shape.text.textElements || [];
                            textElements.forEach((textElement) => {
                                if (textElement.textRun && textElement.textRun.content) {
                                    content += textElement.textRun.content;
                                }
                            });
                        }
                    });
                }
                content += "\n\n";
            });
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    text: content,
                },
            ],
        };
    }
    catch (error) {
        console.error(`Error getting presentation ${presentationId}:`, error);
        return {
            contents: [
                {
                    uri: uri.href,
                    text: `Error getting presentation ${presentationId}: ${error}`,
                },
            ],
        };
    }
});
// TOOLS
// Tool to create a new presentation
server.tool("create-presentation", {
    title: z.string().describe("The title of the new presentation"),
}, async ({ title }) => {
    try {
        // Create a new presentation
        const presentation = await slidesClient.presentations.create({
            requestBody: {
                title: title,
            },
        });
        const presentationId = presentation.data.presentationId;
        return {
            content: [
                {
                    type: "text",
                    text: `Presentation created successfully!\nTitle: ${title}\nPresentation ID: ${presentationId}\nYou can now reference this presentation using: googleslides://${presentationId}`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error creating presentation:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error creating presentation: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to list all presentations
server.tool("list-presentations", {}, async () => {
    try {
        const response = await driveClient.files.list({
            q: "mimeType='application/vnd.google-apps.presentation'",
            fields: "files(id, name, createdTime, modifiedTime)",
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: "allDrives",
        });
        const files = response.data.files || [];
        let content = "Google Slides presentations in your Drive:\n\n";
        if (files.length === 0) {
            content += "No Google Slides presentations found.";
        }
        else {
            files.forEach((file) => {
                content += `Title: ${file.name}\n`;
                content += `ID: ${file.id}\n`;
                content += `Created: ${file.createdTime}\n`;
                content += `Last Modified: ${file.modifiedTime}\n\n`;
            });
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
        console.error("Error listing presentations:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error listing presentations: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to get a specific presentation by ID
server.tool("get-presentation", {
    presentationId: z
        .string()
        .describe("The ID of the presentation to retrieve"),
}, async ({ presentationId }) => {
    try {
        const presentation = await slidesClient.presentations.get({
            presentationId: presentationId,
        });
        // Extract the presentation content
        let content = `Presentation: ${presentation.data.title}\n\n`;
        // Process the presentation content
        if (presentation.data.slides) {
            content += `Total slides: ${presentation.data.slides.length}\n\n`;
            presentation.data.slides.forEach((slide, index) => {
                content += `Slide ${index + 1}:\n`;
                // Extract text from slide elements
                if (slide.pageElements) {
                    slide.pageElements.forEach((element) => {
                        if (element.shape && element.shape.text) {
                            const textElements = element.shape.text.textElements || [];
                            textElements.forEach((textElement) => {
                                if (textElement.textRun && textElement.textRun.content) {
                                    content += textElement.textRun.content;
                                }
                            });
                        }
                    });
                }
                content += "\n\n";
            });
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
        console.error(`Error getting presentation ${presentationId}:`, error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting presentation ${presentationId}: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to update/add content to a presentation
server.tool("update-presentation", {
    presentationId: z.string().describe("The ID of the presentation to update"),
    content: z.string().describe("The content to add to the presentation"),
    slideIndex: z
        .number()
        .optional()
        .describe("The slide index to add content to (0-based). If not provided, adds a new slide"),
}, async ({ presentationId, content, slideIndex }) => {
    try {
        // Get the presentation first
        const presentation = await slidesClient.presentations.get({
            presentationId: presentationId,
        });
        const slides = presentation.data.slides || [];
        let targetSlideId;
        if (slideIndex !== undefined && slideIndex >= 0 && slideIndex < slides.length) {
            // Use existing slide
            targetSlideId = slides[slideIndex].objectId;
        }
        else {
            // Create a new slide
            const createSlideResponse = await slidesClient.presentations.batchUpdate({
                presentationId: presentationId,
                requestBody: {
                    requests: [
                        {
                            createSlide: {
                                insertionIndex: slides.length,
                            },
                        },
                    ],
                },
            });
            // Get the new slide ID
            const newSlideId = createSlideResponse.data.replies?.[0]?.createSlide?.objectId;
            if (!newSlideId) {
                throw new Error("Failed to create new slide");
            }
            targetSlideId = newSlideId;
        }
        // Add text box to the slide with the content
        const textBoxId = `textbox_${Date.now()}`;
        await slidesClient.presentations.batchUpdate({
            presentationId: presentationId,
            requestBody: {
                requests: [
                    {
                        createShape: {
                            objectId: textBoxId,
                            shapeType: "TEXT_BOX",
                            elementProperties: {
                                pageObjectId: targetSlideId,
                                size: {
                                    height: { magnitude: 200, unit: "PT" },
                                    width: { magnitude: 500, unit: "PT" },
                                },
                                transform: {
                                    scaleX: 1,
                                    scaleY: 1,
                                    translateX: 50,
                                    translateY: 50,
                                    unit: "PT",
                                },
                            },
                        },
                    },
                    {
                        insertText: {
                            objectId: textBoxId,
                            text: content,
                        },
                    },
                ],
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Presentation updated successfully!\nPresentation ID: ${presentationId}\nContent added to slide ${slideIndex !== undefined ? slideIndex + 1 : slides.length + 1}`,
                },
            ],
        };
    }
    catch (error) {
        console.error("Error updating presentation:", error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error updating presentation: ${error}`,
                },
            ],
            isError: true,
        };
    }
});
// Tool to delete a presentation
server.tool("delete-presentation", {
    presentationId: z.string().describe("The ID of the presentation to delete"),
}, async ({ presentationId }) => {
    try {
        // Get the presentation title first for confirmation
        const presentation = await slidesClient.presentations.get({
            presentationId: presentationId,
        });
        const title = presentation.data.title;
        // Delete the presentation
        await driveClient.files.delete({
            fileId: presentationId,
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Presentation "${title}" (ID: ${presentationId}) has been successfully deleted.`,
                },
            ],
        };
    }
    catch (error) {
        console.error(`Error deleting presentation ${presentationId}:`, error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error deleting presentation: ${error}`,
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
    console.error("Google Slides MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
