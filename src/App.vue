<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const THEME_KEY = 'micro-diary-theme'

const selectedDate = ref(getDateKey(new Date()))
const draft = ref('')
const diary = ref([])
const editingEntryId = ref(null)
const theme = ref('light')
const toast = ref({ show: false, message: '', type: 'success' })
const confirmAction = ref(null)
const dateInput = ref(null)
const isLoading = ref(true)
const isSaving = ref(false)

const themeOrder = ['light', 'dark', 'high-contrast']
const MAX_ENTRY_LENGTH = 180

const themeIcon = computed(() => {
  if (theme.value === 'dark') return '☾'
  if (theme.value === 'high-contrast') return '◐'
  return '☀'
})

function sortDiaryEntries(entries) {
  return [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function sortDiaryByDate() {
  diary.value = [...diary.value]
    .map((day) => ({
      ...day,
      entries: sortDiaryEntries(day.entries || []),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

const orderedDays = computed(() => {
  return [...diary.value]
    .map((day) => ({
      ...day,
      entries: sortDiaryEntries(day.entries || []),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
})

const themeClass = computed(() => `theme-${theme.value}`)

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  window.clearTimeout(showToast.timeoutId)
  showToast.timeoutId = window.setTimeout(() => {
    toast.value.show = false
  }, 1800)
}

function toggleTheme() {
  const currentIndex = themeOrder.indexOf(theme.value)
  const nextIndex = (currentIndex + 1) % themeOrder.length
  theme.value = themeOrder[nextIndex]
}

function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayHeading(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getTimeLabel(isoString) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString))
}

async function loadDiary() {
  isLoading.value = true

  try {
    const response = await fetch('/api/diary')
    if (!response.ok) throw new Error('Failed to load diary')

    const parsed = await response.json()
    diary.value = Array.isArray(parsed) ? parsed : []
    sortDiaryByDate()
  } catch (error) {
    console.error(error)
    showToast('Could not load diary', 'danger')
  } finally {
    isLoading.value = false
  }
}

async function saveEntry(entry, method = 'POST') {
  const response = await fetch('/api/diary', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })

  if (!response.ok) throw new Error('Failed to save diary entry')
  return response.json()
}

async function deleteEntry(entryId) {
  const response = await fetch(`/api/diary?id=${encodeURIComponent(entryId)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete diary entry')
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY)
  if (savedTheme && themeOrder.includes(savedTheme)) {
    theme.value = savedTheme
    return
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  theme.value = prefersDark ? 'dark' : 'light'
}

function saveTheme() {
  localStorage.setItem(THEME_KEY, theme.value)
}

function resetForm() {
  draft.value = ''
  editingEntryId.value = null
}

function openSaveConfirm() {
  const text = draft.value.trim()
  if (!text || text.length > MAX_ENTRY_LENGTH) return

  confirmAction.value = {
    mode: editingEntryId.value ? 'update' : 'create',
  }
}

async function confirmSave() {
  if (!confirmAction.value) return

  const text = draft.value.trim()
  if (!text || text.length > MAX_ENTRY_LENGTH) return

  isSaving.value = true

  try {
    if (editingEntryId.value) {
      const existing = diary.value.flatMap((day) => day.entries).find((entry) => entry.id === editingEntryId.value)
      if (!existing) return

      const updated = await saveEntry({
        id: existing.id,
        date: selectedDate.value,
        text,
        createdAt: existing.createdAt,
      }, 'PATCH')
      replaceEntry(updated)
      showToast('Entry updated')
    } else {
      const created = await saveEntry({
        id: crypto.randomUUID(),
        date: selectedDate.value,
        text,
        createdAt: new Date().toISOString(),
      })
      addEntry(created)
      showToast('Entry saved')
    }

    sortDiaryByDate()
    resetForm()
    confirmAction.value = null
  } catch (error) {
    console.error(error)
    showToast('Could not save entry', 'danger')
  } finally {
    isSaving.value = false
  }
}

function addEntry(entry) {
  const day = diary.value.find((item) => item.date === entry.date)
  if (day) day.entries.unshift(entry)
  else diary.value.push({ date: entry.date, entries: [entry] })
}

function replaceEntry(updatedEntry) {
  const current = diary.value.flatMap((day) => day.entries).find((entry) => entry.id === updatedEntry.id)
  if (current) Object.assign(current, updatedEntry)
}

function startEdit(entry) {
  selectedDate.value = diary.value.find((day) => day.entries.some((item) => item.id === entry.id))?.date || selectedDate.value
  draft.value = entry.text
  editingEntryId.value = entry.id
}

function cancelEdit() {
  resetForm()
}

function openDeleteConfirm(dateKey, entryId) {
  confirmAction.value = { mode: 'delete', dateKey, entryId }
}

async function confirmDelete() {
  if (!confirmAction.value || confirmAction.value.mode !== 'delete') return

  const { dateKey, entryId } = confirmAction.value
  const day = diary.value.find((item) => item.date === dateKey)
  if (!day) {
    confirmAction.value = null
    return
  }

  isSaving.value = true

  try {
    await deleteEntry(entryId)
    day.entries = day.entries.filter((entry) => entry.id !== entryId)

    if (day.entries.length === 0) diary.value = diary.value.filter((item) => item.date !== dateKey)
    else sortDiaryByDate()

    if (editingEntryId.value === entryId) cancelEdit()
    confirmAction.value = null
    showToast('Entry deleted', 'danger')
  } catch (error) {
    console.error(error)
    showToast('Could not delete entry', 'danger')
  } finally {
    isSaving.value = false
  }
}

function cancelConfirm() {
  confirmAction.value = null
}

function openDatePicker() {
  if (dateInput.value) {
    dateInput.value.showPicker?.()
    dateInput.value.click()
  }
}

onMounted(() => {
  loadDiary()
  loadTheme()
})

watch(theme, saveTheme)
</script>

<template>
  <main class="app-shell" :class="themeClass">
    <header class="topbar">
      <div class="brand">
        <p class="eyebrow">micro diary</p>
        <h1>My Micro-diary</h1>
      </div>

      <div class="topbar-actions">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="`Switch theme, current ${theme}`"
          @click="toggleTheme"
          :title="`Current theme: ${theme}`"
        >
          <span aria-hidden="true">{{ themeIcon }}</span>
        </button>

        <label class="date-picker" @click="openDatePicker">
          <input ref="dateInput" v-model="selectedDate" type="date" />
        </label>
      </div>
    </header>

    <section class="composer">
      <textarea
        v-model="draft"
        rows="7"
        :maxlength="MAX_ENTRY_LENGTH"
        :placeholder="editingEntryId ? 'edit your entry...' : 'what happened today?'"
        aria-label="Diary entry"
      />

      <div class="composer-actions">
        <span class="date-label">{{ getDayHeading(selectedDate) }}</span>

        <div class="composer-actions-right">
          <span class="char-count">{{ draft.length }}/{{ MAX_ENTRY_LENGTH }}</span>
          <button v-if="editingEntryId" class="secondary-btn" type="button" @click="cancelEdit">cancel</button>
          <button @click="openSaveConfirm" type="button">{{ editingEntryId ? 'update' : 'save' }}</button>
        </div>
      </div>
    </section>

    <section class="entries">
      <div v-if="orderedDays.length === 0" class="empty-state">
        no entries yet.
      </div>

      <article v-for="day in orderedDays" :key="day.date" class="day-block">
        <h2>{{ getDayHeading(day.date) }}</h2>

        <div v-for="entry in day.entries" :key="entry.id" class="entry-item">
          <div class="entry-header">
            <h3>{{ getTimeLabel(entry.createdAt) }}</h3>

            <div class="entry-actions">
              <button class="icon-btn" type="button" @click="startEdit(entry)" aria-label="Edit entry" title="Edit entry">
                ✎
              </button>
              <button class="icon-btn danger" type="button" @click="openDeleteConfirm(day.date, entry.id)" aria-label="Delete entry" title="Delete entry">
                ✖
              </button>
            </div>
          </div>

          <p>{{ entry.text }}</p>
        </div>
      </article>
    </section>

    <div v-if="toast.show" class="toast" :class="`toast-${toast.type}`">
      {{ toast.message }}
    </div>

    <div v-if="confirmAction" class="modal-backdrop" @click="cancelConfirm">
      <div class="confirm-modal" @click.stop>
        <h3>{{ confirmAction.mode === 'delete' ? 'Delete entry?' : editingEntryId ? 'Update entry?' : 'Save entry?' }}</h3>
        <p>{{ confirmAction.mode === 'delete' ? 'This action cannot be undone.' : 'This will store the current diary text.' }}</p>
        <div class="modal-actions">
          <button class="modal-btn-secondary" type="button" @click="cancelConfirm">cancel</button>
          <button v-if="confirmAction.mode === 'delete'" class="modal-btn" type="button" @click="confirmDelete">delete</button>
          <button v-else class="modal-btn" type="button" @click="confirmSave">confirm</button>
        </div>
      </div>
    </div>
  </main>
</template>
