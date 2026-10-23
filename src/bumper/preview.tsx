// Static home-card preview for Crazy Bumper: the round carnival arena from above with its candy-striped rail,
// a bumper post and three bumper cars. Flat colours only (DESIGN.md): no gradients or shadows.
export function BumperPreview() {
  const stripes = Array.from({ length: 28 }, (_, i) => i);
  return (
    <svg viewBox="0 0 200 100" className="block aspect-[2/1] w-full rounded-xl" aria-hidden="true">
      <rect width="200" height="100" fill="#c8ecd5" />
      {/* the rail: alternating red and white segments round the arena */}
      {stripes.map((i) => {
        const a0 = (i / 28) * Math.PI * 2,
          a1 = ((i + 1) / 28) * Math.PI * 2;
        const p = (a: number, r: number) => `${100 + Math.cos(a) * r * 1.9} ${50 + Math.sin(a) * r}`;
        return <path key={i} d={`M${p(a0, 46)} L${p(a1, 46)} L${p(a1, 41)} L${p(a0, 41)}Z`} fill={i % 2 ? '#ffffff' : '#e53950'} />;
      })}
      <ellipse cx="100" cy="50" rx="78" ry="41" fill="#fffdf7" />
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2;
        return <path key={k} d={`M100 50 L${100 + Math.cos(a) * 78} ${50 + Math.sin(a) * 41} L${100 + Math.cos(a + 0.5) * 78} ${50 + Math.sin(a + 0.5) * 41}Z`} fill="#e3f2fd" />;
      })}
      <path d="M100 39 l3 7 7 .5 -5.5 4.5 2 7 -6.5 -4 -6.5 4 2 -7 -5.5 -4.5 7 -.5z" fill="#f2d16b" />
      {/* a bumper post */}
      <ellipse cx="146" cy="40" rx="9" ry="6" fill="#00bcd4" />
      <ellipse cx="146" cy="37" rx="9" ry="6" fill="#4dd0e1" />
      {/* bumper cars: ring, shell, a round driver's head */}
      {[
        [62, 58, '#ff6d00', '#ffd600', '#8d6e63'],
        [118, 64, '#c2185b', '#ff4081', '#f5f5f5'],
        [86, 30, '#2e7d32', '#76ff03', '#7cb342'],
      ].map(([x, y, ring, body, head]) => (
        <g key={`${x}`}>
          <ellipse cx={x as number} cy={y as number} rx="12" ry="7" fill={ring as string} />
          <ellipse cx={x as number} cy={(y as number) - 2} rx="8" ry="4.6" fill={body as string} />
          <circle cx={x as number} cy={(y as number) - 6} r="3.4" fill={head as string} stroke="#23303f" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}
