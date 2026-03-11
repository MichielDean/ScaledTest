import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '../stores/auth-store'

interface WSMessage {
  type: string
  execution_id: string
  data: unknown
  timestamp: string
}

export function useWebSocket(executionId?: string) {
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  const token = useAuthStore((s) => s.accessToken)

  const connect = useCallback(() => {
    if (!token || unmountedRef.current) return

    const params = new URLSearchParams({ token })
    if (executionId) params.set('execution_id', executionId)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/executions?${params}`)

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => {
      setIsConnected(false)
      if (!unmountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage
        setLastMessage(msg)
      } catch {
        // Ignore malformed messages
      }
    }

    wsRef.current = ws
  }, [token, executionId])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      wsRef.current?.close()
    }
  }, [connect])

  return { lastMessage, isConnected }
}
