<script setup>
defineProps({
  status: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  }
})
</script>

<template>
  <div class="status-badge" :class="status">
    <div class="status-dot"></div>
    <span class="status-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

/* Disconnected */
.status-badge.disconnected {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

.status-badge.disconnected .status-dot {
  background: #ef4444;
}

.status-badge.disconnected .status-text {
  color: #fca5a5;
}

/* Connecting */
.status-badge.connecting {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}

.status-badge.connecting .status-dot {
  background: #f59e0b;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.status-badge.connecting .status-text {
  color: #fcd34d;
}

/* Connected / Ready */
.status-badge.connected {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}

.status-badge.connected .status-dot {
  background: #10b981;
}

.status-badge.connected .status-text {
  color: #6ee7b7;
}

/* Recording */
.status-badge.recording {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  animation: glow-badge 2s ease-in-out infinite;
}

.status-badge.recording .status-dot {
  background: #3b82f6;
  animation: pulse-dot 0.8s ease-in-out infinite;
}

.status-badge.recording .status-text {
  color: #93c5fd;
}

/* Processing */
.status-badge.processing {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
}

.status-badge.processing .status-dot {
  background: #8b5cf6;
  animation: spin-dot 1s linear infinite;
}

.status-badge.processing .status-text {
  color: #c4b5fd;
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

@keyframes glow-badge {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
  50% { box-shadow: 0 0 15px 2px rgba(59, 130, 246, 0.3); }
}

@keyframes spin-dot {
  0% { transform: rotate(0deg); border-radius: 50%; }
  25% { border-radius: 30%; }
  50% { transform: rotate(180deg); border-radius: 50%; }
  75% { border-radius: 30%; }
  100% { transform: rotate(360deg); border-radius: 50%; }
}
</style>

