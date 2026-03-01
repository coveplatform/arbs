import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 15

export async function GET() {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY not set in environment' }, { status: 500 })
  }

  try {
    const client = new OpenAI({ apiKey: key })
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with just the word "working"' }],
      max_tokens: 10,
      temperature: 0,
    })
    const text = res.choices[0]?.message?.content ?? ''
    return NextResponse.json({ ok: true, response: text, keyPrefix: key.slice(0, 7) + '...' })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 300) }, { status: 500 })
  }
}
