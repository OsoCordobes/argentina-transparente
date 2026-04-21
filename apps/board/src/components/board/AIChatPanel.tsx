import { useState, useRef, useEffect }   from 'react'
import { Send, Bot, User, Loader2 }      from 'lucide-react'
import { Button }                        from '@/components/ui/button'
import { Textarea }                      from '@/components/ui/textarea'
import { ScrollArea }                    from '@/components/ui/scroll-area'
import { useBoardStore }                 from '@/store/useBoardStore'

interface Message {
  role:    'user' | 'assistant'
  content: string
}

async function queryAI(
  messages: Message[],
  caseContext: { pinned_entities: string[]; municipio: string; periodo: string },
): Promise<string> {
  const res = await fetch('/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      case_context: caseContext,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  const data = await res.json() as { text: string }
  return data.text
}

export default function AIChatPanel() {
  const { pinnedEntities, municipioId, periodDesde, periodHasta } = useBoardStore()
  const [messages, setMessages] = useState<Message[]>([
    {
      role:    'assistant',
      content: 'Hola. Soy tu co-investigador IA especializado en corrupción pública argentina. Puedo buscar empresas, analizar señales de riesgo, cruzar datos y citar la normativa aplicable. ¿Qué querés investigar?',
    },
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const reply = await queryAI(
        newMessages,
        {
          pinned_entities: Object.values(pinnedEntities).map(e => e.nombre),
          municipio:       municipioId,
          periodo:         `${periodDesde}–${periodHasta}`,
        },
      )
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `⚠️ Error al consultar el AI: ${(err as Error).message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Co-investigador IA</h2>
        </div>
        {Object.keys(pinnedEntities).length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Contexto: {Object.keys(pinnedEntities).length} entidad(es) en canvas
          </p>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {msg.role === 'user'
                  ? <User className="h-3 w-3" />
                  : <Bot className="h-3 w-3" />
                }
              </div>
              <div className={`rounded-lg px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-muted-foreground">Analizando…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            placeholder="Preguntá sobre una empresa, señal de riesgo, normativa…"
            className="text-xs min-h-[60px] max-h-[120px] resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            size="icon"
            className="self-end h-9 w-9 shrink-0"
            onClick={send}
            disabled={!input.trim() || loading}
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  )
}
