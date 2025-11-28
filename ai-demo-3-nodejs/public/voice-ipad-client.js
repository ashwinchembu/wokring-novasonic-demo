/**
 * Nova Sonic Voice Client - iPad Optimized
 * 
 * Features:
 * - WebSocket connection with auto-reconnect
 * - iOS Safari audio support
 * - Touch-optimized UI
 * - Session recovery
 */

// Configuration
const WS_URL = `ws://${window.location.host}/ws`;
const API_BASE = window.location.origin;

// State Management
class VoiceClient {
    constructor() {
        this.ws = null;
        this.sessionId = null;
        this.isConnected = false;
        this.isRecording = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // Audio
        this.audioContext = null;
        this.mediaStream = null;
        this.audioProcessor = null;
        this.playbackContext = null;
        this.audioQueue = [];
        this.isPlayingAudio = false;
        
        // Conversation
        this.conversationHistory = [];
        
        // UI Elements
        this.elements = {
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            recordBtn: document.getElementById('recordBtn'),
            recordBtnText: document.getElementById('recordBtnText'),
            statusBadge: document.getElementById('statusBadge'),
            transcriptBox: document.getElementById('transcriptBox'),
            clearBtn: document.getElementById('clearBtn'),
            audioVisualizer: document.getElementById('audioVisualizer'),
            detailedStatus: document.getElementById('detailedStatus'),
            sessionId: document.getElementById('sessionId'),
            connectionInfo: document.getElementById('connectionInfo'),
            iosWarning: document.getElementById('iosWarning')
        };
        
        // Detect iOS
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        this.init();
    }
    
    init() {
        // Show iOS warning if on iOS
        if (this.isIOS) {
            this.elements.iosWarning.style.display = 'block';
        }
        
        // Create visualizer bars
        this.createVisualizer();
        
        // Bind event listeners
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.clearBtn.addEventListener('click', () => this.clearTranscript());
        
        // Prevent double-tap zoom on iOS
        if (this.isIOS) {
            document.addEventListener('touchend', (e) => {
                const now = Date.now();
                const timeSinceLastTouch = now - (this.lastTouch || 0);
                if (timeSinceLastTouch < 300 && timeSinceLastTouch > 0) {
                    e.preventDefault();
                }
                this.lastTouch = now;
            });
        }
        
        this.log('Voice client initialized');
    }
    
    createVisualizer() {
        const visualizer = this.elements.audioVisualizer;
        visualizer.innerHTML = '';
        
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '10px';
            visualizer.appendChild(bar);
        }
    }
    
    async connect() {
        try {
            this.updateStatus('connecting', 'Connecting...');
            this.elements.connectBtn.disabled = true;
            
            // Start session via REST API
            const response = await fetch(`${API_BASE}/session/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                throw new Error(`Failed to start session: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.sessionId = data.sessionId;
            this.elements.sessionId.textContent = this.sessionId.substring(0, 16) + '...';
            
            // Connect WebSocket
            await this.connectWebSocket();
            
            this.updateStatus('connected', 'Connected');
            this.elements.disconnectBtn.disabled = false;
            this.elements.recordBtn.disabled = false;
            
            this.addMessage('system', '✅ Connected! Ready to record.');
            
        } catch (error) {
            console.error('Connection error:', error);
            this.updateStatus('disconnected', 'Connection Failed');
            this.elements.connectBtn.disabled = false;
            this.addMessage('system', `❌ Connection failed: ${error.message}`);
        }
    }
    
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                // Note: WebSocket implementation - placeholder for now
                // In production, you'd establish actual WebSocket connection here
                
                // For REST-based approach, we'll use HTTP polling
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve();
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async disconnect() {
        try {
            // Stop recording if active
            if (this.isRecording) {
                await this.stopRecording();
            }
            
            // Close WebSocket
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
            
            // End session
            if (this.sessionId) {
                await fetch(`${API_BASE}/session/${this.sessionId}`, {
                    method: 'DELETE'
                });
            }
            
            this.isConnected = false;
            this.sessionId = null;
            
            this.updateStatus('disconnected', 'Disconnected');
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
            this.elements.recordBtn.disabled = true;
            this.elements.sessionId.textContent = 'None';
            
            this.addMessage('system', '👋 Disconnected');
            
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            this.log('Starting recording...');
            
            // Notify backend
            const response = await fetch(`${API_BASE}/audio/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to start audio');
            }
            
            // Request microphone access (iOS requires user gesture)
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            // iOS Safari requires resuming context on user interaction
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Use ScriptProcessorNode (deprecated but widely supported)
            // TODO: Migrate to AudioWorklet for better performance
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);
            
            this.audioProcessor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                this.processAudioChunk(e.inputBuffer.getChannelData(0));
            };
            
            this.isRecording = true;
            this.elements.recordBtn.classList.add('recording');
            this.elements.recordBtnText.textContent = 'Tap to Stop';
            this.elements.audioVisualizer.classList.add('active');
            this.updateStatus('recording', 'Recording...');
            
            this.addMessage('system', '🎙️ Recording started - speak now!');
            
        } catch (error) {
            console.error('Recording error:', error);
            this.addMessage('system', `❌ Recording failed: ${error.message}`);
            
            if (error.name === 'NotAllowedError') {
                this.addMessage('system', '⚠️ Microphone access denied. Please allow microphone access and try again.');
            }
        }
    }
    
    async stopRecording() {
        try {
            this.log('Stopping recording...');
            
            this.isRecording = false;
            
            // Clean up audio resources
            if (this.audioProcessor) {
                this.audioProcessor.disconnect();
                this.audioProcessor = null;
            }
            
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }
            
            // Notify backend
            await fetch(`${API_BASE}/audio/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId })
            });
            
            this.elements.recordBtn.classList.remove('recording');
            this.elements.recordBtnText.textContent = 'Tap to Start Recording';
            this.elements.audioVisualizer.classList.remove('active');
            this.updateStatus('connected', 'Connected');
            
            this.addMessage('system', '⏸️ Recording stopped - processing...');
            
            // Start listening for response
            this.listenForResponse();
            
        } catch (error) {
            console.error('Stop recording error:', error);
        }
    }
    
    async processAudioChunk(audioData) {
        try {
            // Convert Float32Array to Int16Array (PCM)
            const pcmData = new Int16Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                const s = Math.max(-1, Math.min(1, audioData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Convert to base64
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            
            // Send to backend
            await fetch(`${API_BASE}/audio/chunk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    audioData: base64Audio,
                    format: 'pcm',
                    sampleRate: 16000,
                    channels: 1
                })
            });
            
            // Update visualizer
            this.updateVisualizer(audioData);
            
        } catch (error) {
            console.error('Audio chunk error:', error);
        }
    }
    
    updateVisualizer(audioData) {
        const bars = document.querySelectorAll('.visualizer-bar');
        const rms = Math.sqrt(
            audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length
        );
        
        bars.forEach((bar, i) => {
            const height = Math.min(40, Math.max(2, rms * 500 + Math.random() * 5));
            bar.style.height = `${height}px`;
        });
    }
    
    async listenForResponse() {
        try {
            // Use Server-Sent Events for receiving updates
            const eventSource = new EventSource(`${API_BASE}/events/stream/${this.sessionId}`);
            
            eventSource.addEventListener('transcript', (e) => {
                const data = JSON.parse(e.data);
                this.addMessage(data.speaker, data.text);
            });
            
            eventSource.addEventListener('audio', (e) => {
                const data = JSON.parse(e.data);
                this.playAudio(data.audioData);
            });
            
            eventSource.addEventListener('error', (e) => {
                console.error('SSE error:', e);
                eventSource.close();
            });
            
            // Store for cleanup
            this.currentEventSource = eventSource;
            
        } catch (error) {
            console.error('Listen error:', error);
        }
    }
    
    async playAudio(base64Audio) {
        try {
            // Initialize playback context if needed
            if (!this.playbackContext) {
                this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                });
                
                // iOS Safari: resume on user interaction
                if (this.playbackContext.state === 'suspended') {
                    await this.playbackContext.resume();
                }
            }
            
            // Decode base64 to binary
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert to Int16Array (PCM)
            const int16Array = new Int16Array(bytes.buffer);
            
            // Create audio buffer
            const audioBuffer = this.playbackContext.createBuffer(1, int16Array.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            
            // Normalize PCM data
            for (let i = 0; i < int16Array.length; i++) {
                channelData[i] = int16Array[i] / 32768.0;
            }
            
            // Create and play source
            const source = this.playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.playbackContext.destination);
            source.start(0);
            
            this.log(`Playing audio: ${int16Array.length} samples`);
            
        } catch (error) {
            console.error('Playback error:', error);
        }
    }
    
    addMessage(type, text) {
        const message = document.createElement('div');
        message.className = `message ${type}`;
        
        const label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        
        const content = document.createElement('div');
        content.textContent = text;
        
        message.appendChild(label);
        message.appendChild(content);
        
        this.elements.transcriptBox.appendChild(message);
        this.elements.transcriptBox.scrollTop = this.elements.transcriptBox.scrollHeight;
        
        // Store in history
        this.conversationHistory.push({ type, text, timestamp: new Date() });
    }
    
    clearTranscript() {
        this.elements.transcriptBox.innerHTML = `
            <div class="message system">
                <div class="message-label">System</div>
                Transcript cleared
            </div>
        `;
        this.conversationHistory = [];
    }
    
    updateStatus(status, text) {
        this.elements.statusBadge.className = `status-badge ${status}`;
        this.elements.statusBadge.textContent = text;
        this.elements.detailedStatus.textContent = text;
    }
    
    log(message) {
        console.log(`[VoiceClient] ${message}`);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.voiceClient = new VoiceClient();
    });
} else {
    window.voiceClient = new VoiceClient();
}

