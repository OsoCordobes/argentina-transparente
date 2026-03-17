import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocality } from '@/contexts/LocalityContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Send, 
  Loader2, 
  Bot, 
  User, 
  AlertTriangle,
  ExternalLink,
  CreditCard
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  signals?: Signal[];
}

interface Signal {
  id: string;
  signal_type: string;
  severity: string;
  title: string;
  description: string;
}

export function LaBestiaChat() {
  const { user, session, isPremium, subscriptionInfo, checkSubscription } = useAuth();
  const { currentLocality } = useLocality();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('la-bestia-chat', {
        body: { 
          message: userMessage,
          localityId: currentLocality.id,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.error.includes('query limit')) {
          toast.error('Límite diario alcanzado. Actualiza a premium para consultas ilimitadas.');
        } else {
          toast.error(data.error);
        }
        return;
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message,
        signals: data.signals,
      }]);

      // Update subscription info for query count
      checkSubscription();
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('Error al procesar tu consulta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        body: { origin: window.location.origin },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Portal error:', err);
      toast.error('Error al abrir el portal. Intenta de nuevo.');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'alta': return 'bg-destructive/10 text-destructive';
      case 'media': return 'bg-warning/10 text-warning';
      default: return 'bg-info/10 text-info';
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-semibold">La Bestia</h3>
            <p className="text-xs text-muted-foreground">
              Analizando: {currentLocality.name}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {subscriptionInfo && (
            <Badge variant="outline" className="text-xs">
              {typeof subscriptionInfo.queries_remaining === 'number' 
                ? `${subscriptionInfo.queries_remaining} consultas restantes`
                : 'Ilimitado'}
            </Badge>
          )}
          
          {isPremium && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleManageSubscription}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Suscripción
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Preguntame sobre patrones de corrupción, contratos sospechosos, 
              o conexiones entre empresas y funcionarios en {currentLocality.name}.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {[
                '¿Hay empresas con concentración sospechosa de contratos?',
                '¿Qué funcionarios tienen conflictos de interés?',
                '¿Cuáles son las señales de alerta más críticas?',
              ].map((suggestion, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(suggestion)}
                  className="text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div 
            key={index}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            
            <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
              <Card className={`p-4 ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </Card>

              {/* Show related signals */}
              {message.signals && message.signals.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Señales relacionadas:
                  </p>
                  {message.signals.slice(0, 3).map((signal) => (
                    <div 
                      key={signal.id}
                      className="text-xs p-2 rounded bg-muted/50 border"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getSeverityColor(signal.severity)}>
                          {signal.signal_type}
                        </Badge>
                        <span className="font-medium">{signal.title}</span>
                      </div>
                      {signal.description && (
                        <p className="text-muted-foreground">{signal.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <Card className="p-4 bg-muted">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analizando...</span>
              </div>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre corrupción, contratos, empresas..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
