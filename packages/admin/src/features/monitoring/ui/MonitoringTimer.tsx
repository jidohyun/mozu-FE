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
  const endsAtRef = useRef<number | null>(persisted?.endsAt ?? null);
  const tickRef = useRef<number | null>(null);
  const notifiedRef = useRef<boolean>(remaining === 0 && mode === "running" ? true : false);

  const persist = useCallback((next: Partial<PersistedState>) => {
    writePersisted({
      totalSeconds,
      remaining,
      mode,
      endsAt: endsAtRef.current,
      ...next,
    });
  }, [totalSeconds, remaining, mode]);

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

  const handleStart = () => {
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
  };

  const handlePause = () => {
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
  };

  const handleResume = () => {
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
  };

  const handleReset = () => {
    clearTick();
    endsAtRef.current = null;
    notifiedRef.current = false;
    const t = clampMin(inputMin) * 60 + clampSec(inputSec);
    setTotalSeconds(t);
    setRemaining(t);
    setMode("idle");
    writePersisted({ totalSeconds: t, remaining: t, mode: "idle", endsAt: null });
  };

  const isFinished = remaining === 0 && mode === "idle" && totalSeconds > 0;

  return (
    <Wrapper>
      <Label>타이머</Label>
      <Display isLow={remaining > 0 && remaining <= 10} isFinished={isFinished}>
        {formatMmSs(remaining)}
      </Display>

      {mode === "idle" && (
        <InputRow>
          <Field>
            <Num
              type="number"
              min={0}
              max={59}
              value={inputMin}
              onChange={e => setInputMin(clampMin(Number(e.target.value)))}
            />
            <Unit>분</Unit>
          </Field>
          <Field>
            <Num
              type="number"
              min={0}
              max={59}
              value={inputSec}
              onChange={e => setInputSec(clampSec(Number(e.target.value)))}
            />
            <Unit>초</Unit>
          </Field>
        </InputRow>
      )}

      <BtnRow>
        {mode === "idle" && <Primary onClick={handleStart}>시작</Primary>}
        {mode === "running" && <Secondary onClick={handlePause}>일시정지</Secondary>}
        {mode === "paused" && (
          <>
            <Primary onClick={handleResume}>계속</Primary>
            <Ghost onClick={handleReset}>리셋</Ghost>
          </>
        )}
        {mode === "idle" && totalSeconds > 0 && remaining !== totalSeconds && (
          <Ghost onClick={handleReset}>리셋</Ghost>
        )}
      </BtnRow>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background-color: ${color.white};
  border: 1px solid ${color.zinc[200]};
  border-radius: 12px;
  min-width: 200px;
`;

const Label = styled.div`
  font: ${font.l1};
  color: ${color.zinc[500]};
`;

const Display = styled.div<{ isLow: boolean; isFinished: boolean }>`
  font-variant-numeric: tabular-nums;
  font-size: 28px;
  font-weight: 700;
  color: ${({ isLow, isFinished }) =>
    isFinished ? color.zinc[400] : isLow ? color.red[500] : color.zinc[900]};
  letter-spacing: 1px;
`;

const InputRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const Field = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
`;

const Num = styled.input`
  width: 56px;
  padding: 6px 8px;
  border: 1px solid ${color.zinc[300]};
  border-radius: 6px;
  font: ${font.b2};
  text-align: right;
  font-variant-numeric: tabular-nums;

  &:focus {
    outline: none;
    border-color: ${color.orange[500]};
  }
`;

const Unit = styled.span`
  font: ${font.l1};
  color: ${color.zinc[600]};
`;

const BtnRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`;

const baseBtn = `
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
`;

const Primary = styled.button`
  ${baseBtn}
  background-color: ${color.orange[500]};
  color: ${color.white};
  &:hover { background-color: ${color.orange[600]}; }
`;

const Secondary = styled.button`
  ${baseBtn}
  background-color: ${color.zinc[100]};
  color: ${color.zinc[800]};
  border-color: ${color.zinc[200]};
  &:hover { background-color: ${color.zinc[200]}; }
`;

const Ghost = styled.button`
  ${baseBtn}
  background-color: transparent;
  color: ${color.zinc[600]};
  border-color: ${color.zinc[200]};
  &:hover { background-color: ${color.zinc[50]}; color: ${color.zinc[800]}; }
`;
