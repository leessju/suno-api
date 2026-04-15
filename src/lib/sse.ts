import { NextResponse } from 'next/server'

export interface SSEEvent {
  event?: string
  data: unknown
  id?: string
}

export function createSSEStream(
  generator: (send: (event: SSEEvent) => void) => Promise<void>
): NextResponse {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        let msg = ''
        if (event.id) msg += `id: ${event.id}\n`
        if (event.event) msg += `event: ${event.event}\n`
        msg += `data: ${JSON.stringify(event.data)}\n\n`
        controller.enqueue(encoder.encode(msg))
      }

      try {
        await generator(send)
      } catch (e) {
        send({ event: 'error', data: { message: String(e) } })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
