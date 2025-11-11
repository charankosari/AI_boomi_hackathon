
# 🧠 Omi.me — Open-Source AI Wearable & Companion App (Your Personal Second Brain)

Omi.me is an **open-source AI-powered wearable and companion app** designed to act as your **personal second brain**. It continuously captures and analyzes real-time conversations—automatically handling **note-taking, summarization, reminders, and actions**—so you can stay focused while Omi does the work.

---

## ✨ Highlights

- 🎙️ Voice-to-action automation across all your tools  
- ⚡ Real-time transcription & intent understanding  
- 🧩 FastRouter API connects multiple MCPs (Model Context Protocols)  
- 💾 Persistent memory and workflow logging via MongoDB  
- 🔗 Integrations: Google Docs, Calendar, Gmail, Notion, WhatsApp, Zomato, and more  

---

## 🌍 What is Omi.me

Omi.me bridges **human intent and digital action**. Instead of opening apps or typing commands, you simply **speak naturally**, and Omi executes your tasks—creating documents, scheduling meetings, sending messages, or ordering food.  
All actions and context are stored in **MongoDB** for secure recall, analytics, and automation.

---

## ⚙️ How It Works

1. **Voice Input:** OMI wearable captures audio and streams it to the backend  
2. **Transcription:** Speech converted to text in real time  
3. **AI Processing:** Intent and context analyzed (Claude API or any LLM)  
4. **Routing:** FastRouter API selects the right MCP  
5. **Execution:** Chosen MCP performs the task  
6. **Storage & Feedback:** Action logged in MongoDB; user gets confirmation  

```
flowchart LR
A[Voice Input\nOMI Wearable] --> B[Transcription]
B --> C[AI Intent Analysis]
C --> D{Action Needed?}
D -- No --> E[Store in MongoDB]
D -- Yes --> F[FastRouter API]
F --> G[MCP: Docs | Calendar | Gmail | Notion | WhatsApp | Zomato]
G --> H[Perform Action]
H --> I[Save Result + Notify User]
```

**🧭 Example Workflow**

User says: “Create me a Google Doc about product pitching”

OMI transcribes the speech

AI detects intent → FastRouter selects Google Docs MCP

Doc is created automatically

Action logged in MongoDB and link shared with user

User says: “Schedule a meeting with the team tomorrow at 3 PM”

FastRouter routes to Google Calendar MCP

Event created and synced with reminders

---

## 🧰 Tech Stack

- **Backend:** Node.js
- **Database:** MongoDB
- **AI Processing:** Claude API (configurable to other models)
- **API Hub:** FastRouter API
- **Authentication:** Google OAuth & OTP
- **Mobile App:** React Native (Expo)
- **Hardware:** OMI wearable device

---

## 🔌 Key Integrations

- **Gmail:** Summarize, send, mark, and organize emails
- **Google Calendar:** Create, update, or delete meetings
- **Google Docs/Slides:** Manage and edit documents & presentations
- **Notion:** Create and edit workspace content
- **WhatsApp:** Send messages, manage media
- **Zomato:** Discover and order food

---

## ⭐ Core Features

- 🗣️ **Voice Transcription:** Real-time, webhook-based capture
- 🧠 **Intent Recognition:** Understands context and executes actions
- 🔀 **Smart Routing:** Centralized FastRouter for multi-MCP orchestration
- 💬 **Service Integration:** Emails, docs, notes, events, and more
- 💾 **Persistence:** All workflows logged and retrievable via MongoDB
- 🔐 **Secure Access:** OAuth + OTP-based authentication

---

## 🛠 Setup & Installation

### Prerequisites

- Node.js (v16+)
- MongoDB instance
- Google OAuth credentials
- API keys for Claude & FastRouter
- OMI device with webhook config

### Steps

```
# Backend Setup
git clone https://github.com/charankosari/AI_boomi_hackathon
cd omi
npm install
cp .env.example .env
npm start

# Mobile App Setup
cd omi_app
npm install
npm start
```

### ⚙️ Configuration

- `FASTROUTER_URL`: Central routing hub
- `CLAUDE_API_KEY`: AI model key
- `GOOGLE_CLIENT_ID/SECRET`: OAuth credentials
- `MONGODB_URI`: Database connection
- `WEBHOOK_SECRET`: Device verification

---

## 🚀 Usage Examples

- “Create a Notion page for project planning” → Page auto-created & logged
- “Mark all emails from John as important” → Gmail MCP updates labels
- “Order my usual lunch” → Zomato MCP handles order

---

## 🔐 Security & Privacy

- Encrypted token storage
- OAuth scopes limited by principle of least privilege
- Webhook signature validation
- Configurable data retention & user control

---

## 🗺 Future Enhancements

- 🌐 Multi-language support
- 🤖 AI model orchestration upgrades
- 📊 Analytics dashboard
- 🔌 New MCP integrations
- 🧩 Custom workflow templates

---

## 🤝 Contributing

Built by Charan & Nithish for the AI Boomi Hackathon.  
