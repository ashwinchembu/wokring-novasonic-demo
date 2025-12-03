<script setup>
import { computed } from 'vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  level: {
    type: Number,
    default: 0
  },
  isPlaying: {
    type: Boolean,
    default: false
  }
})

const bars = computed(() => {
  const count = 24
  const result = []
  
  for (let i = 0; i < count; i++) {
    // Create wave-like pattern
    const centerOffset = Math.abs(i - count / 2) / (count / 2)
    const baseHeight = props.active || props.isPlaying
      ? (1 - centerOffset * 0.5) * (props.level || 0.3) + 0.1
      : 0.08
    
    // Add some randomness for natural look
    const randomFactor = props.active || props.isPlaying
      ? 0.3 + Math.random() * 0.7
      : 0.5 + Math.random() * 0.5
    
    const height = Math.min(1, baseHeight * randomFactor)
    
    result.push({
      height: `${height * 100}%`,
      delay: `${i * 50}ms`
    })
  }
  
  return result
})
</script>

<template>
  <div 
    class="visualizer" 
    :class="{ 
      active: active, 
      playing: isPlaying && !active 
    }"
  >
    <div 
      v-for="(bar, index) in bars" 
      :key="index"
      class="bar"
      :style="{ 
        height: bar.height,
        animationDelay: bar.delay
      }"
    ></div>
  </div>
</template>

<style scoped>
.visualizer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 48px;
  width: 100%;
  max-width: 280px;
  padding: 0 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 24px;
  opacity: 0.3;
  transition: opacity 0.3s ease;
}

.visualizer.active,
.visualizer.playing {
  opacity: 1;
}

.bar {
  flex: 1;
  max-width: 6px;
  min-height: 4px;
  border-radius: 3px;
  background: linear-gradient(to top, #3b82f6, #8b5cf6);
  transition: height 0.1s ease;
}

.visualizer.active .bar {
  animation: wave 0.6s ease-in-out infinite alternate;
}

.visualizer.playing .bar {
  background: linear-gradient(to top, #10b981, #06b6d4);
  animation: wave 0.8s ease-in-out infinite alternate;
}

@keyframes wave {
  0% { 
    transform: scaleY(0.6);
    opacity: 0.7;
  }
  100% { 
    transform: scaleY(1);
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 480px) {
  .visualizer {
    height: 40px;
    max-width: 220px;
    gap: 2px;
  }
  
  .bar {
    max-width: 4px;
  }
}
</style>

