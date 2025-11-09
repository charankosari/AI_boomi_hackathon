/**
 * Intent Recognition Utility
 * Analyzes user input to extract actionable intent for MCP routing
 * Implements the Intent Recognition Framework from the orchestration guide
 */

/**
 * Main intent recognition function
 * Parses user input and returns structured intent object
 */
export function recognizeIntent(input, conversationHistory = []) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input for intent recognition');
  }

  const normalizedInput = input.toLowerCase().trim();

  const intent = {
    raw: input,
    actionType: null,
    targetObject: null,
    context: {},
    constraints: {},
    keywords: extractKeywords(normalizedInput),
    confidence: 0,
  };

  // Extract components
  intent.actionType = extractActionType(normalizedInput);
  intent.targetObject = extractTargetObject(normalizedInput);
  intent.context = extractContext(normalizedInput, conversationHistory);
  intent.constraints = extractConstraints(normalizedInput);

  // Calculate confidence score
  intent.confidence = calculateIntentConfidence(intent);

  return intent;
}

/**
 * Extract action type from input
 * Maps to CRUD operations and common actions
 */
function extractActionType(input) {
  const actionPatterns = {
    create: [
      'create', 'make', 'new', 'add', 'write', 'draft', 'compose', 'generate',
      'build', 'set up', 'setup', 'start', 'begin', 'initialize'
    ],
    send: [
      'send', 'share', 'forward', 'deliver', 'dispatch', 'transmit', 'email',
      'message', 'text', 'ship'
    ],
    schedule: [
      'schedule', 'plan', 'book', 'set up', 'arrange', 'organize', 'calendar',
      'set', 'set a', 'set reminder'
    ],
    search: [
      'find', 'search', 'look for', 'check', 'show', 'get', 'fetch', 'retrieve',
      'lookup', 'what is', 'where is', 'when is', 'who is'
    ],
    read: [
      'read', 'view', 'see', 'open', 'display', 'show me', 'tell me about',
      'what does', 'explain'
    ],
    update: [
      'update', 'change', 'modify', 'edit', 'revise', 'alter', 'adjust',
      'correct', 'fix', 'amend'
    ],
    delete: [
      'delete', 'remove', 'cancel', 'clear', 'erase', 'drop', 'eliminate',
      'get rid of', 'unschedule'
    ],
    order: [
      'order', 'buy', 'purchase', 'get', 'request'
    ],
    play: [
      'play', 'start playing', 'listen to', 'watch'
    ],
    control: [
      'turn on', 'turn off', 'switch', 'activate', 'deactivate', 'control',
      'set', 'adjust'
    ],
  };

  // Check for matches
  for (const [action, keywords] of Object.entries(actionPatterns)) {
    if (keywords.some(keyword => input.includes(keyword))) {
      return action;
    }
  }

  // Default to 'search' if uncertain
  return 'search';
}

/**
 * Extract target object from input
 * Identifies what the action is being performed on
 */
function extractTargetObject(input) {
  const objectPatterns = {
    message: [
      'message', 'text', 'whatsapp', 'wa message', 'chat', 'dm', 'ping'
    ],
    email: [
      'email', 'mail', 'e-mail', 'gmail', 'outlook', 'letter'
    ],
    event: [
      'meeting', 'event', 'appointment', 'call', 'conference', 'session',
      'gathering', 'schedule', 'calendar event'
    ],
    document: [
      'document', 'doc', 'file', 'report', 'paper', 'proposal', 'gdoc',
      'google doc', 'word doc'
    ],
    note: [
      'note', 'notes', 'memo', 'reminder note', 'jot', 'notion page',
      'obsidian note'
    ],
    code: [
      'code', 'function', 'script', 'program', 'application', 'app',
      'website', 'component'
    ],
    order: [
      'food', 'meal', 'lunch', 'dinner', 'breakfast', 'restaurant',
      'cuisine', 'dish'
    ],
    trade: [
      'stock', 'share', 'equity', 'trade', 'portfolio', 'investment'
    ],
    device: [
      'light', 'device', 'speaker', 'smart home', 'alexa', 'thermostat'
    ],
    music: [
      'music', 'song', 'playlist', 'album', 'track'
    ],
    research: [
      'research', 'information', 'answer', 'question', 'topic', 'data'
    ],
  };

  // Check for matches
  for (const [object, keywords] of Object.entries(objectPatterns)) {
    if (keywords.some(keyword => input.includes(keyword))) {
      return object;
    }
  }

  // Default to 'information' if uncertain
  return 'information';
}

/**
 * Extract context from input
 * Identifies temporal, personal, and topical context
 */
function extractContext(input, conversationHistory = []) {
  return {
    dates: extractDates(input),
    times: extractTimes(input),
    people: extractPeople(input),
    topics: extractTopics(input),
    urgency: extractUrgency(input),
    location: extractLocation(input),
    previousContext: extractPreviousContext(conversationHistory),
  };
}

/**
 * Extract date references from input
 */
function extractDates(input) {
  const dates = [];
  const datePatterns = {
    today: /today/i,
    tomorrow: /tomorrow/i,
    yesterday: /yesterday/i,
    nextWeek: /next week/i,
    thisWeek: /this week/i,
    specific: /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})\b/,
    dayOfWeek: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    relativeDay: /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  };

  for (const [key, pattern] of Object.entries(datePatterns)) {
    const match = input.match(pattern);
    if (match) {
      dates.push({ type: key, value: match[0] });
    }
  }

  return dates;
}

/**
 * Extract time references from input
 */
function extractTimes(input) {
  const times = [];
  const timePatterns = {
    specific: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i,
    relative: /\b(in|after)\s+(\d+)\s+(hours?|minutes?|mins?)\b/i,
    morning: /\b(morning|am)\b/i,
    afternoon: /\b(afternoon|noon)\b/i,
    evening: /\b(evening|pm)\b/i,
    night: /\bnight\b/i,
  };

  for (const [key, pattern] of Object.entries(timePatterns)) {
    const match = input.match(pattern);
    if (match) {
      times.push({ type: key, value: match[0] });
    }
  }

  return times;
}

/**
 * Extract people/contacts from input
 */
function extractPeople(input) {
  const people = [];

  // Look for names (capitalized words)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const matches = input.match(namePattern);

  if (matches) {
    // Filter out common words that aren't names
    const commonWords = ['I', 'The', 'A', 'An', 'This', 'That', 'Gmail', 'WhatsApp', 'Google', 'Calendar'];
    matches.forEach(name => {
      if (!commonWords.includes(name)) {
        people.push(name);
      }
    });
  }

  // Look for contact references
  const contactPatterns = [
    /\bto\s+([a-z]+)\b/i,
    /\bwith\s+([a-z]+)\b/i,
    /\b([a-z]+)'s\b/i,
  ];

  contactPatterns.forEach(pattern => {
    const match = input.match(pattern);
    if (match && match[1]) {
      people.push(match[1]);
    }
  });

  return [...new Set(people)]; // Remove duplicates
}

/**
 * Extract topics/subjects from input
 */
function extractTopics(input) {
  const topics = [];

  // Look for quoted text (often subjects)
  const quotedPattern = /"([^"]+)"|'([^']+)'/g;
  let match;
  while ((match = quotedPattern.exec(input)) !== null) {
    topics.push(match[1] || match[2]);
  }

  // Look for "about X" patterns
  const aboutPattern = /\babout\s+([a-zA-Z\s]+?)(?:\s+to|\s+with|\s+for|$)/i;
  const aboutMatch = input.match(aboutPattern);
  if (aboutMatch) {
    topics.push(aboutMatch[1].trim());
  }

  return topics;
}

/**
 * Extract urgency level from input
 */
function extractUrgency(input) {
  const urgencyPatterns = {
    high: ['urgent', 'asap', 'immediately', 'right now', 'emergency', 'critical', 'important'],
    medium: ['soon', 'when possible', 'today', 'this week'],
    low: ['later', 'whenever', 'no rush', 'eventually'],
  };

  for (const [level, keywords] of Object.entries(urgencyPatterns)) {
    if (keywords.some(keyword => input.includes(keyword))) {
      return level;
    }
  }

  return 'normal';
}

/**
 * Extract location references from input
 */
function extractLocation(input) {
  const locations = [];

  // Look for "at X" or "in X" patterns
  const locationPattern = /\b(?:at|in)\s+([A-Z][a-zA-Z\s]+?)(?:\s+on|\s+at|\s+with|$)/;
  const match = input.match(locationPattern);

  if (match) {
    locations.push(match[1].trim());
  }

  return locations;
}

/**
 * Extract context from previous conversation
 */
function extractPreviousContext(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    return {};
  }

  // Get last few messages for context
  const recentMessages = conversationHistory.slice(-3);

  return {
    hasContext: true,
    recentTopics: recentMessages.map(msg => msg.content).join(' '),
    messageCount: conversationHistory.length,
  };
}

/**
 * Extract constraints from input
 * Time limits, preferences, conditions
 */
function extractConstraints(input) {
  const constraints = {};

  // Time constraints
  if (input.match(/\b(before|by|until)\s+/i)) {
    constraints.deadline = true;
  }

  // Preference constraints
  if (input.match(/\b(prefer|preferably|ideally|better)\b/i)) {
    constraints.hasPreference = true;
  }

  // Condition constraints
  if (input.match(/\b(if|when|unless|provided)\b/i)) {
    constraints.conditional = true;
  }

  // Budget constraints
  if (input.match(/\b(under|below|maximum|max|budget)\s*\$?\d+/i)) {
    constraints.budget = true;
  }

  return constraints;
}

/**
 * Extract keywords from input
 */
function extractKeywords(input) {
  // Remove common stop words
  const stopWords = [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'i', 'you', 'he', 'she',
    'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
  ];

  const words = input.split(/\s+/);
  return words.filter(word =>
    word.length > 2 && !stopWords.includes(word)
  );
}

/**
 * Calculate confidence score for the intent
 * Based on how well we could extract components
 */
function calculateIntentConfidence(intent) {
  let score = 0;
  let maxScore = 0;

  // Action type confidence
  maxScore += 30;
  if (intent.actionType) {
    score += 30;
  }

  // Target object confidence
  maxScore += 30;
  if (intent.targetObject) {
    score += 30;
  }

  // Context confidence
  maxScore += 20;
  if (intent.context.dates && intent.context.dates.length > 0) score += 5;
  if (intent.context.times && intent.context.times.length > 0) score += 5;
  if (intent.context.people && intent.context.people.length > 0) score += 5;
  if (intent.context.topics && intent.context.topics.length > 0) score += 5;

  // Keywords confidence
  maxScore += 20;
  if (intent.keywords && intent.keywords.length > 0) {
    score += Math.min(20, intent.keywords.length * 5);
  }

  return Math.round((score / maxScore) * 100);
}

/**
 * Get a human-readable description of the intent
 */
export function describeIntent(intent) {
  const { actionType, targetObject, context } = intent;

  let description = `${actionType || 'perform action on'} ${targetObject || 'item'}`;

  if (context.people && context.people.length > 0) {
    description += ` involving ${context.people.join(', ')}`;
  }

  if (context.dates && context.dates.length > 0) {
    description += ` on ${context.dates.map(d => d.value).join(', ')}`;
  }

  if (context.topics && context.topics.length > 0) {
    description += ` about ${context.topics.join(', ')}`;
  }

  return description;
}

export default recognizeIntent;
