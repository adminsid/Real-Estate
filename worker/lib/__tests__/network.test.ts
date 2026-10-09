import { describe, expect, it } from 'vitest'
import { imageBytesToDataUrl, parseBusinessCardOcrResponse } from '../network'

describe('parseBusinessCardOcrResponse', () => {
  it('accepts fenced JSON and normalizes supported business-card fields', () => {
    expect(parseBusinessCardOcrResponse(`\`\`\`json
      {"name":" Ada Lovelace ","company":"Analytical Engines","email":"ada@example.com","extra":"ignored"}
    \`\`\``)).toEqual({
      name: 'Ada Lovelace',
      title: '',
      company: 'Analytical Engines',
      email: 'ada@example.com',
      phone: '',
      website: '',
      address: '',
    })
  })

  it('extracts the JSON object when a model adds prose', () => {
    expect(parseBusinessCardOcrResponse('Result: {"name":"Grace Hopper","title":"Admiral"}')).toMatchObject({
      name: 'Grace Hopper',
      title: 'Admiral',
    })
  })

  it('rejects responses without a JSON object', () => {
    expect(() => parseBusinessCardOcrResponse('No readable card')).toThrow('OCR returned unreadable data')
  })
})

describe('imageBytesToDataUrl', () => {
  it('encodes image bytes without expanding them into a JSON number array', () => {
    expect(imageBytesToDataUrl(new Uint8Array([137, 80, 78, 71]), 'image/png'))
      .toBe('data:image/png;base64,iVBORw==')
  })
})
