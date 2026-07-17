<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '../store'

interface QuestionItem {
  id: string
  label: string
  requirements?: string
  distance?: string
  availability?: string
}

interface QuestionCategory {
  id: string
  name: string
  cost: string
  question: string
  availability?: string
  items: QuestionItem[]
}

const store = useStore()

const categories: QuestionCategory[] = [
  {
    id: 'matching',
    name: 'Matching',
    cost: 'Draw 3, Pick 1',
    question: 'Is your nearest _____ the same as my nearest _____?',
    items: [
      { id: 'matching-8', label: 'Amusement Park' },
      { id: 'matching-10', label: 'Aquarium' },
      { id: 'matching-16', label: 'Body of Water (which lake/river are you closest to?)' },
      { id: 'matching-1', label: 'Commercial Airport' },
      { id: 'matching-15', label: 'Foreign Consulate' },
      { id: 'matching-13', label: 'Hospital' },
      { id: 'matching-6', label: 'Landmass' },
      { id: 'matching-14', label: 'Library' },
      { id: 'matching-12', label: 'Movie Theatre' },
      { id: 'matching-5', label: 'Mountain' },
      { id: 'matching-11', label: 'Museum' },
      { id: 'matching-7', label: 'Park' },
      { id: 'matching-3', label: "Station's Name Length" },
      { id: 'matching-4', label: 'Street or Path' },
      {
        id: 'matching-2',
        label: 'Transit Line (is your station on the line we are currently on?)',
      },
      { id: 'matching-9', label: 'Zoo' },
    ],
  },
  {
    id: 'measuring',
    name: 'Measuring',
    cost: 'Draw 3, Pick 1',
    question: 'Are you closer to or further from [landmark] than I am?',
    items: [
      { id: 'measuring-5', label: 'Ägerisee (lake)' },
      { id: 'measuring-16', label: 'ETH Zürich (landmark)' },
      { id: 'measuring-18', label: 'FIFA headquarters (landmark)' },
      { id: 'measuring-12', label: 'Glatt (river)' },
      { id: 'measuring-2', label: 'Greifensee (lake)' },
      { id: 'measuring-17', label: 'Letzigrund (stadium)' },
      { id: 'measuring-9', label: 'Limmat (river)' },
      { id: 'measuring-21', label: 'Nearest Aldi (grocery)' },
      { id: 'measuring-15', label: 'Nearest cantonal border (border)' },
      { id: 'measuring-19', label: 'Nearest Coop (grocery)' },
      { id: 'measuring-22', label: 'Nearest Lidl (grocery)' },
      { id: 'measuring-20', label: 'Nearest Migros (grocery)' },
      { id: 'measuring-8', label: 'Nearest national border (border)' },
      { id: 'measuring-3', label: 'Pfäffikersee (lake)' },
      { id: 'measuring-14', label: 'Rhine (river)' },
      { id: 'measuring-10', label: 'Sihl (river)' },
      { id: 'measuring-4', label: 'Sihlsee (lake)' },
      { id: 'measuring-13', label: 'Thur (river)' },
      { id: 'measuring-11', label: 'Töss (river)' },
      { id: 'measuring-6', label: 'Zugersee (lake)' },
      { id: 'measuring-7', label: 'Zürich Flughafen (airport)' },
      { id: 'measuring-1', label: 'Zürichsee (lake)' },
    ],
  },
  {
    id: 'thermometer',
    name: 'Thermometer',
    cost: 'Draw 2, Pick 1',
    time: '5 min',
    question: 'I just travelled (at least) [Distance]. Am I hotter or colder?',
    items: [
      { id: 'thermometer-1', label: '1 km' },
      { id: 'thermometer-2', label: '5 km' },
      { id: 'thermometer-3', label: '16 km' },
    ],
  },
  {
    id: 'radar',
    name: 'Radar',
    cost: 'Draw 2, Pick 1',
    time: '5 min',
    question: 'Are you within [Distance] of me?',
    items: [
      { id: 'radar-1', label: '400 m' },
      { id: 'radar-2', label: '800 m' },
      { id: 'radar-3', label: '1.6 km' },
      { id: 'radar-4', label: '4.8 km' },
      { id: 'radar-5', label: '8.0 km' },
      { id: 'radar-6', label: '16.0 km' },
    ],
  },
  {
    id: 'tentacles',
    name: 'Tentacles',
    cost: 'Draw 4, Pick 2',
    time: '5 min',
    question: 'Of all the [Places] within [Distance] of me, which are you closest to?',
    availability: 'Medium & Up',
    items: [
      { id: 'tentacles-4', label: 'Hospitals', distance: '1.6 km' },
      { id: 'tentacles-2', label: 'Libraries', distance: '1.6 km' },
      { id: 'tentacles-3', label: 'Movie Theatres', distance: '1.6 km' },
      { id: 'tentacles-1', label: 'Museums', distance: '1.6 km' },
      { id: 'tentacles-5', label: 'Named hills / mountains', distance: '8.0 km' },
      { id: 'tentacles-6', label: 'Named lakes', distance: '16.0 km' },
      { id: 'tentacles-9', label: 'Named parks', distance: '1.6 km' },
      { id: 'tentacles-7', label: 'Named rivers', distance: '8.0 km' },
      { id: 'tentacles-8', label: 'Train stations', distance: '4.8 km' },
    ],
  },
  {
    id: 'photos',
    name: 'Photos',
    cost: 'Draw 1',
    time: '10 min',
    question: '',
    items: [
      {
        id: 'photos-7',
        label: 'A Body of Water',
        requirements: 'Must be visible natural water (lake, river, stream)',
        availability: 'All Games',
      },
      {
        id: 'photos-1',
        label: 'A Tree',
        requirements: 'Must include the entire tree',
        availability: 'All Games',
      },
      {
        id: 'photos-10',
        label: 'A unique object',
        requirements:
          "Must be something obviously specific to your location — not something you'd see most other places",
        availability: 'All Games',
      },
      {
        id: 'photos-6',
        label: 'Any building visible from station',
        requirements:
          'Must stand directly outside transit station entrance. If multiple entrances you may choose. Must include roof, both sides, with top in top 1/3rd of frame',
        availability: 'All Games',
      },
      {
        id: 'photos-9',
        label: 'Largest body of water you can see',
        requirements:
          'No zoom, photo must show the largest visible body of water from where you stand',
        availability: 'All Games',
      },
      {
        id: 'photos-15',
        label: 'Park',
        requirements:
          "No zoom, phone perpendicular to ground, must stand 5' away from any obstruction",
        availability: 'Medium & Up',
      },
      {
        id: 'photos-8',
        label: 'Street name sign',
        requirements: 'Must show at least 3 visible letters of the street name',
        availability: 'All Games',
      },
      {
        id: 'photos-11',
        label: 'Tallest building visible from station',
        requirements:
          'Tallest from your perspective / sightline. Must stand directly outside transit station entrance. If multiple entrances you may choose. Must include roof, both sides, with top in top 1/3rd of frame',
        availability: 'Medium & Up',
      },
      {
        id: 'photos-5',
        label: 'Tallest structure in your sightline',
        requirements:
          'Tallest from current perspective. Must include top and both sides. Top in top 1/3rd of frame',
        availability: 'All Games',
      },
      {
        id: 'photos-2',
        label: 'The Sky',
        requirements: 'Place phone on ground and shoot directly up',
        availability: 'All Games',
      },
      {
        id: 'photos-12',
        label: 'Trace Nearest Street / Path',
        requirements:
          'Street/Path must be visible on mapping app. Trace intersection to intersection',
        availability: 'Medium & Up',
      },
      {
        id: 'photos-14',
        label: 'Train Platform',
        requirements: "Must include 5'x5' section with three distinct elements",
        availability: 'Medium & Up',
      },
      {
        id: 'photos-13',
        label: 'Two Buildings',
        requirements: "Must include 5'x5' section with three distinct elements",
        availability: 'Medium & Up',
      },
      {
        id: 'photos-4',
        label: 'Widest Street',
        requirements: 'Must include both sides of the street',
        availability: 'All Games',
      },
      {
        id: 'photos-3',
        label: 'You',
        requirements: 'Selfie mode, arm parallel to the ground, fully extended',
        availability: 'All Games',
      },
    ],
  },
]

const expandedCategories = ref<Set<string>>(new Set())

function toggleCategory(cat: QuestionCategory) {
  if (expandedCategories.value.has(cat.id)) {
    expandedCategories.value.delete(cat.id)
  } else {
    expandedCategories.value.add(cat.id)
  }
}

function activate(id: string) {
  store.activateQuestion(id)
}

function getCount(id: string): number {
  return store.questionCounts[id] ?? 0
}
</script>

<template>
  <div class="questions-panel">
    <div v-for="cat in categories" :key="cat.id" class="category">
      <button class="category-header" @click="toggleCategory(cat)">
        <span class="category-name">{{ cat.name }}</span>
        <span class="category-meta">
          <span class="meta-pill">{{ cat.cost }}</span>
          <span class="meta-pill">{{ cat.time }}</span>
        </span>
        <span class="chevron" :class="{ open: expandedCategories.has(cat.id) }">▸</span>
      </button>

      <div v-if="expandedCategories.has(cat.id)" class="category-items">
        <div class="category-rules">
          <span v-if="cat.question" class="rules-question">{{ cat.question }}</span>
          <span v-if="cat.availability" class="rules-availability">{{ cat.availability }}</span>
        </div>
        <div v-for="item in cat.items" :key="item.id" class="question-row">
          <div class="question-info">
            <span class="question-label">{{ item.label }}</span>
            <span v-if="item.distance" class="question-detail">{{ item.distance }}</span>
            <span v-if="item.requirements" class="question-detail">{{ item.requirements }}</span>
            <span v-if="item.availability" class="question-availability">{{
              item.availability
            }}</span>
          </div>
          <div class="question-actions">
            <span v-if="getCount(item.id) > 0" class="count-badge">{{ getCount(item.id) }}</span>
            <button class="activate-btn" @click="activate(item.id)">Activate</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.questions-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.category-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
}

.category-name {
  font-weight: 600;
  flex-shrink: 0;
}

.category-meta {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: flex-end;
}

.meta-pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e8e8e8;
  color: #555;
  white-space: nowrap;
}

.chevron {
  font-size: 12px;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(90deg);
}

.category-items {
  display: flex;
  flex-direction: column;
}

.question-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid #f0f0f0;
  gap: 8px;
}

.question-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.question-label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.question-detail {
  font-size: 11px;
  color: #777;
  line-height: 1.3;
}

.question-availability {
  font-size: 10px;
  color: #0066cc;
  font-weight: 600;
}

.question-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.count-badge {
  font-size: 11px;
  font-weight: 700;
  background: #0066cc;
  color: #fff;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

.activate-btn {
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid #0066cc;
  border-radius: 4px;
  background: #fff;
  color: #0066cc;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}

.activate-btn:active {
  background: #0066cc;
  color: #fff;
}

.category-rules {
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rules-question {
  font-size: 13px;
  font-style: italic;
  color: #444;
}

.rules-availability {
  font-size: 11px;
  font-weight: 600;
  color: #0066cc;
}
</style>
