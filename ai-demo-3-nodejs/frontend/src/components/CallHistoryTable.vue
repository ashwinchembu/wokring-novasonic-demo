<script setup>
import { computed } from 'vue'

const props = defineProps({
  history: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['view', 'download', 'delete', 'refresh', 'exportAll'])

const requiredFields = ['hcp_name', 'call_date', 'call_time', 'product']

function isComplete(log) {
  return requiredFields.every(field => {
    const value = log[field]
    return value !== null && value !== '' && value !== undefined
  })
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A'
  const date = new Date(ts)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}
</script>

<template>
  <div class="history-panel">
    <div class="panel-header">
      <h3>📚 Call History</h3>
      <span class="history-count">{{ history.length }} calls</span>
    </div>
    
    <p class="hint">All exported calls appear here. Click any row to view full JSON.</p>
    
    <div class="history-table-container">
      <div v-if="loading" class="loading-state">
        <div class="spinner-sm"></div>
        <span>Loading history...</span>
      </div>
      
      <div v-else-if="history.length === 0" class="empty-state">
        <span>📭</span>
        <span>No saved calls yet</span>
      </div>
      
      <table v-else class="history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Timestamp</th>
            <th>HCP Name</th>
            <th>Product</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(log, index) in history" 
            :key="log.session_id || log.call_pk || index"
            @click="$emit('view', index)"
            class="history-row"
          >
            <td class="row-number">{{ index + 1 }}</td>
            <td class="timestamp">{{ formatTimestamp(log.created_at || log.exported_at) }}</td>
            <td class="hcp-name">{{ log.hcp_name || '(not set)' }}</td>
            <td class="product">{{ log.product || '(not set)' }}</td>
            <td class="call-date">{{ log.call_date || '(not set)' }}</td>
            <td>
              <span 
                class="status-pill" 
                :class="isComplete(log) ? 'complete' : 'incomplete'"
              >
                {{ isComplete(log) ? '✓ Complete' : '⚠ Incomplete' }}
              </span>
            </td>
            <td class="actions" @click.stop>
              <button 
                class="action-btn view" 
                @click="$emit('view', index)"
                title="View JSON"
              >
                👁️
              </button>
              <button 
                class="action-btn download" 
                @click="$emit('download', index)"
                title="Download"
              >
                💾
              </button>
              <button 
                class="action-btn delete" 
                @click="$emit('delete', index)"
                title="Delete"
              >
                🗑️
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Action buttons -->
    <div class="action-buttons">
      <button class="btn-refresh" @click="$emit('refresh')" :disabled="loading">
        🔄 Refresh from Redshift
      </button>
      <button class="btn-export" @click="$emit('exportAll')" :disabled="history.length === 0">
        📥 Export All
      </button>
    </div>
  </div>
</template>

<style scoped>
.history-panel {
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

.history-count {
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.history-table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--text-muted);
}

.empty-state span:first-child {
  font-size: 2rem;
}

.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.history-table th {
  text-align: left;
  padding: 0.6rem 0.5rem;
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.history-table td {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}

.history-row {
  cursor: pointer;
  transition: background 0.2s;
}

.history-row:hover {
  background: rgba(59, 130, 246, 0.1);
}

.row-number {
  font-weight: 700;
  color: var(--accent-blue);
}

.timestamp {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.hcp-name {
  font-weight: 500;
  color: var(--text-primary);
}

.status-pill {
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-pill.complete {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.status-pill.incomplete {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.actions {
  display: flex;
  gap: 0.25rem;
}

.action-btn {
  padding: 0.3rem 0.4rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.view:hover {
  background: rgba(59, 130, 246, 0.2);
}

.action-btn.download:hover {
  background: rgba(16, 185, 129, 0.2);
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.2);
}

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
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

.btn-refresh {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.btn-export {
  background: var(--gradient-primary);
  color: white;
}

.action-buttons button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

