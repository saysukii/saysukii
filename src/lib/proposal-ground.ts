export type PagePixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

function at(data: Uint8ClampedArray, index: number) {
  return data[index] ?? 0;
}

/** Clears a flat light page wash so the proposal can sit on the packet ground. */
export function knockPageGround(image: PagePixels, tolerance = 36) {
  const { data, width, height } = image;
  if (width < 8 || height < 8) return;
  const points = [
    [4, 4],
    [width - 5, 4],
    [4, height - 5],
    [width - 5, height - 5],
  ];
  const corners = points.map(([x, y]) => {
    const index = ((y ?? 0) * width + (x ?? 0)) * 4;
    return [at(data, index), at(data, index + 1), at(data, index + 2), at(data, index + 3)] as const;
  });
  if (corners.some((corner) => corner[3] < 20)) return;
  const base = [0, 1, 2].map((channel) =>
    Math.round(corners.reduce((sum, corner) => sum + (corner[channel] ?? 0), 0) / corners.length),
  );
  const red = base[0] ?? 0;
  const green = base[1] ?? 0;
  const blue = base[2] ?? 0;
  const spread = Math.max(
    ...corners.map((corner) => Math.max(Math.abs(corner[0] - red), Math.abs(corner[1] - green), Math.abs(corner[2] - blue))),
  );
  if (spread > 18) return;
  if (red + green + blue < 540) return;

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.max(
      Math.abs(at(data, index) - red),
      Math.abs(at(data, index + 1) - green),
      Math.abs(at(data, index + 2) - blue),
    );
    if (distance >= tolerance) continue;
    data[index + 3] = Math.round(at(data, index + 3) * (distance / tolerance));
  }
}
