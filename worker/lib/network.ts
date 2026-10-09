export interface BusinessCardFields {
  name: string
  title: string
  company: string
  email: string
  phone: string
  website: string
  address: string
}

const BUSINESS_CARD_KEYS: Array<keyof BusinessCardFields> = [
  'name',
  'title',
  'company',
  'email',
  'phone',
  'website',
  'address',
]

export function parseBusinessCardOcrResponse(value: unknown): BusinessCardFields {
  const raw = typeof value === 'string'
    ? value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : value

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start === -1 || end <= start) throw new Error('OCR returned unreadable data')
      parsed = JSON.parse(raw.slice(start, end + 1))
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OCR returned unreadable data')
  }

  const record = parsed as Record<string, unknown>
  return BUSINESS_CARD_KEYS.reduce<BusinessCardFields>((fields, key) => {
    const field = record[key]
    fields[key] = typeof field === 'string' ? field.trim().slice(0, 500) : ''
    return fields
  }, {
    name: '',
    title: '',
    company: '',
    email: '',
    phone: '',
    website: '',
    address: '',
  })
}

export function imageBytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${contentType};base64,${btoa(binary)}`
}
