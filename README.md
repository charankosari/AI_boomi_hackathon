🧠 Omi.me — Open-Source AI Wearable & Companion App (Your Personal Second Brain)

Omi.me is an open-source AI-powered wearable and companion app designed to act as your personal second brain. It continuously captures and analyzes conversations in real time, automatically handling tasks like note-taking, summarization, reminders, and follow-ups. More than just an assistant, Omi.me can take action on your behalf—helping you stay focused and get more done effortlessly by turning natural speech into multi-app workflows.

✨ Highlights

Voice-to-action automation across your everyday tools

Real-time transcription, intent detection, and execution

FastRouter API orchestrates multiple MCPs (Model Context Protocol servers)

Persistent memory and full audit trails in MongoDB

Extensible integrations: Google Docs, Calendar, Gmail, Notion, WhatsApp, Zomato, and more

📚 Table of Contents

What is Omi.me

How it Works (with workflow chart)

Example Workflow

Tech Stack

Tools & MCPs Used

Key Features

Architecture (with sequence & flow charts)

Setup & Installation

Configuration

Usage Examples

Extensibility

Security & Privacy

Future Enhancements

Contributing

🌍 What is Omi.me

Omi.me bridges human intent and digital action. Speak naturally and let Omi handle the rest: capture key moments, summarize discussions, schedule meetings, draft documents, send emails or messages, and trigger structured workflows—without opening apps or typing commands. Powered by the FastRouter API, Omi intelligently routes requests to connected MCPs and decides when a message is conversational vs. actionable. All actions and context are stored in MongoDB for reliable recall, analytics, and continuous improvement.

⚙️ How it Works

OMI wearable captures audio and streams it for transcription

AI detects user intent and context (tasks, notes, events, documents, messages)

FastRouter API chooses the right MCP(s) based on the conversation

The selected MCP(s) perform actions (e.g., create doc, schedule event, send email)

Results and metadata are persisted in MongoDB; user receives confirmation

flowchart LR
A[Voice Input\nOMI Wearable] --> B[Transcription]
B --> C[Intent & Context\nAI Processing]
C --> D{Action Needed?}
D -- No --> E[Conversation Log\nMongoDB]
D -- Yes --> F[FastRouter API\nTool Selection]
F --> G[MCP(s)\nDocs/Calendar/Gmail/Notion/WhatsApp/Zomato]
G --> H[Action Result]
H --> I[Persist & Audit\nMongoDB]
I --> J[Notify User\nCompanion App]

🧭 Example Workflow

User says: “Create me a Google Doc about product pitching”

OMI transcribes the conversation

AI processes the intent (Claude API or configured LLM)

FastRouter API identifies Google Docs MCP

System creates the document automatically with an initial outline or content

Action and metadata are logged in MongoDB (actor, timestamp, tool, payload)

User receives a confirmation with a link to the document
User says: “Schedule a meeting with the team tomorrow at 3 PM”

OMI transcribes and extracts time, attendees, title

FastRouter routes to Google Calendar MCP

Event is created with reminders; conflicts handled if configured

Event details and IDs stored in MongoDB

Confirmation returned to the user

🧰 Tech Stack

Backend: Node.js

MCP Servers: Online available MCP servers connected through our APIs

Database: MongoDB (for data persistence and retrieval)

AI Processing: Claude API (configurable to other AI services)

API Hub: FastRouter API (central orchestration layer)

Authentication: Google OAuth and OTP-based authentication

Mobile App: React Native with Expo (for the companion UI)

Hardware: OMI wearable device (audio capture + webhook delivery)

🔌 Tools & MCPs Used
Communication & Messaging

WhatsApp: Send messages, share media, manage conversations

Gmail: Email management with advanced features

Summarize emails

Mark as important/read/spam

Send and receive emails

Labeling and organization

Calendar & Scheduling

Google Calendar: Complete calendar management

Create meetings at required times

Update existing meetings

Retrieve meeting details

Delete meetings

Schedule coordination and reminders

Documentation & Productivity

Google Docs: Document management

Create documents

Get document content

Update documents

Delete documents

Google Slides: Presentation management

Create presentations

Get presentation content

Update presentations

Delete presentations

Notion: Flexible workspace

Create pages, databases, or content as requested

Get content

Edit content

Delete content

Food & Lifestyle

Zomato: Food ordering and restaurant discovery

Extensibility

The system is designed for rapid MCP expansion, enabling new integrations with minimal boilerplate via FastRouter’s tool selection contracts and standardized auth flows.

⭐ Key Features

Voice Transcription

Real-time transcription of daily conversations via OMI device

Webhook-based ingestion for low-latency processing

AI-Powered Intent Recognition

Natural language parsing for goals, parameters, and entities

Context-aware decision making and memory referencing

Distinguishes between “just chatting” and actionable requests

Multi-MCP Orchestration

FastRouter API as a central decision hub

Intelligent tool selection based on domain, permissions, and context

Supports sequential or parallel MCP execution with result aggregation

Comprehensive Service Integration

Email: Summarize, organize, mark, send/receive

Calendar: Full CRUD on events with conflicts and reminders

Documents: Create/read/update/delete Docs and Slides

Knowledge: Notion pages, updates, and structured content

Data Persistence

MongoDB collections for conversations, actions, entities, and audit logs

Queryable history for summaries, analytics, and follow-ups

Durable workflow execution logs with correlation IDs

Authentication

Google OAuth integration for Google MCPs

OTP-based user sign-in for fast onboarding

Secure MCP connection vaulting and token rotation

🏛 Architecture
sequenceDiagram
autonumber
participant U as User
participant W as OMI Wearable
participant T as Transcription
participant AI as Intent & Context (Claude/LLM)
participant FR as FastRouter API
participant M as MCP(s)
participant DB as MongoDB
participant A as App (React Native)
U->>W: Natural speech
W->>T: Audio stream (webhook)
T->>AI: Transcript text
AI->>FR: Intent + entities + confidence
FR->>M: Route to appropriate MCP(s)
M-->>DB: Persist action/result
M-->>FR: Tool responses
FR-->>A: Confirmation + payload
A-->>U: Notification/link

Core Data Model (MongoDB)

users: profile, auth bindings, preferences

devices: wearable bindings, webhook endpoints

conversations: transcript segments, timestamps, speaker labels

intents: detected intents, entities, confidence, versions

actions: requested operations, target MCP, status, retries

results: normalized outputs and links (docId, eventId, messageId)

audits: signed envelopes, request/response bodies (redacted), latencies

permissions: scoped grants per provider/tool

🛠 Setup & Installation
Prerequisites

Node.js v16+

MongoDB instance (local or managed)

OMI device with webhook configuration

Google Cloud credentials (OAuth client for Docs/Calendar/Gmail)

API keys for Claude API and FastRouter API

Backend Setup

Clone repository and navigate to backend folder (e.g., omi)

Install dependencies: npm install

Copy .env.example to .env and fill values

Start local dev server: npm run dev

Expose webhook (e.g., via ngrok) and configure on OMI device

Mobile App Setup (React Native + Expo)

Navigate to the companion app folder (e.g., omi_app)

Install dependencies: npm install

Set API base URLs in config.js

Run the app: npm start (or expo start)

⚙️ Configuration
Environment Variables (Backend)

PORT: API port

MONGODB_URI: MongoDB connection string

JWT_SECRET: token signing key (if used)

FASTROUTER_URL: base URL for FastRouter API

FASTROUTER_TOKEN: auth token

CLAUDE_API_KEY: key for AI processing (configurable to other models)

GOOGLE_CLIENT_ID: OAuth client ID

GOOGLE_CLIENT_SECRET: OAuth client secret

GOOGLE_REDIRECT_URI: OAuth redirect URL

WEBHOOK_SIGNING_SECRET: verify device webhooks

ALLOWED_ORIGINS: CORS list

Authentication

Sign in with Google OAuth for Google MCPs

OTP-based login for users without OAuth or for device-only onboarding

MCP Connections

Connect MCPS via in-app flows (e.g., Google Docs/Calendar/Gmail, Notion, WhatsApp, Zomato)

Tokens are securely stored and rotated as per provider best practices

🚀 Usage Examples
Creating a Document

User says: “Create me a Google Doc about product pitching”

Docs MCP creates a new document with title and starter sections

Link returned in app; action logged in MongoDB

Scheduling a Meeting

User says: “Schedule a meeting with the team tomorrow at 3 PM”

Calendar MCP creates event with invitees, reminders, and timezone handling

Event ID and details saved and displayed

Managing Emails

User says: “Mark all emails from John as important”

Gmail MCP finds matching messages and updates labels/importance

Summary and counts stored in results collection

Creating Notion Content

User says: “Create a Notion page for project planning”

Notion MCP creates the page with a default template

Page URL returned and stored with entity references

🧩 Extensibility

Add an MCP by implementing the provider interface (capabilities, auth, actions)

Register tool schema with FastRouter so it can route based on detected intent

Provide minimal mapping for inputs/outputs to the normalized action/result records

Update permissions to include the new provider scopes

🔐 Security & Privacy

Principle of least privilege: request only necessary scopes

Token encryption at rest; short-lived tokens where supported

Webhook signature validation and replay protection

PII redaction in logs; per-user data export and deletion endpoints

Configurable retention policies for transcripts and actions

🗺 Future Enhancements

Additional MCP integrations

Multi-language speech/UX support

Pluggable, model-agnostic AI layer with toolformer-style planning

Analytics and insights dashboard

Custom workflow templates and reusable voice macros

🤝 Contributing

This project was developed by Charan and Nithish for the AI Boomi Hackathon. Contributions and improvements are welcome! You can help by adding new MCPs, improving FastRouter decision quality, enhancing memory and summarization, optimizing the mobile UX, or expanding test coverage. Please open issues and pull requests with clear descriptions, steps to reproduce, and screenshots where helpful.
