import { describe, expect, it } from "vitest";
import { fitScaler, gradient, logLoss, predictProba, priorProb, scale, sigmoid, smoothedRate, toPercent, trainLogistic } from "./predict";

describe("sigmoid", () => {
  it("đối xứng quanh 0 và ổn định với số lớn", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 10);
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sigmoid(-1000))).toBe(true);
  });
});

describe("fitScaler / scale", () => {
  it("chuẩn hoá về trung bình 0, độ lệch 1; cột hằng không chia 0", () => {
    const X = [
      [1, 5],
      [3, 5],
    ];
    const { mean, std } = fitScaler(X);
    expect(mean).toEqual([2, 5]);
    expect(std).toEqual([1, 1]);
    expect(scale([3, 5], mean, std)).toEqual([1, 0]);
  });
});

describe("gradient", () => {
  it("khớp với đạo hàm số của log-loss", () => {
    const X = [
      [0.5, -1],
      [-0.3, 2],
      [1.2, 0.1],
    ];
    const y = [1, 0, 1];
    const w = [0.2, -0.4];
    const b = 0.1;
    const l2 = 0.1;
    const { gw, gb } = gradient(X, y, w, b, l2);
    const h = 1e-6;
    for (let j = 0; j < w.length; j++) {
      const wp = [...w];
      const wm = [...w];
      wp[j] += h;
      wm[j] -= h;
      expect(gw[j]).toBeCloseTo((logLoss(X, y, wp, b, l2) - logLoss(X, y, wm, b, l2)) / (2 * h), 5);
    }
    expect(gb).toBeCloseTo((logLoss(X, y, w, b + h, l2) - logLoss(X, y, w, b - h, l2)) / (2 * h), 5);
  });
});

describe("trainLogistic", () => {
  it("học được quan hệ đơn giản: đặc trưng càng lớn càng dễ thắng", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 40; i++) {
      const v = i / 4;
      X.push([v, 7]);
      y.push(v > 5 ? 1 : 0);
    }
    const m = trainLogistic(X, y);
    expect(predictProba(m, [9, 7])).toBeGreaterThan(0.8);
    expect(predictProba(m, [1, 7])).toBeLessThan(0.2);
    expect(m.w[0]).toBeGreaterThan(0);
  });

  it("L2 lớn kéo hệ số về gần 0", () => {
    const X = [[0], [1], [2], [3]];
    const y = [0, 0, 1, 1];
    const loose = trainLogistic(X, y, { l2: 0 });
    const tight = trainLogistic(X, y, { l2: 5 });
    expect(Math.abs(tight.w[0])).toBeLessThan(Math.abs(loose.w[0]));
  });
});

describe("priorProb", () => {
  it("giai đoạn càng gần thắng xác suất càng cao", () => {
    expect(priorProb(0.75, 1)).toBeGreaterThan(priorProb(0.25, 1));
  });
  it("không cập nhật quá 14 ngày thì giảm", () => {
    expect(priorProb(0.5, 40)).toBeLessThan(priorProb(0.5, 3));
    expect(priorProb(0.5, 10)).toBe(priorProb(0.5, 3));
  });
  it("luôn nằm trong (0, 1)", () => {
    for (const s of [-1, 0, 0.5, 1, 2]) for (const d of [0, 100, 1000]) {
      const p = priorProb(s, d, 0.3);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe("tiện ích", () => {
  it("smoothedRate kéo kênh ít dữ liệu về tỉ lệ chung", () => {
    expect(smoothedRate(1, 1, 0.2)).toBeCloseTo((1 + 0.6) / 4);
    expect(smoothedRate(0, 0, 0.3)).toBeCloseTo(0.3);
  });
  it("toPercent làm tròn và chặn 0–100", () => {
    expect(toPercent(0.456)).toBe(46);
    expect(toPercent(2)).toBe(100);
    expect(toPercent(-1)).toBe(0);
  });
});
