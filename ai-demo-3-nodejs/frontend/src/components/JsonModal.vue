<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  data: {
    type: Object,
    default: null
  },
  title: {
    type: String,
    default: 'Call Log Details'
  }
})

const emit = defineEmits(['close', 'download'])

const formattedJson = computed(() => {
  if (!props.data) return ''
  return JSON.stringify(props.data, null, 2)
})

function handleBackdropClick(e) {
  if (e.target.classList.contains('modal-backdrop')) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div 
        v-if="visible" 
        class="modal-backdrop" 
        @click="handleBackdropClick"
      >
        <div class="modal-container">
          <div class="modal-header">
            <h3>📋 {{ title }}</h3>
            <button class="close-btn" @click="$emit('close')">
              ✕
            </button>
          </div>
          
          <div class="modal-body">
            <pre class="json-display">{{ formattedJson }}</pre>
          </div>
          
          <div class="modal-footer">
            <button class="btn-download" @click="$emit('download')">
              💾 Download JSON
            </button>
            <button class="btn-close" @click="$emit('close')">
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-container {
  background: #1a1f2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  width: 100%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
}

.modal-header h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

.modal-body {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.json-display {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #e5e7eb;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 50vh;
  overflow-y: auto;
}

.json-display::-webkit-scrollbar {
  width: 8px;
}

.json-display::-webkit-scrollbar-track {
  background: transparent;
}

.json-display::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-footer button {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-download {
  background: var(--gradient-primary);
  color: white;
}

.btn-download:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
}

.btn-close {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Vue transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9) translateY(20px);
}
</style>

