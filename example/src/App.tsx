import { useEffect, useRef, useState } from "react";
import { VUMeter } from "vu-meter-react";

// Safari のベンダープレフィックスを型として扱うための拡張
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// 減衰ありの矩形波を数回鳴らすノードを生成し、
// 再生/停止ボタンだけを持つ最小のテストアプリ。
export default function App() {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const sourceNodeRef = useRef<AudioNode | null>(null);

  // AudioGraph の作成（矩形波 -> ゲイン(ADSR風減衰) -> Destination）
  const setupGraph = async () => {
    // Safari 対応: webkitAudioContext が存在する場合がある
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error("Web Audio API is not supported in this browser.");
    }
    const ctx = new AudioCtx();

    // 矩形波のオシレータ
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 220;

    // ゲイン（エンベロープ）
    const gain = ctx.createGain();
    // 初期は無音
    gain.gain.setValueAtTime(0, ctx.currentTime);

    // 5回、1回あたり約0.5秒のディケイを行う
    const burstCount = 5;
    const repeatInterval = 0.7;
    const attackTime = 0.02;
    const decayTime = 0.5;
    for (let i = 0; i < burstCount; i++) {
      const t0 = ctx.currentTime + i * repeatInterval;
      gain.gain.cancelScheduledValues(t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.8, t0 + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attackTime + decayTime);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    // 全体で約 burstCount*repeatInterval 秒後に停止
    const totalDur = burstCount * repeatInterval + decayTime;
    osc.stop(ctx.currentTime + totalDur);

    sourceNodeRef.current = gain;
    setAudioContext(ctx);
  };

  const start = async () => {
    if (isPlaying) {
      return;
    }
    await setupGraph();
    setIsPlaying(true);
  };

  const stop = () => {
    if (!audioContext) {
      return;
    }
    audioContext.close();
    setAudioContext(null);
    setIsPlaying(false);
  };

  // 自動クリーンアップ
  useEffect(() => {
    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioContext]);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <h2>VUMeter Example</h2>
      <div style={{ display: "flex", gap: 16 }}>
        <button type="button" onClick={start} disabled={isPlaying}>
          Play
        </button>
        <button type="button" onClick={stop} disabled={!isPlaying}>
          Stop
        </button>
      </div>

      <VUMeter
        audioContext={audioContext}
        sourceNode={sourceNodeRef.current}
        mono={false}
        referenceLevel={-18}
        options={{ width: 300, theme: "dark" }}
      />
    </div>
  );
}
