import styled from "@emotion/styled";
import { color, font } from "@mozu/design-token";
import { Toast } from "@mozu/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "idle" | "running" | "paused";

const STORAGE_KEY = "mozu-monitoring-timer";

interface PersistedState {
  totalSeconds: number;
  remaining: number;
  mode: Mode;
  endsAt: number | null;
}

const clampMin = (n: number) => Math.max(0, Math.min(59, Math.floor(n || 0)));
const clampSec = (n: number) => Math.max(0, Math.min(59, Math.floor(n || 0)));

const readPersisted = (): PersistedState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
};

const writePersisted = (s: PersistedState | null) => {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

const formatMmSs = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const MonitoringTimer = () => {
  const persisted = readPersisted();
  const [inputMin, setInputMin] = useState<number>(() => {
    if (persisted) return Math.floor(persisted.totalSeconds / 60);
    return 5;
  });
  const [inputSec, setInputSec] = useState<number>(() => {
    if (persisted) return persisted.totalSeconds % 60;
    return 0;
  });
  const [totalSeconds, setTotalSeconds] = useState<number>(persisted?.totalSeconds ?? 5 * 60);
  const [remaining, setRemaining] = useState<number>(() => {
    if (!persisted) return 5 * 60;
    if (persisted.mode === "running" && persisted.endsAt) {
      return Math.max(0, Math.round((persisted.endsAt - Date.now()) / 1000));
    }
    return persisted.remaining;
  });
  const [mode, setMode] = useState<Mode>(persisted?.mode ?? "idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const endsAtRef = useRef<number | null>(persisted?.endsAt ?? null);
  const tickRef = useRef<number | null>(null);
  const notifiedRef = useRef<boolean>(remaining === 0 && mode === "running" ? true : false);

  const clearTick = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    if (mode !== "running") {
      clearTick();
      return;
    }
    const tick = () => {
      const target = endsAtRef.current;
      if (target == null) return;
      const rem = Math.max(0, Math.round((target - Date.now()) / 1000));
      setRemaining(rem);
      if (rem === 0) {
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          Toast("타이머가 종료되었습니다.", { type: "info" });
        }
        endsAtRef.current = null;
        setMode("idle");
        writePersisted({ totalSeconds, remaining: 0, mode: "idle", endsAt: null });
      }
    };
    tick();
    tickRef.current = window.setInterval(tick, 250);
    return clearTick;
  }, [mode, totalSeconds]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  const handleStart = useCallback(() => {
    const t = clampMin(inputMin) * 60 + clampSec(inputSec);
    if (t <= 0) {
      Toast("0보다 큰 시간을 입력해 주세요.", { type: "error" });
      return;
    }
    setTotalSeconds(t);
    setRemaining(t);
    notifiedRef.current = false;
    endsAtRef.current = Date.now() + t * 1000;
    setMode("running");
    writePersisted({
      totalSeconds: t,
      remaining: t,
      mode: "running",
      endsAt: endsAtRef.current,
    });
  }, [inputMin, inputSec]);

  const handlePause = useCallback(() => {
    if (mode !== "running") return;
    clearTick();
    setMode("paused");
    writePersisted({
      totalSeconds,
      remaining,
      mode: "paused",
      endsAt: null,
    });
    endsAtRef.current = null;
  }, [mode, totalSeconds, remaining]);

  const handleResume = useCallback(() => {
    if (mode !== "paused") return;
    if (remaining <= 0) return;
    notifiedRef.current = false;
    endsAtRef.current = Date.now() + remaining * 1000;
    setMode("running");
    writePersisted({
      totalSeconds,
      remaining,
      mode: "running",
      endsAt: endsAtRef.current,
    });
  }, [mode, remaining, totalSeconds]);

  const handleReset = useCallback(() => {
    clearTick();
    endsAtRef.current = null;
    notifiedRef.current = false;
    const t = clampMin(inputMin) * 60 + clampSec(inputSec);
    setTotalSeconds(t);
    setRemaining(t);
    setMode("idle");
    writePersisted({ totalSeconds: t, remaining: t, mode: "idle", endsAt: null });
  }, [inputMin, inputSec]);

  const isLow = remaining > 0 && remaining <= 10;

  const renderControls = (large: boolean) => (
    <ControlsRow large={large}>
      {mode === "idle" && (
        <>
          <NumField large={large}>
            <Num
              large={large}
              type="number"
              min={0}
              max={59}
              value={inputMin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputMin(clampMin(Number(e.target.value)))}
            />
            <Unit large={large}>분</Unit>
          </NumField>
          <NumField large={large}>
            <Num
              large={large}
              type="number"
              min={0}
              max={59}
              value={inputSec}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputSec(clampSec(Number(e.target.value)))}
            />
            <Unit large={large}>초</Unit>
          </NumField>
          <Primary large={large} onClick={handleStart}>시작</Primary>
        </>
      )}
      {mode === "running" && (
        <Secondary large={large} onClick={handlePause}>일시정지</Secondary>
      )}
      {mode === "paused" && (
        <>
          <Primary large={large} onClick={handleResume}>계속</Primary>
          <Ghost large={large} onClick={handleReset}>리셋</Ghost>
        </>
      )}
      {mode === "idle" && totalSeconds > 0 && remaining !== totalSeconds && (
        <Ghost large={large} onClick={handleReset}>리셋</Ghost>
      )}
    </ControlsRow>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <Label>타이머</Label>
          <ExpandBtn
            type="button"
            aria-label="타이머 전체화면"
            title="전체화면"
            onClick={() => setIsFullscreen(true)}>
            <ExpandIcon viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </ExpandIcon>
          </ExpandBtn>
        </CardHeader>
        <Display isLow={isLow}>{formatMmSs(remaining)}</Display>
        {renderControls(false)}
      </Card>

      {isFullscreen && (
        <Overlay onClick={() => setIsFullscreen(false)}>
          <FsPanel onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <FsTopBar>
              <FsLabel>타이머</FsLabel>
              <CloseBtn
                type="button"
                aria-label="전체화면 닫기"
                onClick={() => setIsFullscreen(false)}>
                <ExpandIcon viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </ExpandIcon>
              </CloseBtn>
            </FsTopBar>
            <FsDisplay isLow={isLow}>{formatMmSs(remaining)}</FsDisplay>
            {renderControls(true)}
            <FsHint>ESC 키 또는 바깥을 눌러 닫기</FsHint>
          </FsPanel>
        </Overlay>
      )}
    </>
  );
};

const CARD_HEIGHT = 84;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  height: ${CARD_HEIGHT}px;
  background-color: ${color.white};
  border: 1px solid ${color.zinc[200]};
  border-radius: 12px;
  min-width: 280px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Label = styled.div`
  font: ${font.l1};
  color: ${color.zinc[500]};
`;

const ExpandBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: ${color.zinc[500]};
  cursor: pointer;
  &:hover {
    background-color: ${color.zinc[100]};
    color: ${color.zinc[800]};
  }
`;

const ExpandIcon = styled.svg`
  width: 16px;
  height: 16px;
`;

const Display = styled.div<{ isLow: boolean }>`
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: ${({ isLow }) => (isLow ? color.red[500] : color.zinc[900])};
  letter-spacing: 1px;
`;

const FsDisplay = styled.div<{ isLow: boolean }>`
  font-variant-numeric: tabular-nums;
  font-size: clamp(96px, 18vw, 240px);
  font-weight: 800;
  line-height: 1;
  color: ${({ isLow }) => (isLow ? color.red[500] : color.zinc[900])};
  letter-spacing: 2px;
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
`;

const ControlsRow = styled.div<{ large: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ large }) => (large ? "12px" : "6px")};
  flex-wrap: wrap;
  justify-content: ${({ large }) => (large ? "center" : "flex-start")};
`;

const NumField = styled.div<{ large: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Num = styled.input<{ large: boolean }>`
  width: ${({ large }) => (large ? "120px" : "48px")};
  padding: ${({ large }) => (large ? "10px 12px" : "4px 6px")};
  border: 1px solid ${color.zinc[300]};
  border-radius: 6px;
  font-size: ${({ large }) => (large ? "32px" : "13px")};
  font-weight: 500;
  text-align: right;
  font-variant-numeric: tabular-nums;

  &:focus {
    outline: none;
    border-color: ${color.orange[500]};
  }
`;

const Unit = styled.span<{ large: boolean }>`
  font-size: ${({ large }) => (large ? "22px" : "12px")};
  color: ${color.zinc[600]};
`;

const baseBtn = `
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
`;

const Primary = styled.button<{ large: boolean }>`
  ${baseBtn}
  padding: ${({ large }) => (large ? "14px 28px" : "4px 12px")};
  font-size: ${({ large }) => (large ? "20px" : "13px")};
  background-color: ${color.orange[500]};
  color: ${color.white};
  &:hover {
    background-color: ${color.orange[600]};
  }
`;

const Secondary = styled.button<{ large: boolean }>`
  ${baseBtn}
  padding: ${({ large }) => (large ? "14px 28px" : "4px 12px")};
  font-size: ${({ large }) => (large ? "20px" : "13px")};
  background-color: ${color.zinc[100]};
  color: ${color.zinc[800]};
  border-color: ${color.zinc[200]};
  &:hover {
    background-color: ${color.zinc[200]};
  }
`;

const Ghost = styled.button<{ large: boolean }>`
  ${baseBtn}
  padding: ${({ large }) => (large ? "14px 28px" : "4px 12px")};
  font-size: ${({ large }) => (large ? "20px" : "13px")};
  background-color: transparent;
  color: ${color.zinc[600]};
  border-color: ${color.zinc[200]};
  &:hover {
    background-color: ${color.zinc[50]};
    color: ${color.zinc[800]};
  }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 40px;
`;

const FsPanel = styled.div`
  width: min(1100px, 100%);
  max-width: 100%;
  background-color: ${color.white};
  border-radius: 24px;
  padding: 32px 40px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
  overflow: hidden;
`;

const FsTopBar = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FsLabel = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: ${color.zinc[500]};
`;

const CloseBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: ${color.zinc[600]};
  cursor: pointer;
  &:hover {
    background-color: ${color.zinc[100]};
    color: ${color.zinc[900]};
  }
  svg {
    width: 22px;
    height: 22px;
  }
`;

const FsHint = styled.div`
  font-size: 13px;
  color: ${color.zinc[400]};
  text-align: center;
`;
