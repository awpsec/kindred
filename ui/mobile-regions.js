// System frames are in web-host points. Convert to CSS pixels, clip to this
// window, and ignore inactive folds. No device dimensions or angle thresholds.
export function mobileRegions(native, width, height) {
  const sx = width / (native?.width || width), sy = height / (native?.height || height);
  const raw = Array.isArray(native?.reservedRegions) ? native.reservedRegions : [];
  const regions = raw.filter(r => r.active !== false && ['division', 'occlusion'].includes(r.kind)
    && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0)
    .map(r => {
      const x = Math.max(0, r.x * sx), y = Math.max(0, r.y * sy);
      return {...r, x, y, width: Math.min(width, (r.x + r.width) * sx) - x,
        height: Math.min(height, (r.y + r.height) * sy) - y};
    }).filter(r => r.width > 0 && r.height > 0);
  const vertical = regions.find(r => r.kind === 'division' && r.height > r.width && r.x > 0 && r.x + r.width < width);
  const horizontal = regions.find(r => r.kind === 'division' && r.width > r.height && r.y > 0 && r.y + r.height < height);
  // Lightweight overlays stay in one usable region. Prefer the trailing half
  // in book pose and the upper half in tabletop pose, then avoid active cameras.
  let safe = vertical ? {x: vertical.x + vertical.width, y: 0, width: width - vertical.x - vertical.width, height}
    : horizontal ? {x: 0, y: 0, width, height: horizontal.y} : {x: 0, y: 0, width, height};
  const edges = regions.filter(r => r.kind === 'division' && r !== vertical && r !== horizontal);
  for (const r of [...edges, ...regions.filter(r => r.kind === 'occlusion')]) {
    const right = safe.x + safe.width, bottom = safe.y + safe.height;
    if (r.x >= right || r.x + r.width <= safe.x || r.y >= bottom || r.y + r.height <= safe.y) continue;
    const choices = [
      {...safe, width: r.x - safe.x}, {...safe, x: r.x + r.width, width: right - r.x - r.width},
      {...safe, height: r.y - safe.y}, {...safe, y: r.y + r.height, height: bottom - r.y - r.height},
    ].filter(c => c.width > 0 && c.height > 0);
    if (choices.length) safe = choices.sort((a,b) => b.width*b.height-a.width*a.height)[0];
  }
  return {edge: edges.length > 0, inner: raw.some(r => r.kind === 'division'), regions, vertical, horizontal, safe};
}
