<script setup>
import { ref } from 'vue'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: true
  },
  placeholder: {
    type: String,
    default: 'Type your message here... (Press Enter to send)'
  }
})

const emit = defineEmits(['send'])

const message = ref('')
const textarea = ref(null)

function send() {
  const text = message.value.trim()
  if (!text || props.disabled) return
  
  emit('send', text)
  message.value = ''
  
  // Reset textarea height
  if (textarea.value) {
    textarea.value.style.height = 'auto'
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 150) + 'px'
}
</script>

<template>
  <div class="text-input-container">
    <textarea
      ref="textarea"
      v-model="message"
      :placeholder="placeholder"
      :disabled="disabled"
      @keydown="handleKeydown"
      @input="autoResize"
      rows="2"
    ></textarea>
    <button 
      class="send-btn"
      :disabled="disabled || !message.trim()"
      @click="send"
    >
      📤 Send
    </button>
  </div>
</template>

<style scoped>
.text-input-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

textarea {
  width: 100%;
  padding: 0.85rem 1rem;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  resize: none;
  transition: all 0.2s;
  min-height: 60px;
  max-height: 150px;
}

textarea::placeholder {
  color: var(--text-muted);
}

textarea:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  padding: 0.75rem 1.5rem;
  background: var(--gradient-primary);
  border: none;
  border-radius: 10px;
  color: white;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

