/**
 * MCP Tools Definition
 * Comprehensive catalog of all 15 MCP tools with their capabilities,
 * use cases, and trigger keywords for intelligent routing
 */

export const MCP_TOOLS = {
  WHATSAPP: {
    id: 'whatsapp',
    name: 'WhatsApp',
    capabilities: ['messaging', 'media_sharing', 'group_communication', 'status_check'],
    useCases: ['send_message', 'share_file', 'check_status', 'create_group', 'broadcast'],
    triggerKeywords: ['message', 'whatsapp', 'send', 'text', 'chat', 'wa', 'forward'],
    icon: '💬',
    category: 'communication',
    description: 'Send messages, share media, and manage WhatsApp communications'
  },

  GOOGLE_CALENDAR: {
    id: 'google_calendar',
    name: 'Google Calendar',
    capabilities: ['event_management', 'scheduling', 'availability', 'reminders', 'recurring_events'],
    useCases: ['create_event', 'update_event', 'find_free_time', 'list_meetings', 'set_reminder', 'cancel_event'],
    triggerKeywords: ['schedule', 'meeting', 'calendar', 'event', 'availability', 'book', 'appointment', 'remind'],
    icon: '📅',
    category: 'scheduling',
    description: 'Manage calendar events, schedule meetings, and check availability'
  },

  GMAIL: {
    id: 'gmail',
    name: 'Gmail',
    capabilities: ['email_management', 'sending', 'searching', 'organizing', 'filtering', 'attachments'],
    useCases: ['send_email', 'search_inbox', 'read_email', 'manage_labels', 'forward_email', 'draft_email'],
    triggerKeywords: ['email', 'gmail', 'send', 'inbox', 'mail', 'compose', 'reply', 'forward'],
    icon: '📧',
    category: 'communication',
    description: 'Send, receive, and manage Gmail emails with attachments'
  },

  OUTLOOK: {
    id: 'outlook',
    name: 'Outlook',
    capabilities: ['email_management', 'calendar_integration', 'contacts', 'tasks'],
    useCases: ['send_email', 'manage_calendar', 'organize_contacts', 'track_tasks'],
    triggerKeywords: ['outlook', 'email', 'office', 'microsoft', 'exchange', 'corporate email'],
    icon: '📨',
    category: 'communication',
    description: 'Manage Outlook emails, calendar, and corporate communications'
  },

  GOOGLE_DOCS: {
    id: 'google_docs',
    name: 'Google Docs',
    capabilities: ['document_creation', 'editing', 'collaboration', 'formatting', 'sharing'],
    useCases: ['create_document', 'edit_document', 'share_document', 'format_text', 'collaborate'],
    triggerKeywords: ['document', 'doc', 'docs', 'write', 'report', 'draft', 'gdoc', 'google doc'],
    icon: '📄',
    category: 'documentation',
    description: 'Create, edit, and collaborate on Google Docs documents'
  },

  NOTION: {
    id: 'notion',
    name: 'Notion',
    capabilities: ['note_taking', 'database_management', 'project_management', 'wiki', 'collaboration'],
    useCases: ['create_page', 'update_database', 'organize_notes', 'create_wiki', 'track_project'],
    triggerKeywords: ['notion', 'note', 'page', 'database', 'wiki', 'organize', 'knowledge base'],
    icon: '📝',
    category: 'documentation',
    description: 'Manage notes, databases, and knowledge bases in Notion'
  },

  OBSIDIAN: {
    id: 'obsidian',
    name: 'Obsidian',
    capabilities: ['markdown_notes', 'linking', 'local_storage', 'graph_view', 'plugins'],
    useCases: ['create_note', 'link_notes', 'organize_vault', 'search_notes'],
    triggerKeywords: ['obsidian', 'note', 'markdown', 'vault', 'link', 'md', 'personal knowledge'],
    icon: '🔮',
    category: 'documentation',
    description: 'Create and manage interconnected markdown notes in Obsidian'
  },

  LOVABLE: {
    id: 'lovable',
    name: 'Lovable',
    capabilities: ['web_development', 'ai_assisted_coding', 'deployment', 'frontend'],
    useCases: ['build_website', 'create_component', 'deploy_app', 'generate_code'],
    triggerKeywords: ['lovable', 'website', 'web app', 'deploy', 'frontend', 'build', 'component'],
    icon: '💝',
    category: 'development',
    description: 'Build and deploy web applications with AI assistance'
  },

  CURSOR: {
    id: 'cursor',
    name: 'Cursor',
    capabilities: ['code_editing', 'ai_assistance', 'refactoring', 'debugging'],
    useCases: ['edit_code', 'refactor', 'debug', 'generate_function', 'explain_code'],
    triggerKeywords: ['cursor', 'code', 'edit', 'refactor', 'debug', 'programming', 'ide'],
    icon: '⌨️',
    category: 'development',
    description: 'AI-powered code editing and development in Cursor IDE'
  },

  CLAUDE: {
    id: 'claude',
    name: 'Claude',
    capabilities: ['conversation', 'analysis', 'writing', 'coding', 'research'],
    useCases: ['chat', 'analyze', 'write', 'code_assistance', 'research'],
    triggerKeywords: ['claude', 'ai', 'ask', 'analyze', 'explain', 'help', 'assistant'],
    icon: '🤖',
    category: 'research',
    description: 'General AI assistance for various tasks and conversations'
  },

  CHATGPT: {
    id: 'chatgpt',
    name: 'ChatGPT',
    capabilities: ['conversation', 'content_generation', 'problem_solving', 'learning'],
    useCases: ['chat', 'generate_content', 'solve_problem', 'learn', 'brainstorm'],
    triggerKeywords: ['chatgpt', 'gpt', 'openai', 'ai chat', 'generate', 'brainstorm'],
    icon: '💭',
    category: 'research',
    description: 'Conversational AI for content generation and problem-solving'
  },

  PERPLEXITY: {
    id: 'perplexity',
    name: 'Perplexity',
    capabilities: ['web_search', 'research', 'fact_checking', 'citations', 'real_time_info'],
    useCases: ['search_web', 'research_topic', 'fact_check', 'find_sources', 'get_latest_info'],
    triggerKeywords: ['perplexity', 'search', 'research', 'find', 'look up', 'fact', 'source', 'latest'],
    icon: '🔍',
    category: 'research',
    description: 'AI-powered search and research with citations and real-time information'
  },

  ZERODHA: {
    id: 'zerodha',
    name: 'Zerodha',
    capabilities: ['trading', 'portfolio_management', 'market_data', 'orders'],
    useCases: ['place_order', 'check_portfolio', 'get_market_data', 'track_holdings'],
    triggerKeywords: ['zerodha', 'trade', 'stock', 'portfolio', 'buy', 'sell', 'market', 'kite'],
    icon: '📈',
    category: 'financial',
    description: 'Manage stock trading, portfolio, and investments on Zerodha'
  },

  ZOMATO: {
    id: 'zomato',
    name: 'Zomato',
    capabilities: ['food_ordering', 'restaurant_discovery', 'reviews', 'delivery_tracking'],
    useCases: ['order_food', 'find_restaurant', 'check_reviews', 'track_delivery', 'browse_menu'],
    triggerKeywords: ['zomato', 'food', 'order', 'restaurant', 'delivery', 'eat', 'lunch', 'dinner', 'menu'],
    icon: '🍔',
    category: 'lifestyle',
    description: 'Order food, discover restaurants, and track deliveries on Zomato'
  },

  ALEXA: {
    id: 'alexa',
    name: 'Alexa',
    capabilities: ['voice_commands', 'smart_home', 'routines', 'music', 'information'],
    useCases: ['control_device', 'play_music', 'set_routine', 'get_info', 'timer', 'reminder'],
    triggerKeywords: ['alexa', 'smart home', 'device', 'play', 'music', 'routine', 'timer', 'alarm'],
    icon: '🔊',
    category: 'lifestyle',
    description: 'Control smart home devices and interact with Alexa voice assistant'
  },
};

/**
 * MCP Categories for organized grouping
 */
export const MCP_CATEGORIES = {
  COMMUNICATION: ['whatsapp', 'gmail', 'outlook'],
  SCHEDULING: ['google_calendar', 'alexa'],
  DOCUMENTATION: ['google_docs', 'notion', 'obsidian'],
  DEVELOPMENT: ['lovable', 'cursor', 'claude'],
  RESEARCH: ['perplexity', 'chatgpt', 'claude'],
  FINANCIAL: ['zerodha'],
  LIFESTYLE: ['zomato', 'alexa'],
};

/**
 * Get MCP tool by ID
 */
export function getMCPById(id) {
  return Object.values(MCP_TOOLS).find(tool => tool.id === id);
}

/**
 * Get all MCPs in a category
 */
export function getMCPsByCategory(category) {
  const ids = MCP_CATEGORIES[category.toUpperCase()] || [];
  return ids.map(id => getMCPById(id)).filter(Boolean);
}

/**
 * Search MCPs by keyword
 */
export function searchMCPs(keyword) {
  const lowerKeyword = keyword.toLowerCase();
  return Object.values(MCP_TOOLS).filter(tool =>
    tool.triggerKeywords.some(kw => kw.includes(lowerKeyword)) ||
    tool.name.toLowerCase().includes(lowerKeyword) ||
    tool.capabilities.some(cap => cap.includes(lowerKeyword))
  );
}

/**
 * Get MCP tool names as array
 */
export function getAllMCPNames() {
  return Object.values(MCP_TOOLS).map(tool => tool.name);
}

/**
 * Get MCP tool IDs as array
 */
export function getAllMCPIds() {
  return Object.values(MCP_TOOLS).map(tool => tool.id);
}
