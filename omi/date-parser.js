// date-parser.js
// Natural language date/time parsing utility for calendar events

const chrono = require("chrono-node");

/**
 * Parse natural language date/time expressions
 * Handles: "tomorrow", "today", "1 hour from now", "morning 10 to 11 am", etc.
 */
function parseNaturalDate(text, referenceDate = new Date()) {
  try {
    // Use chrono to parse the text
    const results = chrono.parse(text, referenceDate, {
      forwardDate: true, // If ambiguous, prefer future dates
    });

    if (!results || results.length === 0) {
      return null;
    }

    // Get the first (most confident) result
    const result = results[0];

    return {
      start: result.start.date(),
      end: result.end ? result.end.date() : null,
      text: result.text,
      confidence: result.quality || 0.5,
    };
  } catch (err) {
    console.error("Date parsing error:", err);
    return null;
  }
}

/**
 * Extract time range from text (e.g., "10 to 11 am", "1 hour from 10 am")
 */
function extractTimeRange(text, baseDate = new Date()) {
  const timePatterns = [
    // "10 to 11 am" or "10am to 11am"
    /(\d{1,2})\s*(?:am|pm|AM|PM)?\s+to\s+(\d{1,2})\s*(am|pm|AM|PM)?/i,
    // "from 10 to 11"
    /from\s+(\d{1,2})\s*(?:am|pm|AM|PM)?\s+to\s+(\d{1,2})\s*(am|pm|AM|PM)?/i,
    // "10-11 am" or "10:00-11:00"
    /(\d{1,2})(?::\d{2})?\s*(?:am|pm|AM|PM)?\s*[-–]\s*(\d{1,2})(?::\d{2})?\s*(am|pm|AM|PM)?/i,
    // "1 hour from 10 am" or "2 hours from now"
    /(\d+)\s+hour(?:s)?\s+from\s+(\d{1,2})\s*(am|pm|AM|PM)/i,
    // "morning 10 to 11" or "afternoon 2 to 3"
    /(morning|afternoon|evening|night)\s+(\d{1,2})\s+to\s+(\d{1,2})/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let startHour = parseInt(match[1] || match[2]);
      let endHour = parseInt(match[2] || match[3]);
      const period = (match[3] || match[4] || "").toLowerCase();

      // Handle 12-hour format
      if (period.includes("pm") && startHour < 12) startHour += 12;
      if (period.includes("pm") && endHour < 12) endHour += 12;
      if (period.includes("am") && startHour === 12) startHour = 0;
      if (period.includes("am") && endHour === 12) endHour = 0;

      // Handle morning/afternoon/evening
      if (
        match[1] &&
        ["afternoon", "evening", "night"].includes(match[1].toLowerCase())
      ) {
        if (startHour < 12) startHour += 12;
        if (endHour < 12) endHour += 12;
      }

      const start = new Date(baseDate);
      start.setHours(startHour, 0, 0, 0);

      const end = new Date(baseDate);
      end.setHours(endHour, 0, 0, 0);

      return { start, end };
    }
  }

  return null;
}

/**
 * Normalize date to ISO format for Google Calendar API
 */
function formatDateForCalendar(date, includeTime = true) {
  if (!date) return null;

  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  if (includeTime) {
    // ISO 8601 format with time
    return d.toISOString().slice(0, 19); // "2024-11-08T10:00:00"
  } else {
    // Date only
    return d.toISOString().slice(0, 10); // "2024-11-08"
  }
}

/**
 * Parse and normalize date/time from natural language text
 * Returns { start, end, summary } ready for calendar API
 */
function parseDateTimeForCalendar(text, referenceDate = new Date()) {
  // First, try to parse with chrono
  const parsed = parseNaturalDate(text, referenceDate);

  let start = parsed?.start || referenceDate;
  let end = parsed?.end || null;

  // Try to extract time range
  const timeRange = extractTimeRange(text, start);
  if (timeRange) {
    start = timeRange.start;
    end = timeRange.end;
  }

  // If no end time, default to 1 hour duration
  if (!end && parsed?.start) {
    end = new Date(start);
    end.setHours(end.getHours() + 1);
  }

  // Ensure end is after start
  if (end && end <= start) {
    end = new Date(start);
    end.setHours(end.getHours() + 1);
  }

  return {
    start: formatDateForCalendar(start),
    end: formatDateForCalendar(end),
    startDate: start,
    endDate: end,
  };
}

/**
 * Extract event summary/title from text (remove date/time parts)
 */
function extractEventSummary(text) {
  // Remove common date/time patterns
  let summary = text
    .replace(/\b(tomorrow|today|yesterday|next week|this week)\b/gi, "")
    .replace(
      /\b(\d{1,2})\s*(am|pm|AM|PM)\s+to\s+(\d{1,2})\s*(am|pm|AM|PM)\b/gi,
      ""
    )
    .replace(
      /\b(book|create|reserve|add|schedule)\s+(a\s+)?(slot|event|appointment|meeting)\b/gi,
      ""
    )
    .replace(/\b(at|on|for|from)\s+/gi, "")
    .replace(
      /\b(november|december|january|february|march|april|may|june|july|august|september|october)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
      ""
    )
    .replace(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(november|december|january|february|march|april|may|june|july|august|september|october)\b/gi,
      ""
    )
    .trim();

  // If summary is too short or empty, use a default
  if (!summary || summary.length < 3) {
    summary = "Appointment";
  }

  return summary;
}

module.exports = {
  parseNaturalDate,
  extractTimeRange,
  formatDateForCalendar,
  parseDateTimeForCalendar,
  extractEventSummary,
};
