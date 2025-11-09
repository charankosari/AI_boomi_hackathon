## Brief Overview

OMI is an open-source voice assistant framework that enables developers to build intelligent, voice-driven applications. In this project, we built an AI agent on top of the OMI framework that transforms daily conversations into actionable tasks. Using the OMI device, transcribed text from everyday conversations is captured through webhooks and processed by our system using AI (Claude API) to understand user intent and automatically trigger the appropriate tools and services.

The system uses **FastRouter API** as a central hub that connects to multiple MCPs (Model Context Protocols) including Google Docs, Google Calendar, Gmail, Notion, Zomato, WhatsApp, and many more. The FastRouter API intelligently decides which tool to use based on the conversation context, or determines if it's just a normal conversation that doesn't require any action.

All actions and data are saved in MongoDB for persistence and retrieval, enabling features like email summarization, calendar management, document creation, and much more.

## Project Idea

The core idea is to create a seamless voice-to-action system where users can naturally speak their daily tasks and have them automatically executed across various platforms and services. Instead of manually opening apps, clicking buttons, or typing commands, users can simply speak naturally, and OMI handles the rest.

**Example Workflow:**

- User says: _"Create me a Google Doc about product pitching"_
- OMI transcribes the conversation
- AI processes the intent through Claude API
- FastRouter API identifies the need for Google Docs MCP
- System creates the document automatically
- Action is logged in MongoDB

## Tech Stack

- **Backend**: Node.js
- **MCP Servers**: Online available MCP servers connected through our APIs
- **Database**: MongoDB (for data persistence and retrieval)
- **AI Processing**: Claude API (configurable to other AI services)
- **API Hub**: FastRouter API (central orchestration layer)
- **Authentication**: Google OAuth and OTP-based authentication
- **Mobile App**: React Native with Expo (for user interface)

## Tools & MCPs Used

### Communication & Messaging

- **WhatsApp** - Send messages, share media, manage conversations
- **Gmail** - Email management with advanced features:
  - Summarize emails
  - Mark as important/read/spam
  - Send and receive emails
  - Email organization

### Calendar & Scheduling

- **Google Calendar** - Complete calendar management:
  - Create meetings at required times
  - Update existing meetings
  - Get meeting details
  - Delete meetings
  - Schedule management

### Documentation & Productivity

- **Google Docs** - Document management:

  - Create documents
  - Get document content
  - Update documents
  - Delete documents

- **Google Slides** - Presentation management:

  - Create presentations
  - Get presentation content
  - Update presentations
  - Delete presentations

- **Notion** - All-in-one workspace:
  - Create anything as per user's wish
  - Delete content
  - Get content
  - Edit content

### Food & Lifestyle

- **Zomato** - Food ordering and restaurant discovery

### Additional MCPs

The system is designed to be extensible, allowing easy integration of many more MCPs as needed.

## Key Features

### 1. Voice Transcription

- Real-time transcription of daily conversations via OMI device
- Webhook-based processing for seamless integration

### 2. AI-Powered Intent Recognition

- Natural language processing to understand user intent
- Context-aware decision making
- Distinguishes between actionable requests and normal conversations

### 3. Multi-MCP Orchestration

- Centralized hub (FastRouter API) managing multiple MCPs
- Intelligent routing to appropriate tools
- Support for sequential and parallel MCP execution

### 4. Comprehensive Service Integration

- **Email Management**: Summarize, categorize, and manage emails
- **Calendar Management**: Full CRUD operations on calendar events
- **Document Management**: Create, read, update, and delete documents
- **Presentation Management**: Complete slide deck management
- **Knowledge Management**: Flexible content creation and management in Notion

### 5. Data Persistence

- MongoDB integration for all actions and data
- Conversation history tracking
- Workflow execution logs

### 6. Authentication

- Google OAuth integration
- OTP-based authentication
- Secure MCP connection management

## Architecture

### Flow

1. **Voice Input**: User speaks naturally in daily conversations
2. **Transcription**: OMI device transcribes speech to text
3. **Webhook Processing**: Transcribed text sent via webhook
4. **AI Analysis**: Claude API processes text to understand intent
5. **Routing Decision**: FastRouter API decides which MCP to use
6. **MCP Execution**: Selected MCP performs the required action
7. **Data Storage**: Results and actions saved in MongoDB
8. **Response**: User receives confirmation or results

## Setup & Installation

### Prerequisites

- Node.js (v16 or later)
- MongoDB instance
- OMI device with webhook configuration
- Google Cloud credentials (for Google services)
- API keys for Claude API and FastRouter API

### Backend Setup

1. Navigate to the omi directory
2. Install dependencies:
   npm install
3. Configure environment variables
4. Set up MongoDB connection
5. Configure OAuth credentials for Google services
6. Set up webhook endpoints for OMI device

### Mobile App Setup

1. Navigate to the omi_app directory
2. Install dependencies:
   npm install
3. Configure API endpoints in config.js
4. Run the app:
   npm start

## Configuration

### MCP Connection

- Sign up with Google OAuth or use OTP authentication
- Connect to desired MCPs through the authentication flow
- MCPs are automatically configured and ready to use

### API Configuration

- Configure Claude API endpoint (can be changed as per requirements)
- Set up FastRouter API as the central hub
- Configure individual MCP server endpoints

## Usage Examples

### Creating a Document

**User says**: _"Create me a Google Doc about product pitching"_

- System creates a new Google Doc
- Document is saved and accessible
- Action logged in MongoDB

### Scheduling a Meeting

**User says**: _"Schedule a meeting with the team tomorrow at 3 PM"_

- Google Calendar MCP creates the event
- Meeting details saved
- Confirmation provided

### Managing Emails

**User says**: _"Mark all emails from John as important"_

- Gmail MCP processes the request
- Emails are marked accordingly
- Status updated in database

### Creating Notion Content

**User says**: _"Create a Notion page for project planning"_

- Notion MCP creates the page
- Content structure is set up
- Page is accessible and editable

## Future Enhancements

- [ ] Additional MCP integrations
- [ ] Multi-language support
- [ ] Advanced AI models integration
- [ ] Analytics and insights dashboard
- [ ] Custom workflow templates

## Contributing

This project was developed by Charan and Nithish for the AI Boomi Hackathon. Contributions and improvements are welcome!

---
