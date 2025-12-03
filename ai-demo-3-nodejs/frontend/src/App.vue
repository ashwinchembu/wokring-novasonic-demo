<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import StatusBadge from './components/StatusBadge.vue'
import AudioVisualizer from './components/AudioVisualizer.vue'
import TranscriptBox from './components/TranscriptBox.vue'
import ToolLog from './components/ToolLog.vue'
import HcpList from './components/HcpList.vue'
import CallLogTable from './components/CallLogTable.vue'
import CallHistoryTable from './components/CallHistoryTable.vue'
import StatsPanel from './components/StatsPanel.vue'
import JsonModal from './components/JsonModal.vue'
import TextInput from './components/TextInput.vue'
import config from './config'

// ==================== STATE ====================
const state = reactive({
  status: 'disconnected', // disconnected, connecting, connected, recording, processing
  sessionId: null,
  bedrockSessionId: localStorage.getItem('bedrockSessionId') || null,
  isRecording: false,
  isPlaying: false,
  audioLevel: 0,
  mode: 'voice', // 'voice' or 'text'
  showAdvanced: false, // toggle for advanced panels
})

const messages = ref([
  { id: Date.now(), type: 'system', text: 'Tap "Connect" to begin your conversation' }
])

const toolLogs = ref([])
const transcriptBox = ref(null)
const isIOS = ref(false)

// Stats tracking
const stats = reactive({
  audioChunks: 0,
  transcripts: 0,
  audioResponses: 0,
  toolCalls: 0
})

// Call log data tracking (matches voice-test.html schema)
const callLogData = reactive({
  call_channel: '',
  discussion_topic: '',
  status: '',
  account: '',
  id: '',
  adverse_event: false,
  adverse_event_details: null,
  noncompliance_event: false,
  noncompliance_description: '',
  call_notes: '',
  call_date: null,
  call_time: null,
  product: '',
  hcp_name: '',
  hcp_id: '',
  call_follow_up_task: {
    task_type: '',
    description: '',
    due_date: '',
    assigned_to: ''
  }
})

const requiredFields = ['hcp_name', 'call_date', 'call_time', 'product']

// Call history
const callHistory = ref([])
const historyLoading = ref(false)

// JSON Modal state
const modalState = reactive({
  visible: false,
  data: null,
  index: null
})

// Notification state
const notifications = ref([])

// Audio state
let audioContext = null
let mediaStream = null
let audioProcessor = null
let playbackContext = null
let eventSource = null
let websocket = null

// Improved audio playback with seamless buffering
let nextPlayTime = 0
const BUFFER_AHEAD_TIME = 0.05 // 50ms buffer to prevent gaps

// Auto-save timeout
let autoSaveTimeout = null

// ==================== COMPUTED ====================
const canConnect = computed(() => state.status === 'disconnected')
const canDisconnect = computed(() => ['connected', 'recording', 'processing'].includes(state.status))
const canRecord = computed(() => ['connected', 'processing'].includes(state.status) && state.mode === 'voice')
const canSendText = computed(() => ['connected', 'processing'].includes(state.status) && state.mode === 'text')

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

const hasRecoverySession = computed(() => !!state.bedrockSessionId && state.status === 'disconnected')

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
  
  // Load call history from Redshift on mount
  loadHistoryFromRedshift()
})

onUnmounted(() => {
  cleanup()
})

// ==================== NOTIFICATIONS ====================
function showNotification(message, type = 'info') {
  const id = Date.now() + Math.random()
  notifications.value.push({ id, message, type })
  
  setTimeout(() => {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }, 4000)
}

// ==================== MODE SWITCHING ====================
function switchMode(mode) {
  if (state.mode === mode) return
  
  state.mode = mode
  
  if (mode === 'voice') {
    // Close WebSocket if open
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close()
      websocket = null
    }
  } else {
    // Init WebSocket for text mode if session active
    if (state.sessionId) {
      initWebSocket()
    }
  }
  
  addMessage('system', `Switched to ${mode} mode`)
}

// ==================== CONNECTION ====================
async function connect() {
  try {
    state.status = 'connecting'
    addMessage('system', '🔄 Connecting to Nova Sonic...')
    
    // Initialize audio context on user interaction (iOS requirement)
    initPlaybackContext()

    const requestBody = {}
    
    // Try to recover session if we have a stored Bedrock session
    if (state.bedrockSessionId) {
      requestBody.existingBedrockSessionId = state.bedrockSessionId
      console.log('🔄 Attempting session recovery with:', state.bedrockSessionId)
    }

    const response = await fetch(config.endpoints.sessionStart, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.statusText}`)
    }

    const data = await response.json()
    state.sessionId = data.sessionId
    
    if (data.bedrockSessionId) {
      state.bedrockSessionId = data.bedrockSessionId
      localStorage.setItem('bedrockSessionId', data.bedrockSessionId)
    }
    
    state.status = 'connected'

    // Start SSE stream for voice mode
    startEventStream()
    
    // Init WebSocket for text mode if that's the current mode
    if (state.mode === 'text') {
      initWebSocket()
    }

    addMessage('system', '✅ Connected! Tap the microphone to speak.')
    
    // Show recovery message if we recovered history
    if (data.conversationHistory && data.conversationHistory.length > 0) {
      addMessage('system', `🔄 Session recovered! Loaded ${data.conversationHistory.length} previous turns.`)
      showNotification('Session recovered from previous conversation!', 'success')
    }
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
    // Keep bedrockSessionId for potential recovery
    state.status = 'disconnected'

    addMessage('system', '👋 Session ended - Bedrock session preserved for recovery')
  } catch (error) {
    console.error('Disconnect error:', error)
  }
}

function cleanup() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  
  if (websocket) {
    websocket.close()
    websocket = null
  }
  
  stopRecording()
  
  if (playbackContext && playbackContext.state !== 'closed') {
    playbackContext.close()
    playbackContext = null
  }
  
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
    autoSaveTimeout = null
  }
}

function clearStoredSession() {
  localStorage.removeItem('bedrockSessionId')
  state.bedrockSessionId = null
  addMessage('system', '🔄 Stored session cleared - next session will start fresh')
}

// ==================== WEBSOCKET (Text Mode) ====================
function initWebSocket() {
  if (websocket && websocket.readyState === WebSocket.OPEN) return
  
  console.log('🔌 Connecting to WebSocket:', config.wsUrl + '/ws')
  websocket = new WebSocket(config.wsUrl + '/ws')
  
  websocket.onopen = () => {
    console.log('✅ WebSocket connected')
    addMessage('system', '🔌 WebSocket connected')
    
    // Connect to session
    websocket.send(JSON.stringify({
      type: 'connect_session',
      sessionId: state.sessionId
    }))
  }
  
  websocket.onmessage = (event) => {
    const data = JSON.parse(event.data)
    console.log('📨 WebSocket message:', data.type)
    
    switch (data.type) {
      case 'welcome':
      case 'session_connected':
        addMessage('system', data.message || '✅ Connected to session')
        break
      case 'transcript':
        addMessage(data.speaker, data.text, data.timestamp)
        parseTranscriptForData(data.text, data.speaker)
        stats.transcripts++
        break
      case 'processing':
        addMessage('system', data.message)
        break
      case 'error':
        addMessage('system', `❌ Error: ${data.message}`)
        break
    }
  }
  
  websocket.onerror = (error) => {
    console.error('❌ WebSocket error:', error)
    addMessage('system', '❌ WebSocket connection error')
  }
  
  websocket.onclose = () => {
    console.log('🔌 WebSocket closed')
    if (state.sessionId) {
      addMessage('system', '🔌 WebSocket disconnected')
    }
  }
}

async function sendTextMessage(text) {
  if (!text || !websocket || websocket.readyState !== WebSocket.OPEN) {
    showNotification('WebSocket not connected', 'error')
    return
  }
  
  console.log('📤 Sending text message:', text)
  
  websocket.send(JSON.stringify({
    type: 'text_message',
    text: text
  }))
  
  addMessage('user', text)
  stats.transcripts++
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
    parseTranscriptForData(data.text, data.speaker)
    stats.transcripts++
  })

  eventSource.addEventListener('audio', (e) => {
    const data = JSON.parse(e.data)
    queueAudio(data.audioData, data.sampleRate || 24000)
    stats.audioResponses++
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
    // Reset audio timing for next response
    resetAudioPlayback()
  })

  eventSource.addEventListener('tool_log', (e) => {
    const data = JSON.parse(e.data)
    toolLogs.value.push({
      id: Date.now() + Math.random(),
      ...data
    })
    stats.toolCalls++
    
    // Handle tool results for data extraction
    if (data.type === 'tool_result') {
      handleToolResult(data.toolName, data.result)
    }
  })

  eventSource.addEventListener('status', (e) => {
    const data = JSON.parse(e.data)
    console.log('Status update:', data.message)
  })

  eventSource.addEventListener('error', (e) => {
    console.error('SSE error:', e)
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
    
    stats.audioChunks++
  } catch (error) {
    console.error('Audio chunk error:', error)
  }
}

// ==================== AUDIO PLAYBACK ====================
function initPlaybackContext() {
  if (!playbackContext || playbackContext.state === 'closed') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    playbackContext = new AudioContextClass()
  }
  
  if (playbackContext.state === 'suspended') {
    playbackContext.resume()
  }
  
  return playbackContext
}

async function queueAudio(base64Audio, sampleRate) {
  // Initialize playback context if needed
  const ctx = initPlaybackContext()

  // Decode and schedule audio immediately
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Audio)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Convert to Int16Array (PCM)
    const int16Array = new Int16Array(bytes.buffer)

    // Create audio buffer at source sample rate, then let browser resample
    const audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate)
    const channelData = audioBuffer.getChannelData(0)

    // Normalize PCM data
    for (let i = 0; i < int16Array.length; i++) {
      channelData[i] = int16Array[i] / 32768.0
    }

    // Schedule playback with precise timing to avoid gaps
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    const currentTime = ctx.currentTime
    
    // If we're behind, catch up; otherwise schedule ahead
    if (nextPlayTime < currentTime) {
      nextPlayTime = currentTime + BUFFER_AHEAD_TIME
    }

    source.start(nextPlayTime)
    nextPlayTime += audioBuffer.duration

  } catch (error) {
    console.error('Playback error:', error)
  }
}

function resetAudioPlayback() {
  nextPlayTime = 0
  if (playbackContext && playbackContext.state !== 'closed') {
    nextPlayTime = playbackContext.currentTime
  }
}

// ==================== CALL LOG DATA EXTRACTION ====================
function parseTranscriptForData(text, speaker) {
  if (speaker !== 'assistant') return

  let dataUpdated = false

  // Look for HCP name mentions
  const hcpMatch = text.match(/(?:found|identified|confirmed)\s+(?:Dr\.|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i)
  if (hcpMatch && !callLogData.hcp_name) {
    callLogData.hcp_name = 'Dr. ' + hcpMatch[1]
    dataUpdated = true
    console.log('✅ Extracted HCP name from text:', callLogData.hcp_name)
  }

  // Look for dates
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|today|yesterday)\b/i)
  if (dateMatch && !callLogData.call_date) {
    callLogData.call_date = dateMatch[1]
    dataUpdated = true
    console.log('✅ Extracted date from text:', callLogData.call_date)
  }

  // Look for time
  const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i)
  if (timeMatch && !callLogData.call_time) {
    callLogData.call_time = timeMatch[1]
    dataUpdated = true
    console.log('✅ Extracted time from text:', callLogData.call_time)
  }

  // Look for product mentions
  const productPatterns = [
    /(?:product|medication|drug|treatment)\s+(?:is|was)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:discussed|about)\s+([A-Z][a-z]{3,}(?:\s+[A-Z][a-z]+)?)/,
    /(?:product|medication|drug|treatment):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  ]
  
  for (const pattern of productPatterns) {
    const match = text.match(pattern)
    if (match && !callLogData.product) {
      let productName = match[1].trim()
      productName = productName.replace(/^(was|is|discussed|about|the)\s+/gi, '')
      
      if (productName.length > 2) {
        callLogData.product = productName
        dataUpdated = true
        console.log('✅ Extracted product from text:', callLogData.product)
        break
      }
    }
  }

  if (dataUpdated) {
    checkAutoSave()
  }
}

function handleToolResult(toolName, result) {
  console.log('🔧 handleToolResult:', toolName, result)
  
  let dataUpdated = false
  
  if (toolName === 'lookupHcpTool' && result && result.found) {
    if (result.name && !callLogData.hcp_name) {
      callLogData.hcp_name = result.name
      dataUpdated = true
    }
    if (result.hcp_id && !callLogData.hcp_id) {
      callLogData.hcp_id = result.hcp_id
      dataUpdated = true
    }
    if (result.hco_name && !callLogData.account) {
      callLogData.account = result.hco_name
      dataUpdated = true
    }
  } else if (toolName === 'getDateTool' && result) {
    if (result.date && !callLogData.call_date) {
      callLogData.call_date = result.date
      dataUpdated = true
    }
    if (result.time && !callLogData.call_time) {
      callLogData.call_time = result.time
      dataUpdated = true
    }
  } else if (toolName === 'insertCallTool' && result) {
    if (result.ok) {
      console.log('🎯 insertCallTool succeeded! Auto-saving to history...')
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout)
        autoSaveTimeout = null
      }
      autoSaveCallLog()
      return
    }
  }
  
  if (dataUpdated) {
    checkAutoSave()
  }
}

function checkAutoSave() {
  const hasAllRequired = requiredFields.every(field => {
    const value = callLogData[field]
    return value && value !== '' && value !== null
  })
  
  if (hasAllRequired) {
    console.log('🎯 All required fields collected!')
    
    if (!autoSaveTimeout) {
      console.log('⏱️ Auto-save scheduled in 5 seconds...')
      autoSaveTimeout = setTimeout(() => {
        autoSaveCallLog()
        autoSaveTimeout = null
      }, 5000)
    }
  }
}

function autoSaveCallLog() {
  console.log('💾 AUTO-SAVING call log...')
  
  // Check if already saved this session
  const lastSaved = callHistory.value.length > 0 ? callHistory.value[callHistory.value.length - 1] : null
  if (lastSaved && lastSaved.session_id === state.sessionId) {
    console.log('ℹ️ Call already saved for this session')
    return
  }
  
  const callLogCopy = {
    ...JSON.parse(JSON.stringify(callLogData)),
    exported_at: new Date().toISOString(),
    session_id: state.sessionId,
    auto_saved: true
  }
  
  callHistory.value.push(callLogCopy)
  saveHistoryToLocalStorage()
  
  addMessage('system', `💾 Call log #${callHistory.value.length} auto-saved!`)
  showNotification('Call Log Auto-Saved!', 'success')
}

// ==================== CALL HISTORY ====================
async function loadHistoryFromRedshift() {
  try {
    historyLoading.value = true
    console.log('🔄 Loading call history from Redshift...')
    
    const response = await fetch(config.endpoints.callHistory)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (data.calls && Array.isArray(data.calls)) {
      callHistory.value = data.calls.map(call => ({
        call_pk: call.call_pk,
        hcp_name: call.id,
        hcp_id: call.id,
        account: call.account,
        product: call.product,
        call_date: call.call_date ? new Date(call.call_date).toISOString().split('T')[0] : null,
        call_time: call.call_time,
        call_channel: call.call_channel,
        discussion_topic: call.discussion_topic,
        status: call.status,
        adverse_event: call.adverse_event,
        noncompliance_event: call.noncompliance_event,
        call_notes: call.call_notes,
        followup_task_type: call.followup_task_type,
        created_at: call.created_at,
        source: 'redshift'
      }))
      
      console.log(`✅ Loaded ${callHistory.value.length} calls from Redshift`)
    } else {
      // Try loading from localStorage if Redshift is empty
      loadHistoryFromLocalStorage()
    }
  } catch (e) {
    console.error('❌ Failed to load from Redshift:', e)
    loadHistoryFromLocalStorage()
  } finally {
    historyLoading.value = false
  }
}

function loadHistoryFromLocalStorage() {
  try {
    const stored = localStorage.getItem('callHistory')
    if (stored) {
      callHistory.value = JSON.parse(stored)
      console.log(`📂 Loaded ${callHistory.value.length} calls from localStorage`)
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
  }
}

function saveHistoryToLocalStorage() {
  try {
    localStorage.setItem('callHistory', JSON.stringify(callHistory.value))
    console.log(`💾 Saved ${callHistory.value.length} calls to localStorage`)
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
  }
}

// ==================== EXPORT FUNCTIONS ====================
function exportCallLogJson() {
  const callLogCopy = {
    ...JSON.parse(JSON.stringify(callLogData)),
    exported_at: new Date().toISOString(),
    session_id: state.sessionId
  }
  
  callHistory.value.push(callLogCopy)
  saveHistoryToLocalStorage()
  
  downloadJson(callLogCopy, `call-log-${formatTimestampForFile(new Date())}.json`)
  addMessage('system', `💾 Call log #${callHistory.value.length} saved and exported`)
  showNotification('Call log exported!', 'success')
}

function clearCallLogData() {
  Object.assign(callLogData, {
    call_channel: '',
    discussion_topic: '',
    status: '',
    account: '',
    id: '',
    adverse_event: false,
    adverse_event_details: null,
    noncompliance_event: false,
    noncompliance_description: '',
    call_notes: '',
    call_date: null,
    call_time: null,
    product: '',
    hcp_name: '',
    hcp_id: '',
    call_follow_up_task: {
      task_type: '',
      description: '',
      due_date: '',
      assigned_to: ''
    }
  })
  addMessage('system', '🗑️ Call log data cleared')
}

function testSaveCallLog() {
  const testCall = {
    hcp_name: 'Dr. Test ' + Date.now(),
    hcp_id: 'TEST-' + Date.now(),
    call_date: new Date().toISOString().split('T')[0],
    call_time: new Date().toTimeString().split(' ')[0],
    product: 'Test Product',
    exported_at: new Date().toISOString(),
    session_id: 'test-session',
    test: true
  }
  
  callHistory.value.push(testCall)
  saveHistoryToLocalStorage()
  
  addMessage('system', `🧪 Test call #${callHistory.value.length} added`)
  showNotification('Test call saved!', 'success')
}

function viewCallLog(index) {
  modalState.data = callHistory.value[index]
  modalState.index = index
  modalState.visible = true
}

function downloadCallLog(index) {
  const log = callHistory.value[index]
  const timestamp = formatTimestampForFile(new Date(log.exported_at || log.created_at || Date.now()))
  downloadJson(log, `call-log-${index + 1}-${timestamp}.json`)
}

function deleteCallLog(index) {
  if (confirm(`Delete call log #${index + 1}?`)) {
    callHistory.value.splice(index, 1)
    saveHistoryToLocalStorage()
    addMessage('system', `🗑️ Call log #${index + 1} deleted`)
  }
}

function exportAllHistory() {
  if (callHistory.value.length === 0) {
    showNotification('No call history to export', 'error')
    return
  }
  
  const timestamp = formatTimestampForFile(new Date())
  downloadJson(callHistory.value, `call-history-all-${timestamp}.json`)
  addMessage('system', `📥 Exported ${callHistory.value.length} call logs`)
}

function downloadJson(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatTimestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-').substring(0, 19)
}

// ==================== MESSAGES ====================
function addMessage(type, text, timestamp = null) {
  messages.value.push({
    id: Date.now() + Math.random(),
    type,
    text,
    timestamp: timestamp || new Date()
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
  
  // Reset stats
  Object.assign(stats, {
    audioChunks: 0,
    transcripts: 0,
    audioResponses: 0,
    toolCalls: 0
  })
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

    <!-- Notifications -->
    <TransitionGroup name="notification" tag="div" class="notifications">
      <div 
        v-for="n in notifications" 
        :key="n.id"
        class="notification"
        :class="n.type"
      >
        {{ n.message }}
      </div>
    </TransitionGroup>

    <!-- Main container - scrollable on mobile -->
    <div class="container" :class="{ 'show-advanced': state.showAdvanced }">
      <!-- Header -->
      <header class="header">
        <div class="logo">
          <span class="logo-icon">🎙️</span>
          <h1>Nova Sonic</h1>
        </div>
        <StatusBadge :status="state.status" :text="statusText" />
      </header>

      <!-- Session Recovery Notice -->
      <div v-if="hasRecoverySession" class="recovery-notice">
        🔄 Previous session available 
        <button @click="clearStoredSession">Clear</button>
      </div>

      <!-- iOS Warning -->
      <div v-if="isIOS && state.status === 'disconnected'" class="ios-notice">
        📱 Tap Connect and allow microphone access when prompted
      </div>

      <!-- Mode Selector -->
      <div class="mode-selector">
        <button 
          class="mode-btn" 
          :class="{ active: state.mode === 'voice' }"
          @click="switchMode('voice')"
        >
          🎙️ Voice
        </button>
        <button 
          class="mode-btn" 
          :class="{ active: state.mode === 'text' }"
          @click="switchMode('text')"
        >
          ⌨️ Text
        </button>
      </div>

      <!-- Main Controls -->
      <div class="controls">
        <!-- Voice Mode: Giant Record Button -->
        <template v-if="state.mode === 'voice'">
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
        </template>

        <!-- Text Mode: Text Input -->
        <template v-else>
          <TextInput 
            :disabled="!canSendText"
            @send="sendTextMessage"
          />
        </template>

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

      <!-- Toggle Advanced Panels -->
      <button 
        class="toggle-advanced-btn"
        @click="state.showAdvanced = !state.showAdvanced"
      >
        {{ state.showAdvanced ? '▲ Hide Details' : '▼ Show Call Log & History' }}
      </button>

      <!-- Advanced Panels (HCP, Call Log, History, Stats) -->
      <Transition name="slide">
        <div v-if="state.showAdvanced" class="advanced-panels">
          <!-- Stats Panel -->
          <StatsPanel :stats="stats" />
          
          <!-- HCP List -->
          <HcpList />
          
          <!-- Call Log Table -->
          <CallLogTable 
            :callLog="callLogData"
            @export="exportCallLogJson"
            @clear="clearCallLogData"
            @testSave="testSaveCallLog"
          />
          
          <!-- Call History Table -->
          <CallHistoryTable 
            :history="callHistory"
            :loading="historyLoading"
            @view="viewCallLog"
            @download="downloadCallLog"
            @delete="deleteCallLog"
            @refresh="loadHistoryFromRedshift"
            @exportAll="exportAllHistory"
          />
        </div>
      </Transition>

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

    <!-- JSON Modal -->
    <JsonModal 
      :visible="modalState.visible"
      :data="modalState.data"
      @close="modalState.visible = false"
      @download="modalState.index !== null && downloadCallLog(modalState.index)"
    />
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
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ==================== NOTIFICATIONS ==================== */
.notifications {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification {
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 500;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.notification.success {
  background: var(--accent-green);
  color: white;
}

.notification.error {
  background: var(--accent-red);
  color: white;
}

.notification.info {
  background: var(--accent-blue);
  color: white;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100px);
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
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: var(--spacing-lg);
  padding-bottom: env(safe-area-inset-bottom, var(--spacing-lg));
  position: relative;
  z-index: 1;
}

.container {
  width: 100%;
  max-width: 700px;
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
}

.container.show-advanced {
  max-width: 900px;
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

/* ==================== NOTICES ==================== */
.recovery-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  color: var(--accent-green);
}

.recovery-notice button {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.ios-notice {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  color: var(--accent-yellow);
  text-align: center;
}

/* ==================== MODE SELECTOR ==================== */
.mode-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

.mode-btn {
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.mode-btn.active {
  background: var(--gradient-primary);
  border-color: transparent;
  color: white;
  transform: scale(1.02);
}

/* ==================== CONTROLS ==================== */
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
}

/* ==================== RECORD BUTTON ==================== */
.record-button {
  position: relative;
  width: 160px;
  height: 160px;
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
  font-size: 3rem;
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
  font-size: 0.85rem;
  font-weight: 500;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Spinner for processing */
.spinner {
  display: inline-block;
  width: 2.5rem;
  height: 2.5rem;
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
  display: flex;
  flex-direction: column;
  min-height: 200px;
  max-height: 350px;
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

/* ==================== TOGGLE ADVANCED ==================== */
.toggle-advanced-btn {
  width: 100%;
  padding: var(--spacing-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-advanced-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

/* ==================== ADVANCED PANELS ==================== */
.advanced-panels {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
}

/* ==================== SESSION INFO ==================== */
.session-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-top: var(--spacing-md);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
    padding: var(--spacing-2xl);
  }

  .record-button {
    width: 200px;
    height: 200px;
  }

  .record-icon {
    font-size: 4rem;
  }

  .record-text {
    font-size: 1rem;
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
    width: 140px;
    height: 140px;
  }

  .record-icon {
    font-size: 2.5rem;
  }

  .logo h1 {
    font-size: 1.5rem;
  }
  
  .transcript-section {
    max-height: 250px;
  }
}
</style>
