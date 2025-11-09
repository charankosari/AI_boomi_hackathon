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

```mermaid
flowchart LR
A[Voice Input\nOMI Wearable] --> B[Transcription]
B --> C[AI Intent Analysis]
C --> D{Action Needed?}
D -- No --> E[Store in MongoDB]
D -- Yes --> F[FastRouter API]
F --> G[MCP: Docs | Calendar | Gmail | Notion | WhatsApp | Zomato]
G --> H[Perform Action]
H --> I[Save Result + Notify User]
