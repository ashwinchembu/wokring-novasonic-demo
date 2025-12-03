<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  logs: {
    type: Array,
    required: true
  }
})

const isExpanded = ref(false)

const latestLog = computed(() => {
  if (props.logs.length === 0) return null
  return props.logs[props.logs.length - 1]
})

function formatData(data) {
  if (!data) return ''
  try {
    if (typeof data === 'string') {
      return data
    }
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function getToolIcon(toolName) {
  const icons = {
    'lookup_hcp': '👨‍⚕️',
    'get_current_date_time': '📅',
    'search': '🔍',
    'database': '💾',
    default: '🔧'
  }
  
  for (const [key, icon] of Object.entries(icons)) {
    if (toolName?.toLowerCase().includes(key)) {
      return icon
    }
  }
  return icons.default
}
</script>

<template>
  <div class="tool-log-panel">
    <button class="toggle-button" @click="isExpanded = !isExpanded">
      <span class="toggle-icon">{{ isExpanded ? '📂' : '📁' }}</span>
      <span class="toggle-text">Tool Calls ({{ logs.length }})</span>
      <span v-if="latestLog && !isExpanded" class="latest-tool">
        {{ getToolIcon(latestLog.toolName) }} {{ latestLog.toolName }}
      </span>
      <span class="chevron" :class="{ expanded: isExpanded }">▼</span>
    </button>
    
    <Transition name="expand">
      <div v-if="isExpanded" class="log-container">
        <div 
          v-for="log in logs" 
          :key="log.id"
          class="log-entry"
          :class="log.type"
        >
          <div class="log-header">
            <span class="log-icon">{{ getToolIcon(log.toolName) }}</span>
            <span class="log-tool-name">{{ log.toolName }}</span>
            <span class="log-type-badge" :class="log.type">
              {{ log.type === 'tool_invocation' ? 'Called' : 'Result' }}
            </span>
          </div>
          
          <div v-if="log.input" class="log-data">
            <div class="data-label">Input:</div>
            <pre class="data-content">{{ formatData(log.input) }}</pre>
          </div>
          
          <div v-if="log.result" class="log-data">
            <div class="data-label">Result:</div>
            <pre class="data-content">{{ formatData(log.result) }}</pre>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tool-log-panel {
  flex-shrink: 0;
}

.toggle-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  color: #c4b5fd;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-button:hover {
  background: rgba(139, 92, 246, 0.15);
}

.toggle-icon {
  font-size: 1rem;
}

.toggle-text {
  font-weight: 500;
}

.latest-tool {
  margin-left: auto;
  font-size: 0.8rem;
  color: rgba(196, 181, 253, 0.6);
}

.chevron {
  margin-left: auto;
  font-size: 0.7rem;
  transition: transform 0.2s ease;
}

.chevron.expanded {
  transform: rotate(180deg);
}

/* Log container */
.log-container {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Vue transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}

/* Log entry */
.log-entry {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border-left: 2px solid #8b5cf6;
}

.log-entry.tool_result {
  border-left-color: #10b981;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.log-icon {
  font-size: 0.9rem;
}

.log-tool-name {
  font-weight: 500;
  color: #e5e7eb;
  font-size: 0.8rem;
}

.log-type-badge {
  margin-left: auto;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 500;
  text-transform: uppercase;
}

.log-type-badge.tool_invocation {
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
}

.log-type-badge.tool_result {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

/* Log data */
.log-data {
  margin-top: 0.35rem;
}

.data-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.2rem;
}

.data-content {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.3);
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 80px;
  overflow-y: auto;
}
</style>

