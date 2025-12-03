<script setup>
defineProps({
  stats: {
    type: Object,
    required: true
  }
})

const statConfig = [
  { key: 'audioChunks', label: 'Audio Chunks', icon: '🎤', color: 'blue' },
  { key: 'transcripts', label: 'Transcripts', icon: '💬', color: 'purple' },
  { key: 'audioResponses', label: 'Audio Resp.', icon: '🔊', color: 'green' },
  { key: 'toolCalls', label: 'Tool Calls', icon: '🔧', color: 'orange' }
]
</script>

<template>
  <div class="stats-panel">
    <h3>📊 Statistics</h3>
    
    <div class="stats-grid">
      <div 
        v-for="stat in statConfig" 
        :key="stat.key"
        class="stat-box"
        :class="stat.color"
      >
        <div class="stat-icon">{{ stat.icon }}</div>
        <div class="stat-value">{{ stats[stat.key] || 0 }}</div>
        <div class="stat-label">{{ stat.label }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1rem;
}

.stats-panel h3 {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 0.5rem;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2));
  text-align: center;
  transition: transform 0.2s;
}

.stat-box:hover {
  transform: translateY(-2px);
}

.stat-box.blue {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.25));
}

.stat-box.purple {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.25));
}

.stat-box.green {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.25));
}

.stat-box.orange {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.25));
}

.stat-icon {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
}

/* Responsive */
@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

