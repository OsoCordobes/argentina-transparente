import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useLocality } from '@/contexts/LocalityContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, X, Send, Loader2, AlertTriangle, Lock, Sparkles, MessageCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  signals?: Signal[];
}

interface Signal {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
}

export function ConsciousnessOrb() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { currentLocality } = useLocality();
  const { user } = useAuth();

  // Pulse animation timing
  const [pulsePhase, setPulsePhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(p => (p + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!user) {
      toast.error('Debes iniciar sesión para usar La Bestia');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('la-bestia-chat', {
        body: {
          message: userMessage,
          localityId: currentLocality.id,
        },
      });

      if (error) throw error;

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.message,
          signals: data.signals,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Error comunicándose con La Bestia');
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Disculpa, hubo un error. Intenta de nuevo.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const suggestions = [
    '¿Cuáles son los contratos más sospechosos?',
    '¿Qué empresas reciben más adjudicaciones?',
    '¿Hay señales de corrupción recientes?',
  ];

  // Dynamic glow intensity based on state
  const glowIntensity = isLoading ? 1.5 : isHovered ? 1.2 : 1;
  const pulseScale = 1 + Math.sin(pulsePhase * Math.PI / 180) * 0.05;

  return (
    <>
      {/* Floating Orb - Bottom Center */}
      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
          isOpen ? 'opacity-0 pointer-events-none scale-50' : 'opacity-100'
        }`}
      >
        <button
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="relative group focus:outline-none"
          aria-label="Abrir La Bestia"
        >
          {/* Outer glow rings */}
          <div
            className="absolute inset-0 rounded-full transition-all duration-300"
            style={{
              transform: `scale(${pulseScale * 1.4})`,
              background: `radial-gradient(circle, hsl(var(--primary) / ${0.15 * glowIntensity}), transparent 70%)`,
              filter: `blur(20px)`,
            }}
          />
          <div
            className="absolute inset-0 rounded-full transition-all duration-300"
            style={{
              transform: `scale(${pulseScale * 1.2})`,
              background: `radial-gradient(circle, hsl(var(--primary) / ${0.25 * glowIntensity}), transparent 60%)`,
              filter: `blur(10px)`,
            }}
          />
          
          {/* Main orb */}
          <div
            className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              transform: `scale(${pulseScale})`,
              background: `radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.9), hsl(var(--primary)) 50%, hsl(276 87% 40%) 100%)`,
              boxShadow: `
                0 0 ${20 * glowIntensity}px hsl(var(--primary) / 0.5),
                0 0 ${40 * glowIntensity}px hsl(var(--primary) / 0.3),
                inset 0 0 20px hsl(0 0% 100% / 0.2)
              `,
            }}
          >
            {/* Inner highlight */}
            <div
              className="absolute top-2 left-3 w-4 h-4 rounded-full opacity-40"
              style={{
                background: 'radial-gradient(circle, white, transparent)',
              }}
            />
            
            {/* Icon */}
            <Eye className="h-7 w-7 text-primary-foreground relative z-10" />
            
            {/* Particle dots */}
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary-foreground/60"
                style={{
                  top: `${30 + Math.sin((pulsePhase + i * 72) * Math.PI / 180) * 15}%`,
                  left: `${30 + Math.cos((pulsePhase + i * 72) * Math.PI / 180) * 15}%`,
                  opacity: 0.4 + Math.sin((pulsePhase + i * 60) * Math.PI / 180) * 0.3,
                }}
              />
            ))}
          </div>
          
          {/* Tooltip on hover */}
          <div
            className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap transition-all duration-200 ${
              isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <Badge variant="secondary" className="shadow-lg">
              <Sparkles className="h-3 w-3 mr-1" />
              La Bestia
            </Badge>
          </div>
        </button>
      </div>

      {/* Chat Panel - Slides up from bottom center */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex justify-center transition-all duration-500 ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <Card className="w-full max-w-lg h-[70vh] max-h-[600px] rounded-t-2xl rounded-b-none shadow-2xl border-primary/20 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-transparent">
            <div className="flex items-center gap-3">
              <div 
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(276 87% 40%))',
                  boxShadow: '0 0 15px hsl(var(--primary) / 0.4)',
                }}
              >
                <Eye className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">La Bestia</h3>
                <p className="text-xs text-muted-foreground">
                  {currentLocality.name} • IA de transparencia
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="space-y-6 py-8">
                <div className="text-center space-y-2">
                  <div 
                    className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{
                      background: 'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.1))',
                    }}
                  >
                    <Eye className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">
                    Pregúntame sobre contratos, empresas o señales de corrupción en{' '}
                    <strong>{currentLocality.name}</strong>.
                  </p>
                </div>
                
                <div className="space-y-2">
                  {suggestions.map((suggestion, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="w-full text-left justify-start h-auto py-3 text-sm hover:bg-primary/5 hover:border-primary/30"
                      onClick={() => setInput(suggestion)}
                    >
                      <MessageCircle className="h-4 w-4 mr-2 shrink-0 text-primary" />
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                      {msg.signals && msg.signals.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.signals.slice(0, 3).map(signal => (
                            <div
                              key={signal.id}
                              className="bg-background/50 rounded-lg p-2"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="h-3 w-3" />
                                <Badge className={`text-[10px] ${getSeverityColor(signal.severity)}`}>
                                  {signal.severity}
                                </Badge>
                              </div>
                              <p className="font-medium text-xs">{signal.title}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-md p-4">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Analizando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t bg-background">
            {!user ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-2">
                <Lock className="h-4 w-4" />
                <span className="text-sm">Inicia sesión para chatear</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Pregunta sobre corrupción..."
                  disabled={isLoading}
                  className="flex-1 rounded-full px-4"
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  disabled={isLoading || !input.trim()}
                  className="rounded-full shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        </Card>
      </div>

      {/* Backdrop when open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
