import { createApp } from 'vue'
import App from './App.vue'
import { startGps } from './gps'

startGps()
createApp(App).mount('#app')
