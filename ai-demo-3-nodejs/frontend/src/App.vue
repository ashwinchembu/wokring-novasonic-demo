<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import StatusBadge from './components/StatusBadge.vue'
import AudioVisualizer from './components/AudioVisualizer.vue'
import TranscriptBox from './components/TranscriptBox.vue'
import ToolLog from './components/ToolLog.vue'
import config from './config'

// ==================== STATE ====================
const state = reactive({
  status: 'disconnected', // disconnected, connecting, connected, recording, processing
  sessionId: null,
  bedrockSessionId: null,
  isRecording: false,
  isPlaying: false,
  audioLevel: 0,
})

const messages = ref([
  { id: Date.now(), type: 'system', text: 'Tap "Connect" to begin your conversation' }
])

const toolLogs = ref([])
const transcriptBox = ref(null)
const isIOS = ref(false)

// Audio state
let audioContext = null
let mediaStream = null
let audioProcessor = null
let playbackContext = null
let audioQueue = []
let isProcessingQueue = false
let eventSource = null

// ==================== COMPUTED ====================
const canConnect = computed(() => state.status === 'disconnected')
const canDisconnect = computed(() => ['connected', 'recording', 'processing'].includes(state.status))
const canRecord = computed(() => ['connected', 'processing'].includes(state.status))

const statusText = computed(() => {
  switch (state.status) {
    case 'disconnected': return 'Disconnected'
    case 'connecting': return 'Connecting...'
    case 'connected': return 'Ready'
    case 'recording': return 'Listening...'
    case 'processing': return 'Processing...'
    default: return state.status
  }
})

// ==================== LIFECYCLE ====================
onMounted(() => {
  isIOS.value = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  
  // iOS Safari: prevent double-tap zoom
  if (isIOS.value) {
    let lastTouchEnd = 0
    document.addEventListener('touchend', (e) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }, { passive: false })
  }
})

onUnmounted(() => {
  cleanup()
})

// ==================== CONNECTION ====================
async function connect() {
  try {
    state.status = 'connecting'
    addMessage('system', '🔄 Connecting to Nova Sonic...')

    const response = await fetch(config.endpoints.sessionStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.statusText}`)
    }

    const data = await response.json()
    state.sessionId = data.sessionId
    state.bedrockSessionId = data.bedrockSessionId
    state.status = 'connected'

    // Start SSE stream
    startEventStream()

    addMessage('system', '✅ Connected! Tap the microphone to speak.')
  } catch (error) {
    console.error('Connection error:', error)
    state.status = 'disconnected'
    addMessage('system', `❌ Connection failed: ${error.message}`)
  }
}

async function disconnect() {
  try {
    cleanup()

    if (state.sessionId) {
      await fetch(config.endpoints.sessionEnd(state.sessionId), { method: 'DELETE' })
    }

    state.sessionId = null
    state.bedrockSessionId = null
    state.status = 'disconnected'

    addMessage('system', '👋 Session ended')
  } catch (error) {
    console.error('Disconnect error:', error)
  }
}

function cleanup() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  
  stopRecording()
  
  if (playbackContext && playbackContext.state !== 'closed') {
    playbackContext.close()
    playbackContext = null
  }
}

// ==================== EVENT STREAM (SSE) ====================
function startEventStream() {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = new EventSource(config.endpoints.eventsStream(state.sessionId))

  eventSource.addEventListener('transcript', (e) => {
    const data = JSON.parse(e.data)
    addMessage(data.speaker, data.text)
  })

  eventSource.addEventListener('audio', (e) => {
    const data = JSON.parse(e.data)
    queueAudio(data.audioData, data.sampleRate || 24000)
  })

  eventSource.addEventListener('content_start', (e) => {
    const data = JSON.parse(e.data)
    if (data.role === 'ASSISTANT') {
      state.isPlaying = true
    }
  })

  eventSource.addEventListener('content_end', () => {
    state.isPlaying = false
    if (state.status === 'processing') {
      state.status = 'connected'
    }
  })

  eventSource.addEventListener('tool_log', (e) => {
    const data = JSON.parse(e.data)
    toolLogs.value.push({
      id: Date.now() + Math.random(),
      ...data
    })
  })

  eventSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data)
    console.log('Status update:', data.message)
  })

  eventSource.addEventListener('error', (e) => {
    console.error('SSE error:', e)
    // Don't reconnect on all errors, just log for now
  })
}

// ==================== AUDIO RECORDING ====================
async function toggleRecording() {
  if (state.isRecording) {
    await stopRecording()
  } else {
    await startRecording()
  }
}

async function startRecording() {
  try {
    // Notify backend
    const response = await fetch(config.endpoints.audioStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId })
    })

    if (!response.ok) {
      throw new Error('Failed to start audio')
    }

    // Request microphone (iOS requires user gesture - we're in click handler so OK)
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    // Create audio context (iOS Safari compatible)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioContext = new AudioContextClass({ sampleRate: 16000 })

    // iOS Safari: resume context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const source = audioContext.createMediaStreamSource(mediaStream)

    // Use ScriptProcessor (deprecated but widely supported, especially iOS Safari)
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1)
    source.connect(audioProcessor)
    audioProcessor.connect(audioContext.destination)

    audioProcessor.onaudioprocess = (e) => {
      if (!state.isRecording) return
      const inputData = e.inputBuffer.getChannelData(0)
      processAudioChunk(inputData)
    }

    state.isRecording = true
    state.status = 'recording'
    addMessage('system', '🎙️ Listening... Speak now!')

  } catch (error) {
    console.error('Recording error:', error)
    
    if (error.name === 'NotAllowedError') {
      addMessage('system', '⚠️ Microphone access denied. Please allow microphone access in your browser settings.')
    } else {
      addMessage('system', `❌ Recording failed: ${error.message}`)
    }
  }
}

async function stopRecording() {
  if (!state.isRecording) return

  try {
    state.isRecording = false
    state.status = 'processing'

    // Cleanup audio resources
    if (audioProcessor) {
      audioProcessor.disconnect()
      audioProcessor = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }

    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close()
      audioContext = null
    }

    // Notify backend
    await fetch(config.endpoints.audioEnd, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId })
    })

    addMessage('system', '⏳ Processing your request...')

  } catch (error) {
    console.error('Stop recording error:', error)
  }
}

async function processAudioChunk(audioData) {
  try {
    // Calculate audio level for visualizer
    const rms = Math.sqrt(audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length)
    state.audioLevel = Math.min(1, rms * 5)

    // Convert Float32Array to Int16Array (PCM)
    const pcmData = new Int16Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]))
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    // Convert to base64
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)))

    // Send to backend
    await fetch(config.endpoints.audioChunk, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        audioData: base64Audio,
        format: 'pcm',
        sampleRate: 16000,
        channels: 1
      })
    })
  } catch (error) {
    console.error('Audio chunk error:', error)
  }
}

// ==================== AUDIO PLAYBACK ====================
async function queueAudio(base64Audio, sampleRate) {
  audioQueue.push({ base64Audio, sampleRate })
  
  if (!isProcessingQueue) {
    processAudioQueue()
  }
}

async function processAudioQueue() {
  if (isProcessingQueue || audioQueue.length === 0) return
  
  isProcessingQueue = true
  
  while (audioQueue.length > 0) {
    const { base64Audio, sampleRate } = audioQueue.shift()
    await playAudio(base64Audio, sampleRate)
  }
  
  isProcessingQueue = false
}

async function playAudio(base64Audio, sampleRate = 24000) {
  try {
    // Initialize playback context (iOS Safari compatible)
    if (!playbackContext || playbackContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      playbackContext = new AudioContextClass({ sampleRate })
    }

    // iOS Safari: resume if suspended
    if (playbackContext.state === 'suspended') {
      await playbackContext.resume()
    }

    // Decode base64 to binary
    const binaryString = atob(base64Audio)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Convert to Int16Array (PCM)
    const int16Array = new Int16Array(bytes.buffer)

    // Create audio buffer
    const audioBuffer = playbackContext.createBuffer(1, int16Array.length, sampleRate)
    const channelData = audioBuffer.getChannelData(0)

    // Normalize PCM data
    for (let i = 0; i < int16Array.length; i++) {
      channelData[i] = int16Array[i] / 32768.0
    }

    // Create and play source
    const source = playbackContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(playbackContext.destination)
    
    return new Promise((resolve) => {
      source.onended = resolve
      source.start(0)
    })
  } catch (error) {
    console.error('Playback error:', error)
  }
}

// ==================== MESSAGES ====================
function addMessage(type, text) {
  messages.value.push({
    id: Date.now() + Math.random(),
    type,
    text,
    timestamp: new Date()
  })
  
  // Auto-scroll
  nextTick(() => {
    if (transcriptBox.value) {
      transcriptBox.value.scrollToBottom()
    }
  })
}

function clearMessages() {
  messages.value = [
    { id: Date.now(), type: 'system', text: 'Transcript cleared' }
  ]
  toolLogs.value = []
}
</script>

<template>
  <div class="app">
    <!-- Background with animated gradient -->
    <div class="background">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- Main container -->
    <div class="container">
      <!-- Header -->
      <header class="header">
        <div class="logo">
          <span class="logo-icon">🎙️</span>
          <h1>Nova Sonic</h1>
        </div>
        <StatusBadge :status="state.status" :text="statusText" />
      </header>

      <!-- iOS Warning -->
      <div v-if="isIOS && state.status === 'disconnected'" class="ios-notice">
        📱 Tap Connect and allow microphone access when prompted
      </div>

      <!-- Main Controls -->
      <div class="controls">
        <!-- Giant Record Button -->
        <button 
          class="record-button"
          :class="{ 
            recording: state.isRecording,
            disabled: !canRecord,
            processing: state.status === 'processing'
          }"
          :disabled="!canRecord"
          @click="toggleRecording"
        >
          <div class="record-button-inner">
            <div class="record-icon" :class="{ active: state.isRecording }">
              <span v-if="state.status === 'processing'" class="spinner"></span>
              <span v-else-if="state.isRecording">⏹️</span>
              <span v-else>🎙️</span>
            </div>
            <div class="record-text">
              <template v-if="state.status === 'processing'">Processing...</template>
              <template v-else-if="state.isRecording">Tap to Stop</template>
              <template v-else-if="canRecord">Tap to Speak</template>
              <template v-else>Connect First</template>
            </div>
          </div>
          
          <!-- Pulse animation when recording -->
          <div v-if="state.isRecording" class="pulse-ring"></div>
          <div v-if="state.isRecording" class="pulse-ring delay-1"></div>
          <div v-if="state.isRecording" class="pulse-ring delay-2"></div>
        </button>

        <!-- Audio Visualizer -->
        <AudioVisualizer 
          :active="state.isRecording" 
          :level="state.audioLevel"
          :isPlaying="state.isPlaying"
        />

        <!-- Connect/Disconnect Buttons -->
        <div class="button-row">
          <button 
            class="btn btn-primary"
            :disabled="!canConnect"
            @click="connect"
          >
            <span class="btn-icon">🔗</span>
            Connect
          </button>
          <button 
            class="btn btn-danger"
            :disabled="!canDisconnect"
            @click="disconnect"
          >
            <span class="btn-icon">👋</span>
            End Session
          </button>
        </div>
      </div>

      <!-- Transcript Section -->
      <section class="transcript-section">
        <div class="section-header">
          <h2>💬 Conversation</h2>
          <button class="clear-btn" @click="clearMessages">Clear</button>
        </div>
        <TranscriptBox ref="transcriptBox" :messages="messages" />
      </section>

      <!-- Tool Logs (collapsed by default) -->
      <ToolLog v-if="toolLogs.length > 0" :logs="toolLogs" />

      <!-- Session Info -->
      <footer class="session-info">
        <div class="info-row">
          <span class="info-label">Session</span>
          <span class="info-value">{{ state.sessionId ? state.sessionId.slice(0, 12) + '...' : 'None' }}</span>
        </div>
        <div v-if="state.bedrockSessionId" class="info-row">
          <span class="info-label">Bedrock</span>
          <span class="info-value">{{ state.bedrockSessionId.slice(0, 12) + '...' }}</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style>
/* ==================== RESET & BASE ==================== */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

:root {
  /* Color palette - Dark sophisticated theme */
  --bg-primary: #0a0e17;
  --bg-secondary: #111827;
  --bg-card: rgba(17, 24, 39, 0.8);
  --bg-glass: rgba(255, 255, 255, 0.03);
  
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --accent-pink: #ec4899;
  --accent-cyan: #06b6d4;
  --accent-green: #10b981;
  --accent-red: #ef4444;
  --accent-yellow: #f59e0b;
  
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
  --gradient-recording: linear-gradient(135deg, var(--accent-pink), var(--accent-red));
  --gradient-success: linear-gradient(135deg, var(--accent-cyan), var(--accent-green));
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 40px rgba(59, 130, 246, 0.3);
  
  /* Spacing */
  --spacing-xs: 0.5rem;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
  
  /* Border radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-full: 9999px;
  
  /* Typography */
  --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
}

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ==================== BACKGROUND ==================== */
.background {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.4;
  animation: float 20s ease-in-out infinite;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: var(--accent-blue);
  top: -200px;
  right: -200px;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: var(--accent-purple);
  bottom: -150px;
  left: -150px;
  animation-delay: -7s;
}

.orb-3 {
  width: 400px;
  height: 400px;
  background: var(--accent-pink);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -14s;
  opacity: 0.2;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.05); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

/* ==================== APP LAYOUT ==================== */
.app {
  height: 100vh;
  height: 100dvh; /* Dynamic viewport for iOS Safari */
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-lg);
  padding-bottom: env(safe-area-inset-bottom, var(--spacing-lg));
  position: relative;
  z-index: 1;
}

.container {
  width: 100%;
  max-width: 560px;
  height: 100%;
  max-height: 900px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-xl);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* ==================== HEADER ==================== */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  font-size: 2rem;
}

.logo h1 {
  font-size: 1.75rem;
  font-weight: 600;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ==================== iOS NOTICE ==================== */
.ios-notice {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  color: var(--accent-yellow);
  text-align: center;
  flex-shrink: 0;
}

/* ==================== CONTROLS ==================== */
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
  flex-shrink: 0;
}

/* ==================== RECORD BUTTON ==================== */
.record-button {
  position: relative;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  border: none;
  background: var(--gradient-primary);
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  touch-action: manipulation;
}

.record-button:hover:not(:disabled) {
  transform: scale(1.02);
}

.record-button:active:not(:disabled) {
  transform: scale(0.98);
}

.record-button.recording {
  background: var(--gradient-recording);
  box-shadow: var(--shadow-lg), 0 0 60px rgba(239, 68, 68, 0.4);
}

.record-button.processing {
  background: var(--gradient-success);
  box-shadow: var(--shadow-lg), 0 0 40px rgba(6, 182, 212, 0.3);
}

.record-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: var(--shadow-md);
}

.record-button-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  height: 100%;
}

.record-icon {
  font-size: 3.5rem;
  line-height: 1;
  transition: transform 0.3s ease;
}

.record-icon.active {
  animation: bounce 0.6s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.record-text {
  font-size: 0.9rem;
  font-weight: 500;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Spinner for processing */
.spinner {
  display: inline-block;
  width: 3rem;
  height: 3rem;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pulse rings */
.pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.4);
  animation: pulse 2s ease-out infinite;
}

.pulse-ring.delay-1 { animation-delay: 0.5s; }
.pulse-ring.delay-2 { animation-delay: 1s; }

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* ==================== BUTTON ROW ==================== */
.button-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  width: 100%;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  touch-action: manipulation;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 1.25rem;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: var(--shadow-md);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 4px 20px rgba(59, 130, 246, 0.3);
}

.btn-danger {
  background: var(--bg-glass);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.5);
}

/* ==================== TRANSCRIPT SECTION ==================== */
.transcript-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
  flex-shrink: 0;
}

.section-header h2 {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.clear-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

/* ==================== SESSION INFO ==================== */
.session-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-top: var(--spacing-md);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.info-label {
  color: var(--text-muted);
}

.info-value {
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
}

/* ==================== IPAD SPECIFIC ==================== */
@media (min-width: 768px) and (max-width: 1024px) {
  .container {
    max-width: 700px;
    padding: var(--spacing-2xl);
  }

  .record-button {
    width: 220px;
    height: 220px;
  }

  .record-icon {
    font-size: 4.5rem;
  }

  .record-text {
    font-size: 1.1rem;
  }

  .btn {
    padding: var(--spacing-lg) var(--spacing-xl);
    font-size: 1.1rem;
  }
}

/* ==================== MOBILE ==================== */
@media (max-width: 480px) {
  .app {
    padding: var(--spacing-sm);
  }

  .container {
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
  }

  .record-button {
    width: 150px;
    height: 150px;
  }

  .record-icon {
    font-size: 2.5rem;
  }

  .logo h1 {
    font-size: 1.5rem;
  }
}

/* ==================== LANDSCAPE MODE ==================== */
@media (max-height: 600px) and (orientation: landscape) {
  .container {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: 100%;
    max-height: 100%;
    gap: var(--spacing-md);
  }

  .header {
    width: 100%;
  }

  .controls {
    width: 45%;
    gap: var(--spacing-sm);
  }

  .transcript-section {
    width: 50%;
  }

  .record-button {
    width: 120px;
    height: 120px;
  }

  .record-icon {
    font-size: 2rem;
  }

  .button-row {
    grid-template-columns: 1fr;
    gap: var(--spacing-sm);
  }
}
</style>

