<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface CardDef {
  id: string
  name: string
  category: 'time-bonus' | 'powerup' | 'curse'
  description: string
}

function buildDeck(): CardDef[] {
  const cards: CardDef[] = []

  const timeBonuses: { name: string; count: number; description: string }[] = [
    { name: 'Tiny', count: 15, description: 'A tiny time bonus.' },
    { name: 'Small', count: 8, description: 'A small time bonus.' },
    { name: 'Medium', count: 5, description: 'A medium time bonus.' },
    { name: 'Big', count: 3, description: 'A big time bonus.' },
    { name: 'Massive', count: 2, description: 'A massive time bonus.' },
  ]
  for (const tb of timeBonuses) {
    for (let i = 0; i < tb.count; i++) {
      cards.push({
        id: `${tb.name.toLowerCase()}-${i}`,
        name: tb.name,
        category: 'time-bonus',
        description: tb.description,
      })
    }
  }

  const powerups: { name: string; count: number; slug: string; description: string }[] = [
    {
      name: 'Veto Question',
      count: 4,
      slug: 'veto-question',
      description:
        'Play instead of answering a question. No answer is given, and no reward is earned.',
    },
    {
      name: 'Randomize Question',
      count: 4,
      slug: 'randomize-question',
      description:
        'Play instead of answering a question. A new unasked question from the same category is chosen, at random, which you answer instead.',
    },
    {
      name: 'Discard 1, Draw 2',
      count: 4,
      slug: 'discard-1-draw-2',
      description:
        'Discard one other card from your hand. Then, draw and keep two cards from the hider deck.',
    },
    {
      name: 'Discard 2, Draw 3',
      count: 4,
      slug: 'discard-2-draw-3',
      description:
        'Discard two other cards from your hand. Then, draw and keep three cards from the hider deck.',
    },
    {
      name: 'Draw 1, Expand 1',
      count: 2,
      slug: 'draw-1-expand-1',
      description:
        'Draw one card from the hider deck. For the rest of the round, you can hold one additional card in your hand.',
    },
    {
      name: 'Duplicate Another Card',
      count: 2,
      slug: 'duplicate-another-card',
      description:
        'Play this card as a copy of any other card in your hand. This may be used to duplicate a time bonus at the end of your round.',
    },
  ]
  for (const p of powerups) {
    for (let i = 0; i < p.count; i++) {
      cards.push({
        id: `${p.slug}-${i}`,
        name: p.name,
        category: 'powerup',
        description: p.description,
      })
    }
  }

  const curses: { name: string; slug: string; description: string }[] = [
    {
      name: 'Curse of the Bridge Troll',
      slug: 'curse-bridge-troll',
      description:
        'The seekers must ask their next question from under a bridge. Casting cost: Seekers must be at least 10km from you.',
    },
    {
      name: 'Curse of the Cairn',
      slug: 'curse-cairn',
      description:
        'You have one attempt to stack as many rocks on top of each other as you can. The seekers must match your tower height. Casting cost: Build a rock tower.',
    },
    {
      name: 'Curse of the Drained Brain',
      slug: 'curse-drained-brain',
      description:
        'Choose three questions in different categories. The seekers cannot ask those questions for the rest of your run. Casting cost: Discard your hand.',
    },
    {
      name: 'Curse of the Endless Tumble',
      slug: 'curse-endless-tumble',
      description:
        'Seekers must roll a die at least 30 meters and have it land on a 5 or 6 before asking another question. Casting cost: Roll a die. If it\u2019s a 5 or 6, no effect.',
    },
    {
      name: "Curse of the Gambler's Feet",
      slug: 'curse-gamblers-feet',
      description:
        'For 40 minutes, seekers must roll a die before taking steps \u2014 they may take that many steps. Casting cost: Roll a die. If even, no effect.',
    },
    {
      name: 'Curse of the Hidden Hangman',
      slug: 'curse-hidden-hangman',
      description:
        'Seekers must beat the hider in hangman before asking another question or boarding transport. Casting cost: Discard 2 cards.',
    },
    {
      name: 'Curse of the Impressionable Consumer',
      slug: 'curse-impressionable-consumer',
      description:
        "Seekers must enter a location or buy a product from an advertisement before asking another question. Casting cost: Seekers' next question is free.",
    },
    {
      name: 'Curse of the Jammed Door',
      slug: 'curse-jammed-door',
      description:
        'For 1 hour, seekers must roll 7+ on 2 dice to pass through doorways. Casting cost: Discard 2 cards.',
    },
    {
      name: 'Curse of the Labyrinth',
      slug: 'curse-labyrinth',
      description:
        'Draw a maze (up to 20 min). Seekers must solve it before asking another question. Casting cost: Draw a maze.',
    },
    {
      name: 'Curse of the Luxury Car',
      slug: 'curse-luxury-car',
      description:
        'Take a photo of a car. Seekers must photograph a more expensive car before asking another question. Casting cost: A photo of a car.',
    },
    {
      name: 'Curse of the Mediocre Travel Agent',
      slug: 'curse-mediocre-travel-agent',
      description:
        'Choose a place within 500m of seekers. They must go there, spend 5 min, send photos, and bring a souvenir. Casting cost: Destination must be further from you.',
    },
    {
      name: 'Curse of the Overflowing Chalice',
      slug: 'curse-overflowing-chalice',
      description:
        'For the next 3 questions, draw an additional card when drawing. Casting cost: Discard a card.',
    },
    {
      name: 'Curse of the Ransom Note',
      slug: 'curse-ransom-note',
      description:
        "Seekers' next question must be composed of cut-out words from printed material (5+ words). Casting cost: Spell 'ransom note' as a ransom note.",
    },
    {
      name: 'Curse of the Right Turn',
      slug: 'curse-right-turn',
      description:
        'For 40 minutes, seekers can only turn right at intersections. Casting cost: Discard a card.',
    },
    {
      name: 'Curse of Spotty Memory',
      slug: 'curse-spotty-memory',
      description:
        'For the rest of your run, one random question category is disabled at all times (re-rolled each question). Casting cost: Discard a time bonus card.',
    },
    {
      name: 'Curse of the Bird Guide',
      slug: 'curse-bird-guide',
      description:
        'Film a bird as long as possible (up to 10 min). Seekers must match your time. Casting cost: Film a bird.',
    },
    {
      name: 'Curse of the Unguided Tourist',
      slug: 'curse-unguided-tourist',
      description:
        'Send seekers an unzoomed Street View image from within 150m. They must find it in real life. Casting cost: Seekers must be outside.',
    },
    {
      name: 'Curse of the U-Turn',
      slug: 'curse-u-turn',
      description:
        'Seekers must get off at the next station (if another transit comes within 30 min). Casting cost: Seekers must be heading wrong way.',
    },
    {
      name: 'Curse of the Express Route',
      slug: 'curse-express-route',
      description:
        'Seekers must stay on transit for 15 more minutes or until last stop in play area. Casting cost: Seekers must be on transit heading away.',
    },
    {
      name: 'Curse of the Urban Explorer',
      slug: 'curse-urban-explorer',
      description:
        'For the rest of your run, seekers cannot ask questions on transit or in stations. Casting cost: Discard 2 cards.',
    },
    {
      name: 'Curse of the Zoologist',
      slug: 'curse-zoologist',
      description:
        'Take a photo of a wild animal. Seekers must photograph one in the same category. Casting cost: A photo of an animal.',
    },
    {
      name: 'Curse of the American Units',
      slug: 'curse-american-units',
      description:
        'Your hiding zone is now 800m instead of 500m. Casting cost: Discard at least 20 minutes in time bonuses.',
    },
    {
      name: 'Curse of the Hide-and-Seek-Ception',
      slug: 'curse-hide-and-seek-ception',
      description:
        'One seeker hides 150m+ away. Others must find them without info. Casting cost: Seekers must be off-transit, 150m+ from a station.',
    },
    {
      name: 'Curse of the Motion Sickness',
      slug: 'curse-motion-sickness',
      description:
        'Seekers must get off transit and sit 50m from motorised transport for 5 minutes. Casting cost: Discard at least 5 minutes in time bonuses.',
    },
    {
      name: 'Curse of the ADHD Moment',
      slug: 'curse-adhd-moment',
      description:
        "Pick a question category. It's disabled until 2 questions from other categories are asked. Casting cost: Discard a curse.",
    },
  ]
  for (const c of curses) {
    cards.push({
      id: c.slug,
      name: c.name,
      category: 'curse',
      description: c.description,
    })
  }

  return cards
}

const ALL_CARDS = buildDeck()
const cardMap = new Map(ALL_CARDS.map((c) => [c.id, c]))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const STORAGE_KEY = 'hide-and-seek-cards'

interface GameState {
  deck: string[]
  hand: string[]
  discard: string[]
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GameState
      if (
        Array.isArray(parsed.deck) &&
        Array.isArray(parsed.hand) &&
        Array.isArray(parsed.discard)
      ) {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return { deck: shuffle(ALL_CARDS.map((c) => c.id)), hand: [], discard: [] }
}

function saveState(s: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const state = ref<GameState>(loadState())

watch(state, (s) => saveState(s), { deep: true })

const deckCount = computed(() => state.value.deck.length)
const handCount = computed(() => state.value.hand.length)
const discardCount = computed(() => state.value.discard.length)

const handCards = computed(() => {
  const cards = state.value.hand.map((id) => cardMap.get(id)!).filter(Boolean)
  const categoryOrder: Record<string, number> = { powerup: 0, curse: 1, 'time-bonus': 2 }
  const timeBonusOrder: Record<string, number> = {
    Tiny: 0,
    Small: 1,
    Medium: 2,
    Big: 3,
    Massive: 4,
  }
  return cards.sort((a, b) => {
    const catDiff = (categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9)
    if (catDiff !== 0) return catDiff
    if (a.category === 'time-bonus') {
      return (timeBonusOrder[a.name] ?? 9) - (timeBonusOrder[b.name] ?? 9)
    }
    return a.name.localeCompare(b.name)
  })
})

const handLimit = ref(6)
const overLimit = computed(() => handCount.value > handLimit.value)

// Draw modal
const showDrawModal = ref(false)
const drawCount = ref(2)
const revealedCards = ref<{ card: CardDef; kept: boolean }[]>([])
const hasDrawn = ref(false)

function openDrawModal() {
  drawCount.value = 2
  revealedCards.value = []
  hasDrawn.value = false
  showDrawModal.value = true
}

function drawCards() {
  const n = Math.min(drawCount.value, state.value.deck.length)
  const drawn = state.value.deck.splice(0, n)
  revealedCards.value = drawn.map((id) => ({ card: cardMap.get(id)!, kept: false }))
  hasDrawn.value = true
}

function toggleKeep(index: number) {
  revealedCards.value[index].kept = !revealedCards.value[index].kept
}

function confirmDraw() {
  for (const item of revealedCards.value) {
    if (item.kept) {
      state.value.hand.push(item.card.id)
    } else {
      state.value.discard.push(item.card.id)
    }
  }
  showDrawModal.value = false
}

function cancelDraw() {
  for (const item of revealedCards.value) {
    state.value.deck.push(item.card.id)
  }
  state.value.deck = shuffle(state.value.deck)
  revealedCards.value = []
  hasDrawn.value = false
  showDrawModal.value = false
}

// Card detail modal
const showDetailModal = ref(false)
const detailCard = ref<CardDef | null>(null)

function openDetail(card: CardDef) {
  detailCard.value = card
  showDetailModal.value = true
}

function closeDetail() {
  showDetailModal.value = false
  detailCard.value = null
}

// Play/Discard confirm modal
const showPlayModal = ref(false)
const playCard = ref<CardDef | null>(null)

function openPlayConfirm(card: CardDef) {
  playCard.value = card
  showPlayModal.value = true
}

function confirmPlay() {
  if (!playCard.value) return
  const idx = state.value.hand.indexOf(playCard.value.id)
  if (idx !== -1) {
    state.value.hand.splice(idx, 1)
    state.value.discard.push(playCard.value.id)
  }
  showPlayModal.value = false
  playCard.value = null
}

function cancelPlay() {
  showPlayModal.value = false
  playCard.value = null
}

function categoryLabel(cat: CardDef['category']): string {
  switch (cat) {
    case 'time-bonus':
      return 'Time Bonus'
    case 'powerup':
      return 'Powerup'
    case 'curse':
      return 'Curse'
  }
}
</script>

<template>
  <div class="cards-panel">
    <!-- Top section: counts -->
    <div class="cards-stats">
      <div class="stat">
        <span class="stat-count">{{ deckCount }}</span>
        <span class="stat-label">Deck</span>
      </div>
      <div class="stat">
        <span class="stat-count">{{ handCount }}</span>
        <span class="stat-label">Hand</span>
      </div>
      <div class="stat">
        <span class="stat-count">{{ discardCount }}</span>
        <span class="stat-label">Discard</span>
      </div>
    </div>

    <!-- Draw button -->
    <button
      class="draw-btn"
      :disabled="deckCount === 0 || overLimit"
      @click="openDrawModal"
    >
      Draw Cards
    </button>

    <!-- Over limit error -->
    <div v-if="overLimit" class="over-limit-error">
      Hand exceeds maximum ({{ handCount }}/{{ handLimit }}) — discard before drawing
    </div>

    <!-- Hand section -->
    <div class="hand-section">
      <div class="hand-header">
        <h3 class="hand-title">Hand</h3>
        <div class="hand-limit">
          <span class="limit-label">Max:</span>
          <select v-model.number="handLimit" class="limit-select">
            <option :value="6">6</option>
            <option :value="7">7</option>
            <option :value="8">8</option>
          </select>
        </div>
      </div>
      <div v-if="handCards.length === 0" class="empty-hand">No cards in hand</div>
      <div v-else class="hand-list">
        <div
          v-for="card in handCards"
          :key="card.id"
          :class="['hand-card', `border-${card.category}`, { 'over-limit': overLimit }]"
          @click="openDetail(card)"
        >
          <div class="card-info">
            <span class="card-name">{{ card.name }}</span>
            <span :class="['badge', `badge-${card.category}`]">{{
              categoryLabel(card.category)
            }}</span>
          </div>
          <button class="play-btn" @click.stop="openPlayConfirm(card)">Play</button>
        </div>
      </div>
    </div>

    <!-- Draw Modal -->
    <div v-if="showDrawModal" class="modal-overlay" @click.self="cancelDraw">
      <div class="modal">
        <h3>Draw Cards</h3>

        <div v-if="!hasDrawn" class="draw-controls">
          <label class="slider-label">
            Show <strong>{{ drawCount }}</strong>
          </label>
          <input v-model.number="drawCount" type="range" min="1" max="4" class="slider" />
          <button class="modal-btn primary" :disabled="deckCount === 0" @click="drawCards">
            Draw
          </button>
          <button class="modal-btn" @click="cancelDraw">Cancel</button>
        </div>

        <div v-else class="revealed-cards">
          <div
            v-for="(item, idx) in revealedCards"
            :key="item.card.id"
            :class="['revealed-card', `border-${item.card.category}`, { kept: item.kept }]"
          >
            <div class="revealed-info">
              <span class="card-name">{{ item.card.name }}</span>
              <span :class="['badge', `badge-${item.card.category}`]">{{
                categoryLabel(item.card.category)
              }}</span>
              <p class="card-desc">{{ item.card.description }}</p>
            </div>
            <button :class="['keep-btn', { active: item.kept }]" @click="toggleKeep(idx)">
              {{ item.kept ? 'Keeping' : 'Keep' }}
            </button>
          </div>
          <div class="modal-actions">
            <button class="modal-btn primary" @click="confirmDraw">Done</button>
            <button class="modal-btn" @click="cancelDraw">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Card Detail Modal -->
    <div v-if="showDetailModal && detailCard" class="modal-overlay" @click.self="closeDetail">
      <div class="modal">
        <h3>{{ detailCard.name }}</h3>
        <span :class="['badge', `badge-${detailCard.category}`]">{{
          categoryLabel(detailCard.category)
        }}</span>
        <p class="detail-desc">{{ detailCard.description }}</p>
        <button class="modal-btn" @click="closeDetail">Close</button>
      </div>
    </div>

    <!-- Play/Discard Confirm Modal -->
    <div v-if="showPlayModal && playCard" class="modal-overlay" @click.self="cancelPlay">
      <div class="modal">
        <h3>Play {{ playCard.name }}?</h3>
        <div class="modal-actions">
          <button class="modal-btn" @click="cancelPlay">Cancel</button>
          <button class="modal-btn primary" @click="confirmPlay">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cards-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cards-stats {
  display: flex;
  justify-content: space-around;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-count {
  font-size: 20px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
}

.draw-btn {
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: #0066cc;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.draw-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.over-limit-error {
  font-size: 14px;
  font-weight: 700;
  color: #dc2626;
  text-align: center;
  padding: 8px;
}

.hand-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hand-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.hand-limit {
  display: flex;
  align-items: center;
  gap: 4px;
}

.limit-label {
  font-size: 12px;
  color: #666;
}

.limit-select {
  padding: 2px 4px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
  background: #fff;
}

.empty-hand {
  color: #999;
  font-size: 14px;
  text-align: center;
  padding: 24px 0;
}

.hand-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hand-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-left: 4px solid;
  cursor: pointer;
}

.hand-card.border-time-bonus {
  border-left-color: #f59e0b;
}

.hand-card.border-powerup {
  border-left-color: #3b82f6;
}

.hand-card.border-curse {
  border-left-color: #8b5cf6;
}

.hand-card.over-limit {
  background: #fca5a5;
}

.card-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-name {
  font-size: 14px;
  font-weight: 500;
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.badge-time-bonus {
  background: #fef3c7;
  color: #92400e;
}

.badge-powerup {
  background: #dbeafe;
  color: #1e40af;
}

.badge-curse {
  background: #ede9fe;
  color: #5b21b6;
}

.play-btn {
  padding: 4px 10px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal h3 {
  margin: 0;
  font-size: 18px;
}

.draw-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slider-label {
  font-size: 14px;
}

.slider {
  width: 100%;
}

.revealed-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.revealed-card {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  border-left: 4px solid;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.revealed-card.border-time-bonus {
  border-left-color: #f59e0b;
}

.revealed-card.border-powerup {
  border-left-color: #3b82f6;
}

.revealed-card.border-curse {
  border-left-color: #8b5cf6;
}

.revealed-card.kept {
  background: #f0fdf4;
  border-color: #86efac;
  border-left-color: #22c55e;
}

.revealed-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-desc {
  margin: 0;
  font-size: 12px;
  color: #555;
  line-height: 1.4;
}

.keep-btn {
  padding: 4px 10px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.keep-btn.active {
  background: #22c55e;
  color: #fff;
  border-color: #22c55e;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.modal-btn {
  padding: 8px 16px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
}

.modal-btn.primary {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
}

.detail-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
}
</style>
