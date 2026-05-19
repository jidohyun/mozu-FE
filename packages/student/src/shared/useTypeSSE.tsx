import { getCookies } from "@mozu/util-config";
import { EventSourcePolyfill } from "event-source-polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface TeamSSEConnectedData {
  type: "TEAM_SSE_CONNECTED";
  message: string;
}

export interface ClassNextInvStartData {
  lessonId: string;
  curInvRound: number;
  teamId: string;
  teamName: string;
  schoolName: string;
}

export interface ClassStartData {
  lessonId: string;
  curInvRound: number;
  teamId: string;
  teamName: string;
  schoolName: string;
}

export interface ClassCancelData {
  classId: string;
  teamId: string;
}

export interface TeamPartInData {
  teamId: string;
  teamName: string;
  schoolName: string;
}

export type EventHandlers = {
  TEAM_SSE_CONNECTED?: (data: TeamSSEConnectedData) => void;
  CLASS_START?: (data: ClassStartData) => void;
  CLASS_NEXT_INV_START?: (data: ClassNextInvStartData) => void;
  CLASS_CANCEL?: (data: ClassCancelData) => void;
};

export const useTypeSSE = (
  url: string,
  onMessage?: (data: any) => void,
  onError?: (error: any, isInitialConnection: boolean) => void,
  eventHandlers?: EventHandlers,
) => {
  const [token, setToken] = useState<string | undefined>(() => getCookies<string>("accessToken"));
  const navigate = useNavigate();
  const eventSourceRef = useRef<EventSourcePolyfill | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  // isReconnecting은 derived: 재시도 카운트 > 0 이고 아직 연결 안 됐을 때만 true
  const isReconnecting = retryCount > 0 && !isConnected && !reconnectFailed;

  const settledTimerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_RETRY = 10;
  const BASE_DELAY = 1000;
  const MAX_DELAY = 30_000;
  const SETTLED_AFTER = 5_000;

  useEffect(() => {
    const handleTokenChange = (e: Event) => {
      const next = (e as CustomEvent<{ accessToken: string }>).detail?.accessToken
        ?? getCookies<string>("accessToken");
      setToken(prev => (prev === next ? prev : next));
    };
    window.addEventListener("mozu-access-token-changed", handleTokenChange);
    return () => window.removeEventListener("mozu-access-token-changed", handleTokenChange);
  }, []);

  // 콜백 함수들과 상태를 ref로 저장
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const eventHandlersRef = useRef(eventHandlers);
  const retryCountRef = useRef(retryCount);
  const isConnectedRef = useRef(isConnected);

  // lastEventId를 localStorage에 url 단위로 영속화 → 새로고침/탭 재진입 후에도 SSE 복구 가능
  const storageKey = url ? `mozu-sse-last-event-id:${url}` : null;
  const readStoredLastEventId = (): string | null => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };
  const writeStoredLastEventId = (value: string | null) => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      if (value) window.localStorage.setItem(storageKey, value);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // localStorage 사용 불가 환경 무시
    }
  };
  const lastEventIdRef = useRef<string | null>(readStoredLastEventId());

  const setLastEventId = (id: string | undefined) => {
    if (!id) return;
    lastEventIdRef.current = id;
    writeStoredLastEventId(id);
  };

  // 최신 값들을 ref에 업데이트
  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    eventHandlersRef.current = eventHandlers;
    retryCountRef.current = retryCount;
    isConnectedRef.current = isConnected;
  });

  const attemptReconnect = useCallback(() => {
    if (!url || !token) return;

    const currentRetryCount = retryCountRef.current;
    if (currentRetryCount >= MAX_RETRY) {
      console.error(`[SSE] 최대 재시도 횟수(${MAX_RETRY}) 초과 — 자동 재연결 중단`);
      setReconnectFailed(true);
      return;
    }

    console.log(`[SSE] 재연결 시도 중... (시도 ${currentRetryCount + 1}/${MAX_RETRY})`);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      console.log("[SSE] 오프라인 — online 이벤트 대기");
      const onOnline = () => {
        window.removeEventListener("online", onOnline);
        setRetryCount(prev => prev + 1);
      };
      window.addEventListener("online", onOnline);
      return;
    }

    const base = Math.min(BASE_DELAY * 2 ** currentRetryCount, MAX_DELAY);
    const hiddenMultiplier = typeof document !== "undefined" && document.hidden ? 2 : 1;
    const jitter = 1 + Math.random() * 0.3;
    const delay = Math.min(base * hiddenMultiplier * jitter, MAX_DELAY * 2);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      setRetryCount(prev => prev + 1);
    }, delay);
  }, [
    url,
    token,
  ]);

  // 연결 설정 함수 - 안정적인 의존성만 사용
  const setupConnection = useCallback(() => {
    if (!url || !token) {
      setIsConnecting(false);
      return null;
    }

    console.log("[SSE] 연결 시도 중...");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (lastEventIdRef.current) {
      console.log(`[SSE] 재연결 시도: Last-Event-ID ${lastEventIdRef.current} 전송`);
      headers["Last-Event-ID"] = lastEventIdRef.current;
    }

    setIsConnecting(true);

    const eventSource = new EventSourcePolyfill(url, {
      headers: headers,
      heartbeatTimeout: 1000 * 60 * 30, // 30분
    });

    eventSourceRef.current = eventSource;

    const markSettled = () => {
      if (settledTimerRef.current) {
        clearTimeout(settledTimerRef.current);
      }
      settledTimerRef.current = setTimeout(() => {
        setRetryCount(0);
        setReconnectFailed(false);
      }, SETTLED_AFTER);
    };

    // SSE 연결 성공
    eventSource.onopen = () => {
      console.log("[SSE] 연결 성공");
      setIsConnected(true);
      setIsConnecting(false);
      markSettled();
    };

    // SSE 연결 오류
    eventSource.onerror = err => {
      console.error("[SSE] 연결 오류:", err);
      setIsConnected(false);
      setIsConnecting(false);

      const isInitialFailure = retryCountRef.current === 0 && !isConnectedRef.current;
      onErrorRef.current?.(err, isInitialFailure);
      attemptReconnect();
    };

    eventSource.onmessage = e => {
      try {
        if (e.lastEventId) {
          setLastEventId(e.lastEventId);
        }
        const parsed = JSON.parse(e.data);
        onMessageRef.current?.(parsed);
      } catch (err) {
        console.error("[SSE] onmessage 파싱 오류:", err);
      }
    };

    // TEAM_SSE_CONNECTED 이벤트 핸들러
    eventSource.addEventListener("TEAM_SSE_CONNECTED", (e: any) => {
      try {
        const eventData = JSON.parse(e.data);
        console.log("[SSE] TEAM_SSE_CONNECTED 수신:", eventData);
        setIsConnected(true);
        setIsConnecting(false);
        markSettled();
        eventHandlersRef.current?.TEAM_SSE_CONNECTED?.(eventData);
      } catch (err) {
        console.error("[SSE] TEAM_SSE_CONNECTED 파싱 오류:", err);
      }
    });

    // 다른 이벤트 핸들러들
    const setupEventHandlers = () => {
      const handlers = eventHandlersRef.current;
      if (!handlers) return;

      Object.entries(handlers).forEach(([eventType, handler]) => {
        if (eventType !== "TEAM_SSE_CONNECTED") {
          eventSource.addEventListener(eventType, (e: any) => {
            try {
              if (e.lastEventId) {
                setLastEventId(e.lastEventId);
              }
              const eventData = JSON.parse(e.data);
              console.log(`[SSE] ${eventType} 수신:`, eventData);
              handler?.(eventData);
            } catch (err) {
              console.error(`[SSE] ${eventType} 파싱 오류:`, err);
            }
          });
        }
      });
    };

    setupEventHandlers();
    return eventSource;
  }, [
    url,
    token,
    attemptReconnect,
    navigate,
    retryCount,
  ]);

  // 메인 useEffect - setupConnection만 의존성으로 사용
  useEffect(() => {
    const eventSource = setupConnection();

    return () => {
      console.log("[SSE] 연결 정리");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSource) {
        eventSource.close();
      }
      eventSourceRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
    };
  }, [
    setupConnection,
  ]);

  // retryCount 변경 시 재연결 시도 (별도의 useEffect)
  useEffect(() => {
    if (retryCount > 0) {
      console.log(`[SSE] retryCount 변경됨: ${retryCount}, 재연결 트리거`);
      // setupConnection이 자동으로 재실행됨
    }
  }, [
    retryCount,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (settledTimerRef.current) {
      clearTimeout(settledTimerRef.current);
      settledTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setRetryCount(0);
    setReconnectFailed(false);
  }, []);

  const retryNow = useCallback(() => {
    setReconnectFailed(false);
    setRetryCount(0);
  }, []);

  return {
    disconnect,
    isConnected,
    isConnecting,
    isReconnecting,
    retryCount,
    reconnectFailed,
    retryNow,
  };
};
