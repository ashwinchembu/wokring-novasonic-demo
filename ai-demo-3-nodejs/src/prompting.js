"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationSession = exports.REQUIRED_SLOTS = exports.OUTPUT_JSON_SCHEMA = exports.HCP_NAME_TO_ID_MAP = exports.AGENT_683_SYSTEM_PROMPT = void 0;
exports.lookupHcpId = lookupHcpId;
exports.getHcpNameFromPartial = getHcpNameFromPartial;
exports.validateHcpName = validateHcpName;
exports.getAllHcpNames = getAllHcpNames;
exports.formatJsonOutput = formatJsonOutput;
exports.getNextQuestion = getNextQuestion;
exports.getOrCreateSession = getOrCreateSession;
exports.getSession = getSession;
exports.deleteSession = deleteSession;
exports.listActiveSessions = listActiveSessions;
/**
 * Prompting & Conversation Policy Module
 * Implements Agent-683 spec for CRM call recording and slot-filling
 */
const logger_1 = __importDefault(require("./logger"));

// Agent-683 System Prompt (Verbatim)

exports.AGENT_683_SYSTEM_PROMPT = `You are an AI Assistant for a Sales Rep in their CRM platform which is Veeva CRM. You are helping the field sales person execute several tasks like summarizing the interaction with the HCPs or creating a follow-up task after the interaction. For an interaction to be recorded, the HCP name , a date and time , a Product is needed, any additional information is summarized into Call notes.

CONVERSATION HISTORY:
- You have access to the full conversation history in this session. When users ask about previous conversations or what was discussed, reference the actual conversation history you can see.
- DO NOT use lookupHcpTool to search for conversation history or previous discussions.
- If a user asks "what was my last conversation about" or similar, review the conversation history and summarize what was discussed.

TOOL USAGE POLICY:
- When the user asks whether an HCP exists or mentions a doctor's name, FIRST invoke the lookupHcpTool with the properly formatted name.
- IMPORTANT: Do NOT use lookupHcpTool for general questions, conversation history, or non-HCP queries.
- IMPORTANT: When parsing names, understand natural speech patterns:
  * "with a k" or "with a K" means the first name starts with K (e.g., "Karina with a k" = "Karina", not "Carolina")
  * "with a c" means the first name starts with C
  * Remove phrases like "with a k", "with a c", "spelled with" from the actual search
  * Convert "doctor" to "Dr." format (e.g., "doctor john smith" → search for "Dr. John Smith")
  * Use proper capitalization for names
- If the tool returns found=true, use the returned hcp_id and name to populate the interaction record.
- If the tool returns found=false, politely inform the user that the HCP was not found and ask them to verify the name or provide additional details.
- When asked about the current date or time, use the getDateTool to provide accurate information.
- Always wait for tool results before proceeding with the conversation.

PERSISTENCE WORKFLOW:
- After slot-filling is complete and you have read back the summary to the user for confirmation, proceed with the following workflow:
  1. Call insertCallTool with the final JSON record to persist the call to the database.
  2. If the JSON includes a follow-up task (call_follow_up_task.task_type is present), call createFollowUpTaskTool after persistence.
  3. Always run assistant text through guardrails before emitting (this is handled automatically by the system).
- Only perform these tool calls AFTER the user confirms the summary. Do not persist incomplete or unconfirmed data.
- NOTE: N8N event emission is currently disabled. Do NOT call emitN8nEventTool.

When a user provides an HCP name, use the lookupHcpTool to verify the HCP exists and get their ID. In case any of the required information is missing please ask the user for that information using voice conversations until all of the information is complete. Once the user provides all information, summarize it back to them and format it as JSON.

Put all the information into JSON format like as below: { "call_channel": "In-person", "discussion_topic": "", "status": "Saved_vod", "account": "", "id": "", "adverse_event": false, "adverse_event_details": null, "noncompliance_event": false, "noncompliance_description": "", "call_notes": "", "call_date": null, "call_time": null, "product": "", "call_follow_up_task": { "task_type": "", "description": "", "due_date": "", "assigned_to": "" } }`;

// HCP Name to ID Mapping

exports.HCP_NAME_TO_ID_MAP = {
    'Dr. William Harper': '0013K000013ez2RQAQ',
    'Dr. Susan Carter': '0013K000013ez2SQAQ',
    'Dr. James Lawson': '0013K000013ez2TQAQ',
    'Dr. Emily Hughes': '0013K000013ez2UQAQ',
    'Dr. Richard Thompson': '0013K000013ez2VQAQ',
    'Dr. Sarah Phillips': '0013K000013ez2WQAQ',
    'Dr. John Anderson': '0013K000013ez2XQAQ',
    'Dr. Lisa Collins': '0013K000013ez2YQAQ',
    'Dr. David Harris': '0013K000013ez2ZQAQ',
    'Dr. Amy Scott': '0013K000013ez2aQAA',
    'Dr. Olivia Wells': '0013K000013ez2bQAA',
    'Dr. Benjamin Stone': '0013K000013ez2cQAA',
    'Dr. Grace Mitchell': '0013K000013ez2dQAA',
    'Dr. Lucas Chang': '0013K000013ez2eQAA',
    'Dr. Sophia Patel': '0013K000013ez2fQAA',
    'Dr. Nathan Rivera': '0013K000013ez2gQAA',
    'Dr. Karina Soto': '0013K000013ez2hQAA',
};
// Case-insensitive lookup
const HCP_NAME_TO_ID_MAP_LOWER = {};
for (const [name, id] of Object.entries(exports.HCP_NAME_TO_ID_MAP)) {
    HCP_NAME_TO_ID_MAP_LOWER[name.toLowerCase()] = id;
}

// JSON Schema Template

exports.OUTPUT_JSON_SCHEMA = {
    call_channel: 'In-person',
    discussion_topic: '',
    status: 'Saved_vod',
    account: '',
    id: '',
    adverse_event: false,
    adverse_event_details: '',
    noncompliance_event: false,
    noncompliance_description: '',
    call_notes: '',
    call_date: '',
    call_time: '',
    product: '',
    call_follow_up_task: {
        task_type: '',
        description: '',
        due_date: '',
        assigned_to: '',
    },
};

// Required Slots

exports.REQUIRED_SLOTS = ['hcp_name', 'date', 'time', 'product'];
class ConversationSession {
    sessionId;
    slots;
    transcript;
    guardrailFlags;
    confirmedSlots;
    summaryReadBack;
    outputJson;
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.slots = {
            hcp_name: undefined,
            hcp_id: undefined,
            date: undefined,
            time: undefined,
            product: undefined,
            call_notes: '',
            discussion_topic: '',
            call_follow_up_task: {
                task_type: '',
                description: '',
                due_date: '',
                assigned_to: '',
            },
            adverse_event: false,
            adverse_event_details: null,
            noncompliance_event: false,
            noncompliance_description: '',
        };
        this.transcript = [];
        this.guardrailFlags = {
            adverse_event_detected: false,
            noncompliance_detected: false,
            profanity_detected: false,
        };
        this.confirmedSlots = new Set();
        this.summaryReadBack = false;
        this.outputJson = undefined;
        logger_1.default.info(`Initialized conversation session: ${sessionId}`);
    }
    addTurn(role, content) {
        const turn = {
            role,
            content,
            timestamp: new Date().toISOString(),
        };
        this.transcript.push(turn);
        logger_1.default.debug(`Added turn: ${role} - ${content.substring(0, 50)}...`);
    }
    setSlot(slotName, value) {
        if (slotName in this.slots) {
            this.slots[slotName] = value;
            logger_1.default.info(`Set slot '${slotName}': ${value}`);
        }
        else {
            logger_1.default.warn(`Attempted to set unknown slot: ${slotName}`);
        }
    }
    getSlot(slotName) {
        return this.slots[slotName];
    }
    confirmSlot(slotName) {
        this.confirmedSlots.add(slotName);
        logger_1.default.info(`Confirmed slot: ${slotName}`);
    }
    isSlotFilled(slotName) {
        const value = this.slots[slotName];
        return value !== undefined && value !== null && value !== '';
    }
    getMissingRequiredSlots() {
        const missing = [];
        for (const slot of exports.REQUIRED_SLOTS) {
            if (!this.isSlotFilled(slot)) {
                missing.push(slot);
            }
        }
        return missing;
    }
    allRequiredSlotsFilled() {
        return this.getMissingRequiredSlots().length === 0;
    }
    setGuardrailFlag(flagName, value) {
        this.guardrailFlags[flagName] = value;
        logger_1.default.warn(`Guardrail flag set: ${flagName} = ${value}`);
    }
    generateSummary() {
        const hcpName = this.slots.hcp_name || 'Unknown';
        const hcpId = this.slots.hcp_id || 'Unknown';
        const date = this.slots.date || 'Unknown';
        const time = this.slots.time || 'Unknown';
        const product = this.slots.product || 'Unknown';
        const callNotes = this.slots.call_notes || '';
        let summary = `Let me confirm the details of your call recording. You met with ${hcpName}, whose ID is ${hcpId}. The meeting was on ${date} at ${time}. You discussed ${product}. `;
        if (callNotes) {
            summary += `Your call notes mention: ${callNotes}. `;
        }
        const taskType = this.slots.call_follow_up_task?.task_type;
        if (taskType) {
            const taskDesc = this.slots.call_follow_up_task?.description || '';
            summary += `You have a follow-up task: ${taskType}. ${taskDesc}. `;
        }
        summary += 'Is this correct?';
        return summary;
    }
    generateOutputJson() {
        const output = { ...exports.OUTPUT_JSON_SCHEMA };
        output.account = this.slots.hcp_name || '';
        output.id = this.slots.hcp_id || '';
        output.call_date = this.slots.date || '';
        output.call_time = this.slots.time || '';
        output.product = this.slots.product || '';
        output.call_notes = this.slots.call_notes || '';
        output.discussion_topic = this.slots.discussion_topic || '';
        output.adverse_event = this.slots.adverse_event || false;
        output.adverse_event_details = this.slots.adverse_event_details || '';
        output.noncompliance_event = this.slots.noncompliance_event || false;
        output.noncompliance_description = this.slots.noncompliance_description || '';
        if (this.slots.call_follow_up_task) {
            output.call_follow_up_task = { ...this.slots.call_follow_up_task };
        }
        this.outputJson = output;
        logger_1.default.info(`Generated output JSON for session ${this.sessionId}`);
        return output;
    }
    toDict() {
        return {
            sessionId: this.sessionId,
            slots: this.slots,
            transcript: this.transcript,
            guardrailFlags: this.guardrailFlags,
            confirmedSlots: Array.from(this.confirmedSlots),
            summaryReadBack: this.summaryReadBack,
            missingSlots: this.getMissingRequiredSlots(),
            allSlotsFilled: this.allRequiredSlotsFilled(),
            outputJson: this.outputJson,
        };
    }
}
exports.ConversationSession = ConversationSession;

// Helper Functions

function lookupHcpId(hcpName) {
    // Exact match (case-insensitive)
    const hcpId = HCP_NAME_TO_ID_MAP_LOWER[hcpName.toLowerCase()];
    if (hcpId) {
        logger_1.default.info(`Found exact match for HCP: ${hcpName} -> ${hcpId}`);
        return hcpId;
    }
    // Partial match
    for (const [name, id] of Object.entries(exports.HCP_NAME_TO_ID_MAP)) {
        if (hcpName.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(hcpName.toLowerCase())) {
            logger_1.default.info(`Found partial match for HCP: ${hcpName} -> ${name} (${id})`);
            return id;
        }
    }
    logger_1.default.warn(`No HCP ID found for: ${hcpName}`);
    return undefined;
}
function getHcpNameFromPartial(partialName) {
    // Exact match
    if (partialName in exports.HCP_NAME_TO_ID_MAP) {
        return partialName;
    }
    // Case-insensitive exact match
    for (const name of Object.keys(exports.HCP_NAME_TO_ID_MAP)) {
        if (name.toLowerCase() === partialName.toLowerCase()) {
            return name;
        }
    }
    // Partial match
    for (const name of Object.keys(exports.HCP_NAME_TO_ID_MAP)) {
        if (partialName.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(partialName.toLowerCase())) {
            return name;
        }
    }
    return undefined;
}
function validateHcpName(hcpName) {
    const fullName = getHcpNameFromPartial(hcpName);
    if (fullName) {
        const hcpId = lookupHcpId(fullName);
        return { isValid: true, fullName, hcpId };
    }
    return { isValid: false };
}
function getAllHcpNames() {
    return Object.keys(exports.HCP_NAME_TO_ID_MAP);
}
function formatJsonOutput(output, pretty = true) {
    return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}
function getNextQuestion(session) {
    const missingSlots = session.getMissingRequiredSlots();
    if (missingSlots.length === 0) {
        return undefined;
    }
    const slotQuestions = {
        hcp_name: 'Could you please tell me the name of the healthcare professional you met with?',
        date: 'What date did this meeting take place?',
        time: 'What time was the meeting?',
        product: 'Which product did you discuss during the meeting?',
    };
    for (const slot of exports.REQUIRED_SLOTS) {
        if (missingSlots.includes(slot)) {
            return slotQuestions[slot] || `Could you please provide the ${slot}?`;
        }
    }
    return undefined;
}

// Session Management (In-Memory Store)

const sessions = new Map();
function getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new ConversationSession(sessionId));
    }
    return sessions.get(sessionId);
}
function getSession(sessionId) {
    return sessions.get(sessionId);
}
function deleteSession(sessionId) {
    if (sessions.has(sessionId)) {
        sessions.delete(sessionId);
        logger_1.default.info(`Deleted session: ${sessionId}`);
    }
}
function listActiveSessions() {
    return Array.from(sessions.keys());
}
//# sourceMappingURL=prompting.js.map