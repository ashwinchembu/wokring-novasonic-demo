/**
 * Call Recording Prompts
 * Ported from Lambda implementation
 */

import moment from 'moment';

/**
 * Generate the initial call recording prompt for first-pass analysis
 */
export function generateCallRecordingPrompt(inputText: string): string {
  const today = moment(new Date()).format('YYYY-MM-DD');
  const tomorrow = moment(new Date()).add(1, 'days').format('YYYY-MM-DD');
  const yesterday = moment(new Date()).subtract(1, 'days').format('YYYY-MM-DD');

  return `You are an AI assistant analyzing call transcripts between Sales Rep and healthcare professionals. You have to extract structured details from a call recording with a health care professional.

Your task is to extract the following information from the conversation:

a) Date of the call (format: YYYY-MM-DD) - 
   Remember If the call mentions words like "today", "tomorrow", or "yesterday", resolve them based on the date: **${today}**

Examples:
- "today" → ${today}
- "tomorrow" → ${tomorrow}
- "yesterday" → ${yesterday}

b) Time of the call (24-hour format: HH:MM:SS)
c) Account Name - HCP Name
d) Call Channel ----> Mode of Interaction. Choose from the list "In Person", "Video", "Virtual", "Phone". Default the value of this field automatically to 'In-person' if information is not provided by the user.'
e) Discussion Topic ----> Heading of the discussion. Not more than 5-6 words.
f) Product Name ----> Name of the product/products discussed in the call. Can be multiple.
g) Call Notes ----> Notes taken in the call. Use summarizer to create a brief summary of the call.
h) Adverse Event Details
i) Non Compliance Description
j) Call Follow Up Task ----> Follow-up Task mentioned in the prompt. Summarize it in proper meaningful way.
k) Status ----> Status of the call. Default is 'Saved'
l) Activity ----> If there is any activity tracked.
m) Attendees ----> If other person's are also there in the prompt. Default will be "".
n) Follow Up Due Date -----> Check if Follow-Up Assigned To and Follow Up Task is present. A Due Date by when the follow-up should be performed. Default Date is 1 month later from the Call Recording Date
o) Follow Up Assigned To ---> If the prompt contains the follow-up or co-ordinate, then with whom the follow-up/co-ordination needs to be done. Example - Follow up with MSL, follow-up with Dr. XYZ etc.

IMPORTANT NOTES - 

a) Date of the call - If the call mentions words like "today", "tomorrow", or "yesterday", resolve them based on the date: **${today}** (YYYY-MM-DD).

Examples:
- "today" → ${today}
- "tomorrow" → ${tomorrow}
- "yesterday" → ${yesterday}

b) Adverse Effect - If the user prompt contains "patient" AND any of the following words:
   ["Pregnancy", "Nausea", "Vomiting", "Honoraria", "Diarrhea", "Constipation", "Abdominal pain", "Headache", "Dizziness", "Fatigue", "Drowsiness", "Insomnia", "Anxiety", "Depression", "Mood changes", "Confusion", "Memory impairment", "Blurred vision", "Dry mouth", "Increased thirst", "Frequent urination", "Rash", "Itching", "Hives", "Swelling", "Bruising", "Bleeding", "Muscle pain", "Muscle weakness", "Joint pain", "Fever", "Chills", "Sweating", "Flushing", "Palpitations", "Chest pain", "Shortness of breath", "Cough", "Wheezing", "Nasal congestion", "Sore throat", "Runny nose", "Sneezing", "Appetite changes", "Weight gain", "Weight loss", "Hair loss", "Skin discoloration", "Nail changes", "Hearing impairment", "Tinnitus", "Vertigo", "Seizures", "Tremors", "Numbness", "Tingling", "Impaired coordination", "Liver dysfunction", "Kidney dysfunction", "Electrolyte imbalances", "Blood count changes", "Allergic reactions", "Anaphylaxis", "Increased risk of infection", "Impaired wound healing", "Increased cancer risk", "Cardiovascular events", "Stroke", "Hypertension", "Hypotension", "Arrhythmias", "Gastrointestinal bleeding", "Pancreatitis", "Hepatitis", "Renal failure", "Respiratory distress", "Sudden death"]

c) Non Compliance Description - If any of these words are found:
   
  [Honoraria, Off-label, kick back risk, Unpublished, Pre-publication, Unreleased]
   
  Set Non Compliance Description - extracted from the above list


Based on the parameters fetched above create JSON response for the below parameters - 

a) call_date
b) call_time - 
c) call_channel
d) discussion_notes
e) accountName 
f) product_description
g) call_notes 
h) adverse_event_details
i) non_compliance_description
j) follow_up_description
k) status
l) activity
m) attendees
n) follow_up_due_date
o) follow_up_assigned_to

Return ONLY THE JSON RESPONSE as below. DO NOT PROVIDE ANY TEXT -

{
 "call_channel": string, // Call type, choose from the list "In Person", "Video", "Virtual", "Phone". Default the value of this field automatically to 'In Person' if information is not provided by the user.
 
 "discussion_notes": string, // Discussion Heading in summarized way.
 
 "accountName": string, // Extract the doctor/physician name from the user query provided. The doctor name must come from the user's input and no other source. Doctor name is referred to as account here.
 
 "adverse_event_details": string, // Short description of why there is an adverse event reported and add "Please report this to the pharmacovigilance team (1234-567-89) within 1 business day or 3 calendar days, whichever is shorter". Return 'null' if 'adverse_event' is false.
 
 "non_compliance_description": string, // Include non-compliant details if non-compliance is detected. "The following topic has been identified as potentially non-compliant. Please discuss this with your manager within the next 3 business days."
 
 "call_notes": string, // Summary of Key Topics Discussed and Outcomes. Summarize them in a proper meaningful way.
 
 "call_date": string, // Call date (YYYY-MM-DD) if mentioned in the user query provided. Show null if not provided.If MM is single digit, append 0 before like - 2025-04-20
 
 "call_time": time, // Extract the call time in (HH-MM-SS) format if it exists in the user query provided. Show null if not provided.

 "product_description": string, // Name of the product/products discussed in the call. Can be multiple.

 "status" : "Saved" // By Default

 "activity" : "" // Keep it empty string by default

 "attendees":[] // Check for any other HCP names other than accountName. Can be multiple

 "non_compliance_event" : false/true // boolean(true/false) - if the key(noncompliance_description has some value, the boolean can be set to true else false)

 "adverse_event" : false/true // boolean(true/false) - If the key(adverse_event_details) has some value, the boolean can be set to true else false

 "follow_up_description": "" // If any follow-up request is present in the user prompt

 "assigned_to": "" // Follow-up task assigned to which person. Analyze the prompt to identify the Follow-up Person.

 "due_date": "" // If there is any value for "follow_up_description" and "assigned to" then append Due Date of the follow-up task. Default Date is 1 month from call_date(fetched from prompt) date in format: (YYYY-MM-DD)

 }
Now Generate the JSON response for the call transcript. DO NOT RETURN ANY TEXT- ${inputText}`;
}

/**
 * Generate the prompt for filling missing information
 */
export function generateFillMissingDetailsPrompt(inputText: string): string {
  const today = moment(new Date()).format('YYYY-MM-DD');
  const tomorrow = moment(new Date()).add(1, 'days').format('YYYY-MM-DD');
  const yesterday = moment(new Date()).subtract(1, 'days').format('YYYY-MM-DD');

  return `Now the user has given the missing information details as ${inputText}. Analyze the parameters from the Chat History that were missing and save the parameter in the previous JSON response. The missing information can be one of the following - 
a) CALL DATE - Convert the date to YYYY-MM-DD format and append into the "call_date" parameter (format: YYYY-MM-DD) - 
   Remember If the call mentions words like "today", "tomorrow", or "yesterday", resolve them based on the date: **${today}**
Examples:
- "today" → ${today}
- "tomorrow" → ${tomorrow}
- "yesterday" → ${yesterday}

If NOT FOUND ADD null

b) CALL TIME - Convert the time to HH:MM:ss format and append into the "call_time" parameter. IF NOT FOUND ADD null
c) ACCOUNT ID - Append into the "accountId" parameter.IF NOT FOUND ADD null
d) ACCOUNT NAME - Append into the "accountName" parameter.IF NOT FOUND ADD null 
e) PRODUCT NAME - Append into the "product_description" parameter.IF NOT FOUND ADD null
f) CALL CHANNEL - Append into the "call_channel" parameter.IF NOT FOUND ADD null
g) DISCUSSION TOPIC - Append into the "discussion_notes" parameter.IF NOT FOUND ADD null
h) CALL NOTES - Append into the "call_notes" parameter.IF NOT FOUND ADD null
i) Adverse Event Details - Append into the "adverse_event_details" parameter.IF NOT FOUND ADD null
j) Non Compliance Description - Append into the "non_compliance_description" parameter.IF NOT FOUND ADD null
k) CALL FOLLOW UP TASK - Append into the "follow_up_description" parameter.IF NOT FOUND ADD null
l) STATUS 
m) ACTIVITY
n) ATTENDEES
o) FOLLOW UP DUE DATE 
p) FOLLOW UP ASSIGNED TO 
DO NOT ADD ANY TEXT, ONLY SEND THE COMBINED JSON RESPONSE.`;
}

