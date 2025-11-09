# MCP Orchestrator - React Native App

An intelligent MCP (Model Context Protocol) orchestration system built with React Native and Expo. This app receives transcripts from Omi, processes them through AI to identify which MCP tools to trigger, and maintains conversation history with workflow tracking.

## Features

- 🤖 **AI-Powered Intent Recognition** - Automatically identifies user intent from natural language
- 🔧 **15 MCP Tools Integration** - Supports WhatsApp, Gmail, Google Calendar, Notion, and 11 more tools
- 📊 **Real-Time Workflow Tracking** - Visual display of MCP execution steps with live status updates
- 💬 **Conversational Interface** - Clean chat UI with message bubbles and typing indicators
- 📝 **Conversation History** - Search, filter, and revisit past conversations
- 🎯 **Multi-MCP Orchestration** - Coordinate multiple MCPs in sequential or parallel patterns
- 📱 **Native Mobile Experience** - Built with React Native for iOS and Android

## Technology Stack

- **Framework**: React Native with Expo (~50.0.0)
- **Language**: JavaScript (ES6+)
- **State Management**: React Context API + AsyncStorage
- **Navigation**: React Navigation 6
- **UI Components**: React Native Paper
- **Storage**: AsyncStorage for local persistence
- **Date Handling**: date-fns

## Project Structure

```
OMI/
├── App.js                          # Main entry point
├── app.json                        # Expo configuration
├── package.json                    # Dependencies
├── babel.config.js                 # Babel configuration
├── config.js                       # App configuration
├── src/
│   ├── components/
│   │   ├── ChatWindow.js          # Main chat interface
│   │   ├── MessageBubble.js       # Individual message display
│   │   └── MCPWorkflowCard.js     # Workflow execution display
│   ├── screens/
│   │   ├── HomeScreen.js          # Main chat screen
│   │   └── HistoryScreen.js       # Conversation history
│   ├── context/
│   │   ├── ConversationContext.js # Conversation state management
│   │   └── MCPContext.js          # MCP workflow tracking
│   ├── services/
│   │   ├── AIOrchestrator.js      # Core orchestration logic
│   │   ├── MCPRouter.js           # MCP selection and routing
│   │   ├── StorageService.js      # AsyncStorage operations
│   │   └── OmiIntegration.js      # Omi transcript processing
│   ├── utils/
│   │   ├── intentRecognition.js   # Intent parsing logic
│   │   ├── mcpMapping.js          # MCP tool mapping
│   │   └── promptGenerator.js     # Execution prompt creation
│   └── constants/
│       ├── colors.js              # Theme colors
│       └── mcpTools.js            # MCP tool definitions
```

## Installation

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Expo CLI (optional, for development)
- iOS Simulator (for iOS development) or Android Emulator (for Android)

### Setup

1. **Clone the repository**
   ```bash
   cd /path/to/OMI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on your device**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on your physical device

## Usage

### Starting a Conversation

1. Open the app
2. Type a message in the input field at the bottom
3. Press send (➤ button)
4. Watch as the AI processes your request and orchestrates the appropriate MCPs

### Example Interactions

**Schedule a Meeting:**
```
User: "Schedule a meeting with Sarah next Tuesday at 2 PM"

AI Orchestrator:
- Recognizes intent: schedule event
- Selects MCP: Google Calendar
- Secondary MCP: Gmail (for sending invite)
- Executes workflow:
  ✓ Check availability
  ✓ Create calendar event
  ✓ Send invite to Sarah
```

**Send an Email:**
```
User: "Send an email to John about the project update"

AI Orchestrator:
- Recognizes intent: send email
- Selects MCP: Gmail
- Executes workflow:
  ✓ Compose email
  ✓ Add recipient: John
  ✓ Send email
```

**Order Food:**
```
User: "Order lunch from Zomato"

AI Orchestrator:
- Recognizes intent: order food
- Selects MCP: Zomato
- Executes workflow:
  ✓ Browse restaurants
  ✓ Select items
  ✓ Place order
```

### Viewing History

1. Tap the menu icon (☰) in the top left
2. View your conversation history
3. See statistics: total conversations, success rate, most used MCPs
4. Search conversations using the search bar
5. Tap a conversation to reopen it
6. Long press to delete a conversation

## Supported MCP Tools

The app supports 15 MCP tools across different categories:

### Communication
- 💬 **WhatsApp** - Messaging and media sharing
- 📧 **Gmail** - Email management
- 📨 **Outlook** - Corporate email and calendar

### Scheduling
- 📅 **Google Calendar** - Event management and scheduling

### Documentation
- 📄 **Google Docs** - Document creation and collaboration
- 📝 **Notion** - Note-taking and databases
- 🔮 **Obsidian** - Markdown notes and knowledge management

### Development
- 💝 **Lovable** - Web app building and deployment
- ⌨️ **Cursor** - AI-powered code editing

### Research
- 🤖 **Claude** - AI assistance and analysis
- 💭 **ChatGPT** - Conversational AI
- 🔍 **Perplexity** - AI-powered search and research

### Financial
- 📈 **Zerodha** - Stock trading and portfolio management

### Lifestyle
- 🍔 **Zomato** - Food ordering and restaurant discovery
- 🔊 **Alexa** - Smart home control and voice commands

## Architecture

### Core Components

1. **AIOrchestrator** - The brain of the system
   - Analyzes user intent
   - Selects appropriate MCPs
   - Generates execution plans
   - Coordinates workflow execution

2. **MCPRouter** - Intelligent routing
   - Maps intents to MCP tools
   - Determines orchestration patterns
   - Calculates confidence scores

3. **Intent Recognition** - Natural language processing
   - Extracts action types (create, send, schedule, etc.)
   - Identifies target objects (message, email, event, etc.)
   - Parses context (dates, people, topics)

4. **Workflow Management** - Real-time tracking
   - Step-by-step execution
   - Live status updates
   - Error handling and fallbacks

### Data Flow

```
User Input → Intent Recognition → MCP Selection → Execution Plan → Workflow Execution → Results Display
     ↓                                                                         ↓
Conversation Storage ←────────────────────────────────────────────────── Workflow Tracking
```

## Configuration

### Environment Variables

Create a `config.js` file (already included) and update as needed:

```javascript
export const CONFIG = {
  API_ENDPOINTS: {
    CLAUDE: 'your-claude-api-url',
    OMI: 'your-omi-api-url',
  },
  // ... other settings
};
```

### MCP Integration

To integrate actual MCP APIs:

1. Update `src/services/AIOrchestrator.js`
2. Implement real API calls in the `executeStep` method
3. Replace the simulated execution with actual MCP API interactions

## Development

### Adding a New MCP Tool

1. **Define the tool** in `src/constants/mcpTools.js`:
   ```javascript
   NEW_TOOL: {
     id: 'new_tool',
     name: 'New Tool',
     capabilities: ['capability1', 'capability2'],
     useCases: ['use_case_1', 'use_case_2'],
     triggerKeywords: ['keyword1', 'keyword2'],
     icon: '🆕',
     category: 'category',
   }
   ```

2. **Add routing logic** in `src/utils/mcpMapping.js`:
   ```javascript
   'action-target': ['new_tool'],
   ```

3. **Implement API integration** in `src/services/AIOrchestrator.js`

### Testing

Currently, the app uses simulated MCP execution. To test:

1. Run the app
2. Type various commands
3. Observe intent recognition and MCP selection
4. Check workflow execution in the UI
5. Review conversation history

## Troubleshooting

### Common Issues

**App won't start:**
- Ensure all dependencies are installed: `npm install`
- Clear cache: `expo start -c`

**Messages not saving:**
- Check AsyncStorage permissions
- Verify StorageService is working correctly

**Intent not recognized:**
- Check keyword matching in intent recognition
- Verify MCP mapping definitions

**Navigation errors:**
- Ensure React Navigation dependencies are installed
- Check navigation structure in App.js

## Future Enhancements

- [ ] Real MCP API integrations
- [ ] Omi transcript webhook integration
- [ ] Voice input support
- [ ] Push notifications for workflow completion
- [ ] Cloud sync for conversation history
- [ ] User authentication
- [ ] Custom MCP configurations
- [ ] Workflow templates
- [ ] Analytics and insights

## Contributing

This is a demonstration project. For production use:

1. Implement real MCP API integrations
2. Add authentication and security
3. Implement proper error handling
4. Add comprehensive testing
5. Optimize performance

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Check the documentation
- Review the code comments
- Open an issue on GitHub

---

Built with ❤️ using React Native and Expo
