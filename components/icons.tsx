// Icon set from the original Day Book.
const P = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/>',
  roster:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M18 20a5 5 0 0 0-3-4.6"/>',
  cls: '<path d="M4 5h16v16H4zM4 9h16M9 3v3M15 3v3"/><path d="M8 14.5l1.8 1.8L13 12"/>',
  pay: '<path d="M3 7h18v10H3zM3 11h18M7 15h3"/>',
  scenes: '<path d="M4 4h16v14H4zM4 8h16M8 4v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  crm: '<path d="M3 5h18v14H3zM3 6l9 6 9-6"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
} as const;

export type IconName = keyof typeof P;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: P[name] }} />;
}
