<script setup>
import { ref, nextTick } from 'vue'

defineProps({
  messages: {
    type: Array,
    required: true
  }
})

const container = ref(null)

function scrollToBottom() {
  nextTick(() => {
    if (container.value) {
      container.value.scrollTop = container.value.scrollHeight
    }
  })
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true
  })
}

function getMessageLabel(type) {
  switch (type) {
    case 'user': return '👤 You'
    case 'assistant': return '🤖 Nova'
    case 'system': return '⚙️ System'
    default: return type
  }
}

defineExpose({ scrollToBottom })
</script>

<template>
  <div class="transcript-box" ref="container">
    <TransitionGroup name="message">
      <div 
        v-for="message in messages" 
        :key="message.id"
        class="message"
        :class="message.type"
      >
        <div class="message-header">
          <span class="message-label">{{ getMessageLabel(message.type) }}</span>
          <span v-if="message.timestamp" class="message-time">
            {{ formatTime(message.timestamp) }}
          </span>
        </div>
        <div class="message-content">{{ message.text }}</div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.transcript-box {
  flex: 1;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  scroll-behavior: smooth;
  
  /* iOS Safari scroll momentum */
  -webkit-overflow-scrolling: touch;
}

/* Custom scrollbar */
.transcript-box::-webkit-scrollbar {
  width: 6px;
}

.transcript-box::-webkit-scrollbar-track {
  background: transparent;
}

.transcript-box::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.transcript-box::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Message */
.message {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border-left: 3px solid transparent;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Vue transition */
.message-enter-active {
  animation: slideIn 0.3s ease-out;
}

.message-leave-active {
  animation: slideIn 0.3s ease-out reverse;
}

/* Message types */
.message.user {
  background: rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
}

.message.assistant {
  background: rgba(16, 185, 129, 0.1);
  border-left-color: #10b981;
}

.message.system {
  background: rgba(245, 158, 11, 0.08);
  border-left-color: #f59e0b;
  font-size: 0.9rem;
}

/* Message header */
.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.message-label {
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.8;
}

.message.user .message-label {
  color: #93c5fd;
}

.message.assistant .message-label {
  color: #6ee7b7;
}

.message.system .message-label {
  color: #fcd34d;
}

.message-time {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
}

/* Message content */
.message-content {
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
  word-wrap: break-word;
}

.message.system .message-content {
  font-style: italic;
  color: rgba(255, 255, 255, 0.7);
}

/* Responsive */
@media (max-width: 480px) {
  .transcript-box {
    padding: 0.75rem;
  }
  
  .message {
    padding: 0.6rem 0.8rem;
  }
  
  .message-content {
    font-size: 0.95rem;
  }
}
</style>

