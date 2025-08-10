import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Meter, VUMeter } from "./VUMeter";

// 簡単なレンダリングテスト（AudioContext を与えずにマウントできること）
describe("VUMeter components", () => {
  test("render mono VUMeter", () => {
    render(
      <Meter
        audioContext={null}
        sourceNode={null}
        label="TEST"
        referenceLevel={-18}
        options={{ width: 217, height: 190 }}
      />,
    );

    // SVGタイトルが描画される
    expect(screen.getByTitle("VU Meter")).toBeInTheDocument();
  });

  test("render StereoVUMeter (mono)", () => {
    render(
      <VUMeter
        audioContext={null}
        sourceNode={null}
        mono
        label="MONO"
        referenceLevel={-20}
        options={{ width: 217 }}
      />,
    );

    // ラベル表示の一部を確認
    expect(screen.getByText(/0VU =/)).toBeInTheDocument();
  });
});
