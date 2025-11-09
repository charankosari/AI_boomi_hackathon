// db.mongo.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    session_uid: { type: String, index: true },
    role: {
      type: String,
      enum: ["user", "assistant", "system", "webhook"],
      required: true,
    },
    text: { type: String },
    provider: { type: String },
    model: { type: String },
    raw: {}, // flexible JSON
    // optional TTL to auto-delete after N days (uncomment next two lines)
    // created_at: { type: Date, default: Date.now, index: true },
    // expireAt: { type: Date, index: { expireAfterSeconds: 0 } }, // set a date to trigger TTL
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Schema to track MCP tool actions
const ToolActionSchema = new mongoose.Schema(
  {
    session_uid: { type: String, index: true },
    tool_name: { type: String, required: true, index: true },
    mcp_name: { type: String, required: true, index: true },
    tool_args: { type: Object, default: {} },
    tool_result: { type: Object, default: {} },
    result_summary: { type: String }, // AI-generated summary of the tool result
    success: { type: Boolean, default: true },
    error_message: { type: String },
    user_message: { type: String }, // The user message that triggered this tool
    created_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const SessionSchema = new mongoose.Schema(
  {
    uid: { type: String, unique: true, index: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Schema to store user tool preferences (enable/disable MCP tools)
const UserPreferencesSchema = new mongoose.Schema(
  {
    session_uid: { type: String, unique: true, index: true, required: true },
    // MCP tool preferences - true = enabled, false = disabled
    googlecalendar: { type: Boolean, default: true },
    googledocs: { type: Boolean, default: true },
    googleslides: { type: Boolean, default: true },
    googlepresentation: { type: Boolean, default: true },
    gmail: { type: Boolean, default: true },
    notion: { type: Boolean, default: true },
    zomato: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: true },
    // Add more tools as needed
    filesystem: { type: Boolean, default: true },
    fetch: { type: Boolean, default: true },
    github: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Message = mongoose.model("Message", MessageSchema);
const Session = mongoose.model("Session", SessionSchema);
const ToolAction = mongoose.model("ToolAction", ToolActionSchema);
const UserPreferences = mongoose.model(
  "UserPreferences",
  UserPreferencesSchema
);

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI in .env");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || "omi" });
  console.log("✅ Mongo connected");
}

async function upsertSession(uid) {
  if (!uid) return;
  await Session.updateOne({ uid }, { $setOnInsert: { uid } }, { upsert: true });
}

async function saveMessage(doc) {
  await Message.create(doc);
}

async function listMessages(uid, limit = 50) {
  const query = uid ? { session_uid: uid } : {};
  return Message.find(query).sort({ created_at: -1 }).limit(limit).lean();
}

async function saveToolAction(doc) {
  await ToolAction.create(doc);
}

async function listToolActions(uid, limit = 100) {
  return ToolAction.find({ session_uid: uid })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
}

async function listAllToolActions(limit = 200) {
  return ToolAction.find({}).sort({ created_at: -1 }).limit(limit).lean();
}

// User Preferences functions
async function getUserPreferences(session_uid) {
  let prefs = await UserPreferences.findOne({ session_uid }).lean();
  if (!prefs) {
    // Create default preferences if not exists
    prefs = await UserPreferences.create({
      session_uid,
      // All tools enabled by default
      googlecalendar: true,
      googledocs: true,
      googleslides: true,
      googlepresentation: true,
      gmail: true,
      notion: true,
      zomato: true,
      whatsapp: true,
      filesystem: true,
      fetch: true,
      github: true,
    });
    return prefs.toObject();
  }
  return prefs;
}

async function updateUserPreferences(session_uid, preferences) {
  const prefs = await UserPreferences.findOneAndUpdate(
    { session_uid },
    { $set: preferences },
    { upsert: true, new: true }
  );
  return prefs.toObject();
}

async function isToolEnabled(session_uid, toolName) {
  const prefs = await getUserPreferences(session_uid);
  // Normalize tool name to match schema field names
  const normalizedName = toolName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Map common variations to schema field names
  const toolMap = {
    googlecalendar: "googlecalendar",
    "google-calendar": "googlecalendar",
    calendar: "googlecalendar",
    googledocs: "googledocs",
    "google-docs": "googledocs",
    "google-doc": "googledocs",
    docs: "googledocs",
    googleslides: "googleslides",
    "google-slides": "googleslides",
    "google-presentation": "googleslides",
    googlepresentation: "googleslides",
    slides: "googleslides",
    presentation: "googleslides",
    gmail: "gmail",
    "google-gmail": "gmail",
    notion: "notion",
    zomato: "zomato",
    whatsapp: "whatsapp",
    filesystem: "filesystem",
    fetch: "fetch",
    github: "github",
  };

  const fieldName = toolMap[normalizedName] || normalizedName;
  return prefs[fieldName] !== false; // Default to true if not set
}

module.exports = {
  connectMongo,
  upsertSession,
  saveMessage,
  listMessages,
  saveToolAction,
  listToolActions,
  listAllToolActions,
  getUserPreferences,
  updateUserPreferences,
  isToolEnabled,
};
