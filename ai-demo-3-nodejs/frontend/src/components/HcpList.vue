<script setup>
import { ref, onMounted } from 'vue'
import config from '../config'

const hcps = ref([])
const loading = ref(true)
const error = ref(null)

async function loadHcps() {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch(config.endpoints.hcpList)
    if (!response.ok) throw new Error('Failed to load HCPs')
    
    const data = await response.json()
    hcps.value = data.hcps || []
  } catch (e) {
    console.error('Failed to load HCPs:', e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHcps()
})
</script>

<template>
  <div class="hcp-panel">
    <div class="panel-header">
      <h3>👨‍⚕️ Healthcare Professionals</h3>
      <button class="refresh-btn" @click="loadHcps" :disabled="loading">
        🔄
      </button>
    </div>
    
    <p class="hint">Say a doctor's name to test the lookup tool</p>
    
    <div class="hcp-list">
      <div v-if="loading" class="loading-state">
        <div class="spinner-sm"></div>
        <span>Loading HCPs...</span>
      </div>
      
      <div v-else-if="error" class="error-state">
        ❌ {{ error }}
      </div>
      
      <div v-else-if="hcps.length === 0" class="empty-state">
        No HCPs found
      </div>
      
      <div v-else class="hcp-items">
        <div v-for="hcp in hcps" :key="hcp.id" class="hcp-item">
          <span class="hcp-name">{{ hcp.name }}</span>
          <span class="hcp-id">{{ hcp.id }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hcp-panel {
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

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.hcp-list {
  max-height: 200px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.error-state {
  color: var(--accent-red);
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hcp-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hcp-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  transition: background 0.2s;
}

.hcp-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.hcp-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.hcp-id {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: 'SF Mono', Monaco, monospace;
}
</style>

