<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import config from '../config'

const dbStatus = ref({
  currentSource: 'unknown',
  sourceEmoji: '❓',
  sourceName: 'Checking...',
  databases: {
    redshift: { available: false, message: 'Checking...' },
    sqlite: { available: false, message: 'Checking...' }
  },
  message: 'Checking database status...'
})

const loading = ref(false)
const actionLoading = ref(false)
let pollInterval = null

async function checkDbStatus() {
  try {
    loading.value = true
    const response = await fetch(config.endpoints.dbStatus)
    if (response.ok) {
      const data = await response.json()
      dbStatus.value = data
    }
  } catch (error) {
    console.error('Failed to check database status:', error)
    dbStatus.value.message = 'Failed to connect to server'
  } finally {
    loading.value = false
  }
}

async function forceSqlite() {
  try {
    actionLoading.value = true
    const response = await fetch(`${config.apiUrl}/db/force-sqlite`, {
      method: 'POST'
    })
    if (response.ok) {
      await checkDbStatus()
    }
  } catch (error) {
    console.error('Failed to force SQLite:', error)
  } finally {
    actionLoading.value = false
  }
}

async function retryRedshift() {
  try {
    actionLoading.value = true
    const response = await fetch(`${config.apiUrl}/db/retry-redshift`, {
      method: 'POST'
    })
    if (response.ok) {
      await checkDbStatus()
    }
  } catch (error) {
    console.error('Failed to retry Redshift:', error)
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  checkDbStatus()
  // Poll every 30 seconds
  pollInterval = setInterval(checkDbStatus, 30000)
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})
</script>

<template>
  <div class="db-panel">
    <div class="panel-header">
      <h3>🗄️ Database Status</h3>
      <button class="refresh-btn" @click="checkDbStatus" :disabled="loading">
        🔄
      </button>
    </div>
    
    <!-- Current Source Badge -->
    <div class="current-source" :class="dbStatus.currentSource">
      <span class="source-emoji">{{ dbStatus.sourceEmoji }}</span>
      <div class="source-info">
        <span class="source-name">{{ dbStatus.sourceName }}</span>
        <span class="source-message">{{ dbStatus.message }}</span>
      </div>
    </div>
    
    <!-- Database Health Grid -->
    <div class="db-health-grid">
      <!-- Redshift -->
      <div class="db-card" :class="{ available: dbStatus.databases?.redshift?.available }">
        <div class="db-header">
          <span class="db-icon">☁️</span>
          <span class="db-name">Redshift</span>
          <span class="db-status-dot" :class="dbStatus.databases?.redshift?.available ? 'online' : 'offline'"></span>
        </div>
        <div class="db-message">
          {{ dbStatus.databases?.redshift?.message || 'Unknown' }}
        </div>
      </div>
      
      <!-- SQLite -->
      <div class="db-card" :class="{ available: dbStatus.databases?.sqlite?.available }">
        <div class="db-header">
          <span class="db-icon">💾</span>
          <span class="db-name">SQLite</span>
          <span class="db-status-dot" :class="dbStatus.databases?.sqlite?.available ? 'online' : 'offline'"></span>
        </div>
        <div class="db-message">
          {{ dbStatus.databases?.sqlite?.message || 'Unknown' }}
        </div>
      </div>
    </div>
    
    <!-- Database Actions -->
    <div class="db-actions">
      <button 
        class="action-btn sqlite" 
        @click="forceSqlite" 
        :disabled="actionLoading || dbStatus.currentSource === 'sqlite'"
      >
        💾 Force SQLite
      </button>
      <button 
        class="action-btn redshift" 
        @click="retryRedshift" 
        :disabled="actionLoading"
      >
        ☁️ Retry Redshift
      </button>
    </div>
    
    <!-- SQL Query Info -->
    <div class="sql-info">
      <div class="sql-hint">
        <span class="hint-icon">💡</span>
        <span>
          <strong>Auto-fallback:</strong> If Redshift fails, calls are saved to local SQLite backup
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.db-panel {
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

.refresh-btn {
  padding: 0.35rem 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.refresh-btn:disabled {
  opacity: 0.5;
}

/* Current Source */
.current-source {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.current-source.redshift {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.current-source.sqlite {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}

.source-emoji {
  font-size: 1.5rem;
}

.source-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.source-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.source-message {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* Database Health Grid */
.db-health-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.db-card {
  padding: 0.75rem;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  transition: all 0.2s;
}

.db-card.available {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}

.db-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.db-icon {
  font-size: 1rem;
}

.db-name {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.db-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: auto;
}

.db-status-dot.online {
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}

.db-status-dot.offline {
  background: var(--accent-red);
}

.db-message {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Database Actions */
.db-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.6rem;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.sqlite {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.action-btn.sqlite:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.3);
}

.action-btn.redshift {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.action-btn.redshift:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
}

/* SQL Info */
.sql-info {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.sql-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.hint-icon {
  flex-shrink: 0;
}

.sql-hint strong {
  color: var(--text-secondary);
}
</style>

