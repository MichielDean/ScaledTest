import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../stores/auth-store'

export function OAuthCallbackPage() {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(errorParam)
      return
    }

    if (token) {
      // The backend redirects here with a token after OAuth.
      // We need to decode minimal user info from the JWT or fetch /auth/me.
      fetch('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to get user info')
          return res.json()
        })
        .then((data) => {
          setAuth(data.user, token)
          navigate({ to: '/' })
        })
        .catch(() => {
          setError('OAuth login failed')
        })
    } else {
      setError('No authentication token received')
    }
  }, [navigate, setAuth])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
          <p className="text-muted-foreground">{error}</p>
          <a href="/login" className="text-primary hover:underline">Back to login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  )
}
