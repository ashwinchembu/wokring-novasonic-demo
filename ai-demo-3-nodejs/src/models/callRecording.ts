/**
 * Call Recording Data Models
 * TypeScript interfaces for call recording analysis
 */

export interface CallFollowUpTask {
  task_type: string;
  description: string;
  due_date: string;
  assigned_to: string;
}

export interface CallRecordingPayload {
  call_channel: string;
  discussion_notes: string;
  accountName: string;
  accountId: string;
  call_date: string;
  call_time: string;
  product_description: string;
  call_notes: string;
  status: string;
  activity: string;
  attendees: string[];
  adverse_event: boolean;
  adverse_event_details: string | null;
  non_compliance_event: boolean;
  non_compliance_description: string;
  follow_up_description: string;
  assigned_to: string;
  due_date: string;
  multipleAccountsFoundArray?: Array<{
    accountId: string;
    accountName: string;
  }>;
}

export enum MissingInformationEvent {
  ACCOUNT_NAME_MISSING = 'ACCOUNT_NAME_MISSING',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  MULTIPLE_ACCOUNTS_FOUND = 'MULTIPLE_ACCOUNTS_FOUND',
  CALL_DATE_NOT_FOUND = 'CALL_DATE_NOT_FOUND',
  CALL_TIME_NOT_FOUND = 'CALL_TIME_NOT_FOUND',
  PRODUCT_INFO_NOT_FOUND = 'PRODUCT_INFO_NOT_FOUND',
  CALL_CHANNEL_NOT_FOUND = 'CALL_CHANNEL_NOT_FOUND',
}

export interface CallRecordingAnalysisResult {
  callRecordingPayload: CallRecordingPayload;
  missingInformationEvents: string[];
}

export interface CallRecordingParameters {
  call_channel?: string;
  accountName?: string;
  accountId?: string;
  call_date?: string;
  call_time?: string;
  product_description?: string;
  discussion_notes?: string;
  call_notes?: string;
  adverse_event?: boolean;
  adverse_event_details?: string | null;
  non_compliance_event?: boolean;
  non_compliance_description?: string;
  status?: string;
  activity?: string;
  attendees?: string[];
  follow_up_description?: string;
  assigned_to?: string;
  due_date?: string;
}

