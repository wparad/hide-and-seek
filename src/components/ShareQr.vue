<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{ url: string }>()
const canvasEl = ref<HTMLCanvasElement | null>(null)

async function render() {
  if (!canvasEl.value || !props.url) return
  await QRCode.toCanvas(canvasEl.value, props.url, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

onMounted(render)
watch(() => props.url, render)
</script>

<template>
  <canvas ref="canvasEl" class="share-qr-canvas"></canvas>
</template>

<style scoped>
.share-qr-canvas {
  display: block;
  margin: 0 auto 16px;
  width: 200px;
  height: 200px;
  border-radius: 8px;
}
</style>
