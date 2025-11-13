/**
 * Prompting & Conversation Policy Module
 * Implements Agent-683 spec for CRM call recording and slot-filling
 */
import logger from './logger';

// ============================================================================
// Agent-683 System Prompt (Verbatim)
// ============================================================================

export const AGENT_683_SYSTEM_PROMPT = `You are an AI Assistant for a Sales Rep in their CRM platform which is Veeva CRM. You are helping the field sales person execute several tasks like summarizing the interaction with the HCPs or creating a follow-up task after the interaction. For an interaction to be recorded, the HCP name , a date and time , a Product is needed, any additional information is summarized into Call notes.

TOOL USAGE POLICY:
- When the user asks whether an HCP exists or mentions a doctor's name, FIRST invoke the lookupHcpTool with the properly formatted name.
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

// ============================================================================
// HCP Name to ID Mapping
// ============================================================================

export const HCP_NAME_TO_ID_MAP: Record<string, string> = {
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
const HCP_NAME_TO_ID_MAP_LOWER: Record<string, string> = {};
for (const [name, id] of Object.entries(HCP_NAME_TO_ID_MAP)) {
  HCP_NAME_TO_ID_MAP_LOWER[name.toLowerCase()] = id;
}

// ============================================================================
// JSON Schema Template
// ============================================================================

export const OUTPUT_JSON_SCHEMA = {
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

// ============================================================================
// Required Slots
// ============================================================================

export const REQUIRED_SLOTS = ['hcp_name', 'date', 'time', 'product'];

// ============================================================================
// Session State Class
// ============================================================================

export interface ConversationTurn {
  role: string;
  content: string;
  timestamp: string;
}

export interface GuardrailFlags {
  adverse_event_detected: boolean;
  noncompliance_detected: boolean;
  profanity_detected: boolean;
}

export interface CallFollowUpTask {
  task_type: string;
  description: string;
  due_date: string;
  assigned_to: string;
}

export interface ConversationSlots {
  hcp_name?: string;
  hcp_id?: string;
  date?: string;
  time?: string;
  product?: string;
  call_notes?: string;
  discussion_topic?: string;
  call_follow_up_task?: CallFollowUpTask;
  adverse_event?: boolean;
  adverse_event_details?: string | null;
  noncompliance_event?: boolean;
  noncompliance_description?: string;
}

export class ConversationSession {
  public sessionId: string;
  public slots: ConversationSlots;
  public transcript: ConversationTurn[];
  public guardrailFlags: GuardrailFlags;
  public confirmedSlots: Set<string>;
  public summaryReadBack: boolean;
  public outputJson?: Record<string, unknown>;

  constructor(sessionId: string) {
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

    logger.info(`Initialized conversation session: ${sessionId}`);
  }

  addTurn(role: string, content: string): void {
    const turn: ConversationTurn = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.transcript.push(turn);
    logger.debug(`Added turn: ${role} - ${content.substring(0, 50)}...`);
  }

  setSlot(slotName: string, value: unknown): void {
    if (slotName in this.slots) {
      (this.slots as Record<string, unknown>)[slotName] = value;
      logger.info(`Set slot '${slotName}': ${value}`);
    } else {
      logger.warn(`Attempted to set unknown slot: ${slotName}`);
    }
  }

  getSlot(slotName: string): unknown {
    return (this.slots as Record<string, unknown>)[slotName];
  }

  confirmSlot(slotName: string): void {
    this.confirmedSlots.add(slotName);
    logger.info(`Confirmed slot: ${slotName}`);
  }

  isSlotFilled(slotName: string): boolean {
    const value = (this.slots as Record<string, unknown>)[slotName];
    return value !== undefined && value !== null && value !== '';
  }

  getMissingRequiredSlots(): string[] {
    const missing: string[] = [];
    for (const slot of REQUIRED_SLOTS) {
      if (!this.isSlotFilled(slot)) {
        missing.push(slot);
      }
    }
    return missing;
  }

  allRequiredSlotsFilled(): boolean {
    return this.getMissingRequiredSlots().length === 0;
  }

  setGuardrailFlag(flagName: keyof GuardrailFlags, value: boolean): void {
    this.guardrailFlags[flagName] = value;
    logger.warn(`Guardrail flag set: ${flagName} = ${value}`);
  }

  generateSummary(): string {
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

  generateOutputJson(): Record<string, unknown> {
    const output = { ...OUTPUT_JSON_SCHEMA };

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
    logger.info(`Generated output JSON for session ${this.sessionId}`);
    return output;
  }

  toDict(): Record<string, unknown> {
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

// ============================================================================
// Helper Functions
// ============================================================================

export function lookupHcpId(hcpName: string): string | undefined {
  // Exact match (case-insensitive)
  const hcpId = HCP_NAME_TO_ID_MAP_LOWER[hcpName.toLowerCase()];
  if (hcpId) {
    logger.info(`Found exact match for HCP: ${hcpName} -> ${hcpId}`);
    return hcpId;
  }

  // Partial match
  for (const [name, id] of Object.entries(HCP_NAME_TO_ID_MAP)) {
    if (
      hcpName.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(hcpName.toLowerCase())
    ) {
      logger.info(`Found partial match for HCP: ${hcpName} -> ${name} (${id})`);
      return id;
    }
  }

  logger.warn(`No HCP ID found for: ${hcpName}`);
  return undefined;
}

export function getHcpNameFromPartial(partialName: string): string | undefined {
  // Exact match
  if (partialName in HCP_NAME_TO_ID_MAP) {
    return partialName;
  }

  // Case-insensitive exact match
  for (const name of Object.keys(HCP_NAME_TO_ID_MAP)) {
    if (name.toLowerCase() === partialName.toLowerCase()) {
      return name;
    }
  }

  // Partial match
  for (const name of Object.keys(HCP_NAME_TO_ID_MAP)) {
    if (
      partialName.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(partialName.toLowerCase())
    ) {
      return name;
    }
  }

  return undefined;
}

export function validateHcpName(
  hcpName: string
): { isValid: boolean; fullName?: string; hcpId?: string } {
  const fullName = getHcpNameFromPartial(hcpName);
  if (fullName) {
    const hcpId = lookupHcpId(fullName);
    return { isValid: true, fullName, hcpId };
  }
  return { isValid: false };
}

export function getAllHcpNames(): string[] {
  return Object.keys(HCP_NAME_TO_ID_MAP);
}

export function formatJsonOutput(output: Record<string, unknown>, pretty = true): string {
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

export function getNextQuestion(session: ConversationSession): string | undefined {
  const missingSlots = session.getMissingRequiredSlots();

  if (missingSlots.length === 0) {
    return undefined;
  }

  const slotQuestions: Record<string, string> = {
    hcp_name: 'Could you please tell me the name of the healthcare professional you met with?',
    date: 'What date did this meeting take place?',
    time: 'What time was the meeting?',
    product: 'Which product did you discuss during the meeting?',
  };

  for (const slot of REQUIRED_SLOTS) {
    if (missingSlots.includes(slot)) {
      return slotQuestions[slot] || `Could you please provide the ${slot}?`;
    }
  }

  return undefined;
}

// ============================================================================
// Session Management (In-Memory Store)
// ============================================================================

const sessions = new Map<string, ConversationSession>();

export function getOrCreateSession(sessionId: string): ConversationSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new ConversationSession(sessionId));
  }
  return sessions.get(sessionId)!;
}

export function getSession(sessionId: string): ConversationSession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    logger.info(`Deleted session: ${sessionId}`);
  }
}

export function listActiveSessions(): string[] {
  return Array.from(sessions.keys());
}

