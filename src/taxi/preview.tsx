// Static home-card preview for Rush Taxi: a harbour-town crossing from above, the Love River on the left, rooftops
// with water tanks, a waiting rider and the yellow cab turning into the street. Flat colours only (DESIGN.md): no
// gradients or shadows.
export function TaxiPreview() {
  const roofs: [number, number, number, number, string][] = [
    [62, 6, 34, 26, '#e8d9b8'],
    [100, 6, 22, 26, '#c96f5a'],
    [62, 66, 26, 28, '#9fc7b8'],
    [92, 66, 30, 28, '#e8d9b8'],
    [148, 6, 46, 26, '#8ea4b8'],
    [148, 66, 22, 28, '#c96f5a'],
    [174, 66, 20, 28, '#e8d9b8'],
  ];
  return (
    <svg viewBox="0 0 200 100" className="block aspect-[2/1] w-full rounded-xl" aria-hidden="true">
      <rect width="200" height="100" fill="#d9cfbd" />
      {/* the river with its banks */}
      <rect x="0" y="0" width="44" height="100" fill="#2b8fd6" />
      <rect x="44" y="0" width="4" height="100" fill="#7da453" />
      <path d="M8 20h10M22 46h12M6 72h10" stroke="#9fd0f2" strokeWidth="2" strokeLinecap="round" />
      {/* roads: one along the river, one across, one down the middle */}
      <rect x="48" y="38" width="152" height="22" fill="#3a3f47" />
      <rect x="126" y="0" width="18" height="100" fill="#3a3f47" />
      <path d="M52 49h8M66 49h8M80 49h8M94 49h8M108 49h8M152 49h8M166 49h8M180 49h8" stroke="#fffaf2" strokeWidth="1.6" />
      {/* zebra crossing */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={128 + i * 4} y="62" width="2" height="8" fill="#fffaf2" />
      ))}
      {/* rooftops with water tanks */}
      {roofs.map(([x, y, w, h, c]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={w} height={h} fill={c} stroke="#23303f" strokeWidth="1" />
          <circle cx={x + w - 6} cy={y + 6} r="3" fill="#c0c7cf" stroke="#23303f" strokeWidth="0.8" />
        </g>
      ))}
      {/* a rider waiting on the kerb */}
      <circle cx="114" cy="62" r="5" fill="#4caf50" stroke="#23303f" strokeWidth="1" />
      {/* the cab, heading right along the street */}
      <g transform="translate(78 41)">
        <rect x="0" y="0" width="26" height="15" rx="3" fill="#ffc72c" stroke="#23303f" strokeWidth="1.4" />
        <rect x="6" y="2.5" width="12" height="10" rx="1.5" fill="#5c7a99" />
        <rect x="9.5" y="5" width="5" height="5" fill="#fffaf2" stroke="#23303f" strokeWidth="0.6" />
        <rect x="24" y="2" width="2.5" height="3" fill="#fffaf2" />
        <rect x="24" y="10" width="2.5" height="3" fill="#fffaf2" />
      </g>
    </svg>
  );
}
