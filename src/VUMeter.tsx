import type React from "react";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";

// 色変換ユーティリティ関数
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(color: string): RGBA {
  // rgba形式
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // hex形式
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
      a: 1,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

function colorToRgba(color: string, alpha?: number): string {
  const rgba = parseColor(color);
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alpha !== undefined ? alpha : rgba.a})`;
}

function adjustBrightness(color: string, factor: number): string {
  const rgba = parseColor(color);
  const adjust = (value: number) => Math.min(255, Math.max(0, Math.round(value * factor)));
  return `rgba(${adjust(rgba.r)}, ${adjust(rgba.g)}, ${adjust(rgba.b)}, ${rgba.a})`;
}

// テーマ定義
export interface VUMeterTheme {
  needleColor: string;
  labelColor: string;
  backgroundColor: string;
  boxColor: string;
}

const darkTheme: VUMeterTheme = {
  needleColor: "#ff6b6b",
  labelColor: "#888888",
  backgroundColor: "#1a1a1a",
  boxColor: "#1a1a1a",
};

const lightTheme: VUMeterTheme = {
  needleColor: "#d32f2f",
  labelColor: "#444444",
  backgroundColor: "#faf3e0",
  boxColor: "#f5f5f5",
};

// VUMeterオプションインターフェース
export interface VUMeterOptions {
  theme?: "dark" | "light";
  needleColor?: string;
  labelColor?: string;
  backgroundColor?: string;
  boxColor?: string;
  fontFamily?: string;
  /** 可変サイズ指定（片方のみ指定時はアスペクト比を保持してもう片方を自動算出） */
  width?: number;
  height?: number;
  /** ピークランプの保持時間（ミリ秒）: クリップが収まってからこの時間は点灯を維持する */
  peakHoldMs?: number;
  /** ピークランプのフェードアウト時間（ミリ秒） */
  peakFadeMs?: number;
  /** クリップ検出の針角度しきい値（deg）。例: 23 付近で +3VU 近傍 */
  clipThresholdDeg?: number;
}

// メインの VU メーターProps
export interface MeterProps {
  audioContext: AudioContext | null;
  sourceNode: AudioNode | null;
  mono?: boolean;
  label?: string;
  channel?: "left" | "right" | "mono";
  referenceLevel?: number;
  options?: VUMeterOptions;
}

// VUバリスティクス（応答特性）の実装
class VUBallistics {
  private attackTime: number = 0.3; // 300ms rise time - VU規格準拠
  private releaseTime: number = 0.3; // 300ms fall time - VU規格準拠
  private level: number = 0;

  // サンプルレートには直接依存しないためコンストラクタは不要

  process(inputLevel: number, deltaTime: number): number {
    const attackCoeff = 1 - Math.exp(-deltaTime / this.attackTime);
    const releaseCoeff = 1 - Math.exp(-deltaTime / this.releaseTime);

    if (inputLevel > this.level) {
      // Attack (上昇)
      this.level += (inputLevel - this.level) * attackCoeff;
    } else {
      // Release (下降)
      this.level += (inputLevel - this.level) * releaseCoeff;
    }

    return this.level;
  }
}

export const Meter: React.FC<MeterProps> = ({
  audioContext,
  sourceNode,
  label = "VU",
  channel = "mono",
  referenceLevel = -20,
  options = {},
}) => {
  // SVG の重複 id を避けるために、useId で安定した一意 ID を生成する
  const gradientId = useId();
  // === 可変サイズ計算 ===
  // 基準実寸（この値に対して拡大縮小する）
  const BASE_CONTAINER_WIDTH = 217; // コンテナ全体の幅
  const BASE_CONTAINER_HEIGHT = 190; // コンテナ全体の高さ
  const BASE_WRAPPER_WIDTH = 200; // ダイヤル部の幅
  const BASE_WRAPPER_HEIGHT = 120; // ダイヤル部の高さ
  const BASE_NEEDLE_BOTTOM_OFFSET = -90; // 針の原点位置（下側オフセット, px）

  // 幅/高さの希望値を解決（どちらか一方のみ指定された場合はアスペクト比を維持）
  const aspect = BASE_CONTAINER_WIDTH / BASE_CONTAINER_HEIGHT;
  let targetWidth = options.width;
  let targetHeight = options.height;
  if (targetWidth == null && targetHeight == null) {
    targetWidth = BASE_CONTAINER_WIDTH;
    targetHeight = BASE_CONTAINER_HEIGHT;
  } else if (targetWidth != null && targetHeight == null) {
    targetHeight = Math.round(targetWidth / aspect);
  } else if (targetWidth == null && targetHeight != null) {
    targetWidth = Math.round(targetHeight * aspect);
  }
  // 型の都合で非null断言
  const METER_WIDTH = targetWidth as number;
  const METER_HEIGHT = targetHeight as number;
  const scaleX = METER_WIDTH / BASE_CONTAINER_WIDTH;
  const scaleY = METER_HEIGHT / BASE_CONTAINER_HEIGHT;

  // テーマとカラー設定の解決
  const theme = options.theme || "light";
  const baseTheme = theme === "dark" ? darkTheme : lightTheme;

  const colors = {
    needle: options.needleColor || baseTheme.needleColor,
    label: options.labelColor || baseTheme.labelColor,
    background: options.backgroundColor || baseTheme.backgroundColor,
    box: options.boxColor || baseTheme.boxColor,
  };

  // 派生色の生成
  const derivedColors = {
    // ピークランプ（針の色をベースに）
    peakLamp: colors.needle,
    peakLampGlow: colorToRgba(colors.needle, 0.5),

    // 目盛りとラベル（ラベルカラーをベースに透明度で調整）
    scaleMain: colorToRgba(colors.label, 0.8),
    scaleSub: colorToRgba(colors.label, 0.6),
    labelMain: colors.label,
    labelSub: colorToRgba(colors.label, 0.6),
    vuLogo: colorToRgba(colors.label, 0.4),

    // 警告ゾーン（針の色をベースに）
    warningZone: colorToRgba(colors.needle, 0.35),
    plusLabel: colors.needle,

    // 背景グラデーション（背景色をベースに）
    bgGradientStart: adjustBrightness(colors.background, 1.3),
    bgGradientMid: colors.background,
    bgGradientEnd: adjustBrightness(colors.background, 1.3),

    // ボックスの影と境界線
    boxShadowInset: theme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)",
    boxShadow: theme === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)",
    boxBorder: theme === "dark" ? "#333" : "#ddd",

    // 内側円弧ガイドライン
    innerArcGuide: colorToRgba(colors.label, 0.5),
  };

  // スタイル定義（インラインスタイルで実装）
  const styles = {
    container: {
      padding: 8 * scaleY,
      backgroundColor: colors.box,
      borderRadius: 8 * Math.min(scaleX, scaleY),
      // フレックスレイアウトで子要素（メーター本体と下部ラベル）を縦方向に配置する。
      // 外観カスタマイズ対応の過程で flex の既定の row が効いてしまい、
      // ラベルが右側に回り込む崩れが発生していたため column を明示する。
      display: "flex",
      flexDirection: "column",
      // 余白は下部ラベル側に marginTop を持たせているため、ここでの gap は 0 にして二重の余白を避ける。
      gap: "0px",
      alignItems: "center",
      justifyContent: "center",
      width: METER_WIDTH,
      height: METER_HEIGHT,
      // 子要素の影やSVGが外側に出ないようにクリップ
      overflow: "hidden",
      // 親自身の box-shadow は overflow ではクリップできず、“耳”のように見えるため無効化
      boxShadow: "none",
      border: `1px solid ${derivedColors.boxBorder}`,
      fontFamily: options.fontFamily || "monospace",
    } as CSSProperties,

    wrapper: {
      position: "relative",
      width: BASE_WRAPPER_WIDTH * scaleX,
      height: BASE_WRAPPER_HEIGHT * scaleY,
      background: `linear-gradient(135deg, ${derivedColors.bgGradientStart} 0%, ${derivedColors.bgGradientMid} 50%, ${derivedColors.bgGradientEnd} 100%)`,
      borderRadius: `${8 * Math.min(scaleX, scaleY)}px ${8 * Math.min(scaleX, scaleY)}px 0 0`,
      // 外側の影は親の丸角を越えて“耳”のように見えることがあるため削除し、内側の陰影のみで質感を出す
      boxShadow: `inset 0 2px 8px ${derivedColors.boxShadowInset}`,
      overflow: "hidden",
      border: `1px solid ${derivedColors.boxBorder}`,
    } as CSSProperties,

    scale: {
      position: "absolute",
      width: "100%",
      height: "100%",
    } as CSSProperties,

    needle: {
      position: "absolute",
      bottom: `${BASE_NEEDLE_BOTTOM_OFFSET * scaleY}px`,
      left: "50%",
      width: Math.max(1, Math.round(1 * scaleX)),
      height: "130%",
      backgroundColor: colors.needle,
      transformOrigin: "bottom center",
      transition: "none",
      boxShadow: `0 0 6px ${derivedColors.peakLampGlow}`,
      willChange: "transform",
    } as CSSProperties,

    // ピークランプのスタイル
    // - 背景色のアルファとグロー強度を `intensity` に連動させ、rAF で制御した保持/減衰に同期
    // - 追加の CSS トランジションは用いず、二重アニメーションによるズレを回避
    peakLamp: (isActive: boolean, intensity: number) =>
      ({
        position: "absolute",
        top: 15 * scaleY,
        right: 15 * scaleX,
        width: 12 * Math.min(scaleX, scaleY),
        height: 12 * Math.min(scaleX, scaleY),
        borderRadius: "50%",
        backgroundColor: isActive
          ? colorToRgba(derivedColors.peakLamp, 0.2 + Math.max(0, Math.min(1, intensity)) * 0.8)
          : derivedColors.boxBorder,
        boxShadow: isActive
          ? `0 0 ${12 + intensity * 6}px ${colorToRgba(derivedColors.peakLamp, 0.3 + intensity * 0.4)}`
          : "none",
        transition: "none",
        border: `1px solid ${colorToRgba(colors.label, 0.3)}`,
        zIndex: 10,
      }) as CSSProperties,

    meterLabel: {
      textAlign: "center",
      color: derivedColors.labelSub,
      fontSize: 12 * Math.min(scaleX, scaleY),
      marginTop: 8 * scaleY,
      lineHeight: 1.3,
    } as CSSProperties,

    referenceLabel: {
      fontSize: 12 * Math.min(scaleX, scaleY),
      opacity: 0.8,
      marginTop: 4 * scaleY,
    } as CSSProperties,
  };

  // 座標系の統一に関する定数
  const VIEWBOX_MIN_Y = 20;
  const VIEWBOX_HEIGHT = 100;
  // ランタイムのラッパー高さ/針原点をスケール後の値で計算
  const WRAPPER_HEIGHT_PX = BASE_WRAPPER_HEIGHT * scaleY;
  const NEEDLE_BOTTOM_OFFSET_PX = BASE_NEEDLE_BOTTOM_OFFSET * scaleY;
  const svgUnitsPerPxY = VIEWBOX_HEIGHT / WRAPPER_HEIGHT_PX;
  const needlePivotFromTopPx = WRAPPER_HEIGHT_PX + Math.abs(NEEDLE_BOTTOM_OFFSET_PX);
  const dialCenterY = VIEWBOX_MIN_Y + needlePivotFromTopPx * svgUnitsPerPxY;

  const [needleRotation, setNeedleRotation] = useState(-25);
  const [peakLampActive, setPeakLampActive] = useState(false);
  const [peakLampIntensity, setPeakLampIntensity] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const vuBallisticsRef = useRef<VUBallistics | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const lastTimeRef = useRef<number>(0);
  // 最後にしきい値を超えた rAF 時刻（ms）。初期は null とし、未ヒット扱いにする
  const lastClipTimeMsRef = useRef<number | null>(null);
  const sourceChannelsRef = useRef<number>(1);

  useEffect(() => {
    if (!audioContext || !sourceNode) {
      return;
    }

    // VUバリスティクスの初期化
    vuBallisticsRef.current = new VUBallistics();

    // アナライザーノードの作成
    const analyser = audioContext.createAnalyser();
    {
      const targetWindowSec = 0.05;
      const desiredSamples = Math.max(
        32,
        Math.min(32768, audioContext.sampleRate * targetWindowSec),
      );
      const nearestPow2 = 2 ** Math.round(Math.log2(desiredSamples));
      analyser.fftSize = Math.max(32, Math.min(32768, nearestPow2));
    }
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;

    // チャンネル分離が必要な場合
    if (channel !== "mono") {
      const splitter = audioContext.createChannelSplitter(2);
      splitterRef.current = splitter;
      sourceNode.connect(splitter);

      const channelIndex = channel === "left" ? 0 : 1;
      splitter.connect(analyser, channelIndex);
    } else {
      sourceChannelsRef.current = sourceNode.channelCount || 1;
      sourceNode.connect(analyser);
    }

    // ピークランプのタイミング設定（オプションで調整可能）
    const peakHoldMs = options.peakHoldMs ?? 1000; // 既定: 1秒保持
    const peakFadeMs = options.peakFadeMs ?? 5000; // 既定: 5秒でフェードアウト
    const clipThresholdDeg = options.clipThresholdDeg ?? 23; // 既定: +3VU 近傍

    // アニメーションループ
    const animate = (currentTime: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = currentTime;
      }
      const deltaTime = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;

      if (analyserRef.current && vuBallisticsRef.current) {
        // RMS計算
        const bufferLength = analyserRef.current.fftSize;
        const dataArray = new Float32Array(bufferLength);
        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sumOfSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          sumOfSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumOfSquares / bufferLength);

        let dbFS = 20 * Math.log10(Math.max(rms, 0.00001));

        if (channel === "mono" && sourceChannelsRef.current === 2) {
          dbFS += 3.8;
        }

        const vuValue = dbFS - referenceLevel;

        let angle: number;

        if (vuValue <= -20) {
          angle = -25;
        } else if (vuValue >= 3) {
          angle = 25;
        } else {
          // 実測値に基づく区間線形補間
          if (vuValue <= -20) {
            angle = -23;
          } else if (vuValue <= -10) {
            angle = -23 + ((vuValue + 20) / 10) * 7;
          } else if (vuValue <= -7) {
            angle = -16 + ((vuValue + 10) / 3) * 4;
          } else if (vuValue <= -5) {
            angle = -12 + ((vuValue + 7) / 2) * 4;
          } else if (vuValue <= -3) {
            angle = -8 + ((vuValue + 5) / 2) * 5;
          } else if (vuValue <= -2) {
            angle = -3 + ((vuValue + 3) / 1) * 3;
          } else if (vuValue <= -1) {
            angle = 0 + ((vuValue + 2) / 1) * 3.5;
          } else if (vuValue <= 0) {
            angle = 3.5 + ((vuValue + 1) / 1) * 4.5;
          } else if (vuValue <= 1) {
            angle = 8 + (vuValue / 1) * 5;
          } else if (vuValue <= 2) {
            angle = 13 + ((vuValue - 1) / 1) * 5;
          } else if (vuValue <= 3) {
            angle = 18 + ((vuValue - 2) / 1) * 7;
          } else {
            angle = 25;
          }
        }

        const normalizedLevel = (angle + 25) / 50;
        const smoothedLevel = vuBallisticsRef.current.process(normalizedLevel, deltaTime);
        const directRotation = smoothedLevel * 50 - 25;
        setNeedleRotation(directRotation);

        // クリップ検出: 針角度がしきい値以上でヒット時刻を更新
        if (directRotation >= clipThresholdDeg) {
          lastClipTimeMsRef.current = currentTime;
        }

        // ピークランプの強度を計算
        let intensity = 0;
        if (lastClipTimeMsRef.current != null) {
          const msSinceLastClip = currentTime - lastClipTimeMsRef.current;
          if (msSinceLastClip <= peakHoldMs) {
            // 保持期間中は最大強度
            intensity = 1;
          } else {
            // 保持後はフェードアウト
            const t = Math.min(1, (msSinceLastClip - peakHoldMs) / peakFadeMs);
            // 線形フェード（必要ならイージングへ置換可能）
            intensity = 1 - t;
          }
        }

        // 強度とアクティブ状態を更新（しきい値でスナップオフ）
        if (intensity <= 0.001) {
          setPeakLampActive(false);
          setPeakLampIntensity(0);
        } else {
          setPeakLampActive(true);
          setPeakLampIntensity(intensity);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      if (splitterRef.current) {
        splitterRef.current.disconnect();
      }
    };
  }, [audioContext, sourceNode, channel, referenceLevel, options.peakHoldMs, options.peakFadeMs, options.clipThresholdDeg]);

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <svg style={styles.scale} viewBox="20 20 160 100">
          <title>VU Meter</title>
          {/* VUメーターのスケール描画 */}
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4CAF50" />
              <stop offset="70%" stopColor="#FFC107" />
              <stop offset="100%" stopColor={colors.needle} />
            </linearGradient>
          </defs>

          {(() => {
            const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
              const rad = (angleDeg * Math.PI) / 180;
              return {
                x: cx + Math.sin(rad) * r,
                y: cy - Math.cos(rad) * r,
              };
            };
            const arcPath = (cx: number, cy: number, r: number, start: number, end: number) => {
              const startPt = polarToCartesian(cx, cy, r, start);
              const endPt = polarToCartesian(cx, cy, r, end);
              const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
              return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
            };
            const ringSectorPath = (
              cx: number,
              cy: number,
              rInner: number,
              rOuter: number,
              start: number,
              end: number,
            ) => {
              const p1 = polarToCartesian(cx, cy, rOuter, start);
              const p2 = polarToCartesian(cx, cy, rOuter, end);
              const p3 = polarToCartesian(cx, cy, rInner, end);
              const p4 = polarToCartesian(cx, cy, rInner, start);
              const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
              return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
            };

            const innerArcRadius = 124;
            const innerArcPath = arcPath(100, dialCenterY, innerArcRadius, -25, 25);

            const bandInner = 124;
            const bandOuter = 132;
            const positiveBand = ringSectorPath(100, dialCenterY, bandInner, bandOuter, 8, 25);

            return (
              <>
                <path d={positiveBand} fill={derivedColors.warningZone} stroke="none" />
                <path
                  d={innerArcPath}
                  fill="none"
                  stroke={derivedColors.innerArcGuide}
                  strokeWidth={1.5}
                />
              </>
            );
          })()}

          {/* VUロゴ */}
          <text
            x={100}
            y={210}
            fill={derivedColors.vuLogo}
            fontSize={18}
            textAnchor="middle"
            letterSpacing={2}
            transform={"scale(1, 0.5)"}
          >
            VU
          </text>

          {/* スケールマーク */}
          {[
            { vu: -25, angle: -25, main: true },
            { vu: -20, angle: -23, main: false },
            { vu: -10, angle: -16, main: false },
            { vu: -7, angle: -12, main: false },
            { vu: -5, angle: -8, main: false },
            { vu: -3, angle: -3, main: false },
            { vu: -2, angle: 0, main: false },
            { vu: -1, angle: 3.5, main: false },
            { vu: 0, angle: 8, main: true },
            { vu: 1, angle: 13, main: false },
            { vu: 2, angle: 18, main: false },
            { vu: 3, angle: 25, main: true },
          ].map((mark) => {
            const length = mark.main ? 18 : 12;
            const centerY = dialCenterY;
            const radius = 137;
            const x1 = 100 + Math.sin((mark.angle * Math.PI) / 180) * radius;
            const y1 = centerY - Math.cos((mark.angle * Math.PI) / 180) * radius;
            const x2 = 100 + Math.sin((mark.angle * Math.PI) / 180) * (radius - length);
            const y2 = centerY - Math.cos((mark.angle * Math.PI) / 180) * (radius - length);

            return (
              <line
                key={`mark-${mark.vu}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={mark.vu <= 0 ? derivedColors.scaleSub : derivedColors.plusLabel}
                strokeWidth={mark.main ? 1.5 : 1}
              />
            );
          })}

          {/* VU値ラベル */}
          {[
            { vu: -20, angle: -23, main: true },
            { vu: -10, angle: -16, main: true },
            { vu: -7, angle: -12, main: false },
            { vu: -5, angle: -8, main: false },
            { vu: -3, angle: -3, main: false },
            { vu: -2, angle: 0, main: true },
            { vu: -1, angle: 3.5, main: false },
            { vu: 0, angle: 8, main: true },
            { vu: 1, angle: 13, main: false },
            { vu: 2, angle: 18, main: false },
            { vu: 3, angle: 25, main: true },
          ].map((label) => {
            const centerY = dialCenterY + 20;
            const labelRadius = 137;
            const x = 100 + Math.sin((label.angle * Math.PI) / 180) * labelRadius;
            const y = centerY - Math.cos((label.angle * Math.PI) / 180) * labelRadius - 22;

            return (
              <text
                key={`label-${label.vu}`}
                x={x}
                y={y}
                fill={label.vu <= 0 ? derivedColors.labelMain : derivedColors.plusLabel}
                fontSize={label.vu === 0 ? "10" : "9"}
                textAnchor="middle"
              >
                {Math.abs(label.vu).toString()}
              </text>
            );
          })}

          {/* +/- 記号 */}
          {(() => {
            const centerY = dialCenterY + 10;
            const signRadius = 145;
            const toXY = (angleDeg: number) => {
              const rad = (angleDeg * Math.PI) / 180;
              return {
                x: 100 + Math.sin(rad) * signRadius,
                y: centerY - Math.cos(rad) * signRadius,
              };
            };
            const minus = toXY(-28);
            const plus = toXY(28);
            return (
              <>
                <text
                  x={minus.x}
                  y={minus.y}
                  fill={derivedColors.labelMain}
                  fontSize="12"
                  textAnchor="middle"
                >
                  -
                </text>
                <text
                  x={plus.x}
                  y={plus.y}
                  fill={derivedColors.plusLabel}
                  fontSize="12"
                  textAnchor="middle"
                >
                  +
                </text>
              </>
            );
          })()}
        </svg>

        {/* 針 */}
        <div
          style={{
            ...styles.needle,
            transform: `translateX(-50%) rotate(${needleRotation}deg)`,
          }}
        />

        {/* ピークランプ */}
        <div style={styles.peakLamp(peakLampActive, peakLampIntensity)} />
      </div>

      <div style={styles.meterLabel}>
        <div>{label}</div>
        <div style={styles.referenceLabel}>0VU = {referenceLevel}dBFS</div>
      </div>
    </div>
  );
};

export interface VUMeterProps {
  audioContext: AudioContext | null;
  sourceNode: AudioNode | null;
  mono?: boolean;
  label?: string;
  referenceLevel?: number;
  options?: VUMeterOptions;
}

export const VUMeter: React.FC<VUMeterProps> = ({
  audioContext,
  sourceNode,
  mono = false,
  label,
  referenceLevel = -18,
  options = {},
}) => {
  // 子の VUMeter と全く同じロジックでサイズを解決（幅のみ指定時に高さが足りずはみ出す問題を防ぐ）
  const BASE_CONTAINER_WIDTH = 217;
  const BASE_CONTAINER_HEIGHT = 190;
  const aspect = BASE_CONTAINER_WIDTH / BASE_CONTAINER_HEIGHT;
  const meterWidth = options.width ?? BASE_CONTAINER_WIDTH;
  const meterHeight = options.height ?? Math.round(meterWidth / aspect);
  const gap = 16; // ステレオ時の隙間（px）
  const containerStyle: CSSProperties = {
    padding: 0,
    // ステレオ親コンテナは背景や影を持たせず、子メーターのボックスのみを見せる。
    // これにより左右の間に“帯”が表示されなくなる。
    backgroundColor: "transparent",
    borderRadius: 0,
    display: "flex",
    gap,
    alignItems: "center",
    justifyContent: "center",
    width: mono ? meterWidth : meterWidth * 2 + gap,
    height: meterHeight,
    boxShadow: "none",
    fontFamily: options.fontFamily || "monospace",
  };

  if (mono) {
    return (
      <div style={containerStyle}>
        <Meter
          audioContext={audioContext}
          sourceNode={sourceNode}
          label={label ?? "MONO"}
          channel="mono"
          referenceLevel={referenceLevel}
          options={options}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <Meter
        audioContext={audioContext}
        sourceNode={sourceNode}
        label={label ?? "L"}
        channel="left"
        referenceLevel={referenceLevel}
        options={{ ...options }}
      />
      <Meter
        audioContext={audioContext}
        sourceNode={sourceNode}
        label={label ?? "R"}
        channel="right"
        referenceLevel={referenceLevel}
        options={{ ...options }}
      />
    </div>
  );
};
