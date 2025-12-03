<script setup>
import { computed } from 'vue'

const props = defineProps({
  callLog: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['export', 'clear', 'testSave'])

const requiredFields = ['hcp_name', 'call_date', 'call_time', 'product']

const fieldLabels = {
  hcp_name: 'HCP Name',
  hcp_id: 'HCP ID',
  call_date: 'Call Date',
  call_time: 'Call Time',
  product: 'Product',
  call_channel: 'Call Channel',
  discussion_topic: 'Discussion Topic',
  status: 'Status',
  account: 'Account',
  id: 'Record ID',
  call_notes: 'Call Notes',
  adverse_event: 'Adverse Event',
  adverse_event_details: 'AE Details',
  noncompliance_event: 'Noncompliance Event',
  noncompliance_description: 'Noncompliance Description'
}

const displayFields = computed(() => {
  const fields = []
  
  for (const [key, label] of Object.entries(fieldLabels)) {
    const value = props.callLog[key]
    const hasValue = value !== null && value !== '' && value !== false && value !== undefined
    const isRequired = requiredFields.includes(key)
    
    let status, statusText
    if (hasValue) {
      status = 'collected'
      statusText = '✓ Collected'
    } else if (isRequired) {
      status = 'required'
      statusText = '! Required'
    } else {
      status = 'missing'
      statusText = '○ Empty'
    }
    
    fields.push({
      key,
      label,
      value: hasValue ? (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value) : '(not set)',
      hasValue,
      isRequired,
      status,
      statusText
    })
  }
  
  return fields
})

const followupTask = computed(() => {
  const task = props.callLog.call_follow_up_task || {}
  return {
    hasTask: task.task_type || task.description || task.due_date || task.assigned_to,
    task_type: task.task_type || '(not set)',
    description: task.description || '(not set)',
    due_date: task.due_date || '(not set)',
    assigned_to: task.assigned_to || '(not set)'
  }
})

const completionStatus = computed(() => {
  const collected = requiredFields.filter(field => {
    const value = props.callLog[field]
    return value !== null && value !== '' && value !== undefined
  }).length
  
  return {
    collected,
    total: requiredFields.length,
    percentage: Math.round((collected / requiredFields.length) * 100)
  }
})
</script>

<template>
  <div class="call-log-panel">
    <div class="panel-header">
      <h3>📊 Call Log Data (Live)</h3>
      <div class="completion-badge" :class="{ complete: completionStatus.collected === completionStatus.total }">
        {{ completionStatus.collected }}/{{ completionStatus.total }} fields
      </div>
    </div>
    
    <p class="hint">Watch as the AI extracts information during the conversation</p>
    
    <!-- Progress bar -->
    <div class="progress-bar">
      <div 
        class="progress-fill" 
        :style="{ width: completionStatus.percentage + '%' }"
        :class="{ complete: completionStatus.percentage === 100 }"
      ></div>
    </div>
    
    <!-- Field table -->
    <div class="field-table">
      <div 
        v-for="field in displayFields" 
        :key="field.key"
        class="field-row"
        :class="{ 'has-value': field.hasValue }"
      >
        <div class="field-name">{{ field.label }}</div>
        <div class="field-value" :class="{ empty: !field.hasValue }">
          {{ field.value }}
        </div>
        <div class="field-status">
          <span class="status-badge" :class="field.status">
            {{ field.statusText }}
          </span>
        </div>
      </div>
      
      <!-- Follow-up task section -->
      <div class="field-row nested">
        <div class="field-name">Follow-up Task</div>
        <div class="nested-content">
          <template v-if="followupTask.hasTask">
            <div class="nested-field">
              <span class="nested-label">Task Type:</span>
              <span class="nested-value">{{ followupTask.task_type }}</span>
            </div>
            <div class="nested-field">
              <span class="nested-label">Description:</span>
              <span class="nested-value">{{ followupTask.description }}</span>
            </div>
            <div class="nested-field">
              <span class="nested-label">Due Date:</span>
              <span class="nested-value">{{ followupTask.due_date }}</span>
            </div>
            <div class="nested-field">
              <span class="nested-label">Assigned To:</span>
              <span class="nested-value">{{ followupTask.assigned_to }}</span>
            </div>
          </template>
          <span v-else class="empty">(no follow-up task)</span>
        </div>
      </div>
    </div>
    
    <!-- Action buttons -->
    <div class="action-buttons">
      <button class="btn-export" @click="$emit('export')">
        💾 Save & Export JSON
      </button>
      <button class="btn-clear" @click="$emit('clear')">
        🗑️ Clear
      </button>
      <button class="btn-test" @click="$emit('testSave')">
        🧪 Test Save
      </button>
    </div>
  </div>
</template>

<style scoped>
.call-log-panel {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0;
}

.completion-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.completion-badge.complete {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-yellow), var(--accent-blue));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-fill.complete {
  background: linear-gradient(90deg, var(--accent-green), var(--accent-cyan));
}

.field-table {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 300px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.field-row {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
  align-items: center;
  font-size: 0.85rem;
}

.field-row.has-value {
  background: rgba(16, 185, 129, 0.05);
}

.field-row.nested {
  display: block;
  padding: 0.75rem;
}

.field-name {
  font-weight: 500;
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.8rem;
}

.field-value {
  color: var(--text-primary);
  word-break: break-word;
}

.field-value.empty {
  color: var(--text-muted);
  font-style: italic;
}

.field-status {
  text-align: right;
}

.status-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
}

.status-badge.collected {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.status-badge.missing {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.status-badge.required {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.nested-content {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border-left: 3px solid var(--accent-purple);
}

.nested-field {
  display: flex;
  justify-content: space-between;
  padding: 0.35rem 0;
  font-size: 0.8rem;
}

.nested-label {
  color: var(--text-muted);
}

.nested-value {
  color: var(--text-secondary);
}

.empty {
  color: var(--text-muted);
  font-style: italic;
}

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.5rem;
}

.action-buttons button {
  padding: 0.6rem 0.75rem;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-export {
  background: var(--gradient-primary);
  color: white;
}

.btn-clear {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.btn-test {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.action-buttons button:hover {
  transform: translateY(-1px);
}
</style>

