import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Mail, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth'

export default function Login() {
  const { user, loading, configured, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
          <CardDescription>
            Recibirás un enlace mágico en tu correo para autenticarte. No usamos
            contraseñas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configured && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Supabase no configurado</AlertTitle>
              <AlertDescription>
                Definí <code className="text-xs">VITE_SUPABASE_URL</code> y{' '}
                <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> en{' '}
                <code className="text-xs">frontend/.env.development</code> y aplicá la
                migración{' '}
                <code className="text-xs">supabase/migrations/0001_casos.sql</code>.
              </AlertDescription>
            </Alert>
          )}

          {sent ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Revisá tu correo</AlertTitle>
              <AlertDescription>
                Te enviamos un enlace mágico a <strong>{email}</strong>. Hacé click
                en el enlace para entrar.
              </AlertDescription>
            </Alert>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!configured) return
                setError(null)
                setSubmitting(true)
                const { error } = await signInWithEmail(email)
                setSubmitting(false)
                if (error) setError(error)
                else setSent(true)
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium block mb-1.5">Correo</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!configured || submitting}
                    className="pl-8"
                  />
                </div>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={!configured || submitting || email.length < 4}
                className="w-full"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar enlace mágico
              </Button>
            </form>
          )}

          <p className="text-xs text-muted-foreground">
            Al iniciar sesión aceptás que ARGOS guarde tus casos de investigación
            (entidades, contratos, señales y notas). Solo vos podés ver tus casos
            (RLS Postgres).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
