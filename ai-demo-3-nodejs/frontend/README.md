# Nova Sonic Voice Frontend (Vue.js)

iPad Safari-optimized Vue.js frontend for the Nova Sonic Voice API.

## Quick Start

### Development

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000` with API proxy to backend at `:8000`

### Production Build

```bash
npm run build
```

Builds to `../public/vue-app/` directory, served by backend at `/app`

## iPad Safari Compatibility

This frontend is specifically optimized for iPad Safari:

### Audio Handling
- `AudioContext` created on user gesture (button tap)
- Context resume when suspended (iOS requirement)
- `ScriptProcessor` for wide Safari compatibility
- Audio queue for sequential playback

### Touch Optimization
- `touch-action: manipulation` on buttons
- `-webkit-tap-highlight-color: transparent`
- Double-tap zoom prevention
- Viewport with `user-scalable=no`

### Visual Polish
- `100dvh` for dynamic viewport height
- Safe area insets for notched iPads
- `-webkit-backdrop-filter` for blur effects
- Responsive layouts for landscape/portrait

### PWA Ready
- `apple-mobile-web-app-capable` meta tag
- Custom status bar styling
- Touch icon configuration

## Features

- **Real-time voice conversation** with Nova Sonic
- **Multi-turn history** preserved across turns
- **Audio visualization** during recording/playback
- **Tool call logging** (collapsible panel)
- **Session management** with graceful cleanup
- **SSE streaming** for live transcripts

## Architecture

```
src/
├── main.js              # App entry
├── App.vue              # Main component with voice logic
└── components/
    ├── StatusBadge.vue      # Connection status indicator
    ├── AudioVisualizer.vue  # Recording/playback visualizer
    ├── TranscriptBox.vue    # Conversation messages
    └── ToolLog.vue          # Tool invocation panel
```

## API Integration

The frontend communicates with the backend via:

- `POST /session/start` - Create session
- `DELETE /session/:id` - End session
- `POST /audio/start` - Begin recording
- `POST /audio/chunk` - Send audio PCM data
- `POST /audio/end` - Stop recording
- `GET /events/stream/:id` - SSE for transcripts/audio

## Styling

Uses CSS custom properties for theming:

```css
--bg-primary: #0a0e17;
--accent-blue: #3b82f6;
--accent-purple: #8b5cf6;
/* ... see App.vue for full palette */
```

Font: [Outfit](https://fonts.google.com/specimen/Outfit) - modern, clean sans-serif

