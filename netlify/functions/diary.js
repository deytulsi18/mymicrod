const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}

function validateEntry(payload) {
  if (!payload || typeof payload !== 'object') return 'Request body must be an object'
  if (typeof payload.id !== 'string' || payload.id.length < 1 || payload.id.length > 100) return 'Entry id is invalid'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return 'Entry date is invalid'
  if (typeof payload.text !== 'string' || payload.text.trim().length < 1 || payload.text.length > 180) return 'Entry text is invalid'
  return null
}

function getConfig() {
  const { AIRTABLE_PAT, AIRTABLE_BASE_ID } = process.env
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Diary'
  if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) throw new Error('Airtable environment variables are missing')
  return { token: AIRTABLE_PAT, tableName, baseId: AIRTABLE_BASE_ID }
}

function endpoint(config, recordId = '') {
  return `${AIRTABLE_API_URL}/${config.baseId}/${encodeURIComponent(config.tableName)}${recordId ? `/${recordId}` : ''}`
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function toEntry(record) {
  const fields = record.fields
  return {
    id: fields.ID || record.id,
    date: fields.Date,
    text: fields.Text,
    createdAt: fields.CreatedAt,
    updatedAt: fields.UpdatedAt || fields.CreatedAt,
  }
}

async function getAllRecords(config) {
  const records = []
  let offset

  do {
    const url = new URL(endpoint(config))
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const response = await fetch(url, { headers: headers(config.token) })
    if (!response.ok) throw new Error(`Airtable list failed: ${response.status}`)
    const page = await response.json()
    records.push(...page.records)
    offset = page.offset
  } while (offset)

  return records
}

async function findRecord(config, id) {
  const records = await getAllRecords(config)
  return records.find((record) => record.fields.ID === id)
}

export const handler = async (event) => {
  try {
    const config = getConfig()

    if (event.httpMethod === 'GET') {
      const records = await getAllRecords(config)
      return json(200, records.map(toEntry))
    }

    let payload
    try {
      payload = event.body ? JSON.parse(event.body) : {}
    } catch {
      return json(400, { error: 'Request body must be valid JSON' })
    }

    const now = new Date().toISOString()

    if (event.httpMethod === 'POST') {
      const validationError = validateEntry(payload)
      if (validationError) return json(400, { error: validationError })

      const response = await fetch(endpoint(config), {
        method: 'POST',
        headers: headers(config.token),
        body: JSON.stringify({ fields: { ID: payload.id, Date: payload.date, Text: payload.text, CreatedAt: payload.createdAt || now, UpdatedAt: now } }),
      })
      if (!response.ok) throw new Error(`Airtable create failed: ${response.status}`)
      return json(201, toEntry(await response.json()))
    }

    if (event.httpMethod === 'PATCH') {
      const validationError = validateEntry(payload)
      if (validationError) return json(400, { error: validationError })

      const record = await findRecord(config, payload.id)
      if (!record) return json(404, { error: 'Entry not found' })
      const response = await fetch(endpoint(config, record.id), {
        method: 'PATCH',
        headers: headers(config.token),
        body: JSON.stringify({ fields: { Date: payload.date, Text: payload.text, UpdatedAt: now } }),
      })
      if (!response.ok) throw new Error(`Airtable update failed: ${response.status}`)
      return json(200, toEntry(await response.json()))
    }

    if (event.httpMethod === 'DELETE') {
      const entryId = event.queryStringParameters?.id
      if (typeof entryId !== 'string' || entryId.length < 1 || entryId.length > 100) {
        return json(400, { error: 'Entry id is invalid' })
      }

      const record = await findRecord(config, entryId)
      if (!record) return json(404, { error: 'Entry not found' })
      const response = await fetch(endpoint(config, record.id), { method: 'DELETE', headers: headers(config.token) })
      if (!response.ok) throw new Error(`Airtable delete failed: ${response.status}`)
      return json(204, {})
    }

    return {
      ...json(405, { error: 'Method not allowed' }),
      headers: { ...json(405, {}).headers, Allow: 'GET, POST, PATCH, DELETE' },
    }
  } catch (error) {
    console.error(error)
    return json(500, { error: 'Diary service unavailable' })
  }
}