import { useLocation, useSearchParams } from 'react-router';
import type { Grouping } from '../../app/timeline.ts';

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

const asGrouping = (v: string | null): Grouping => (v === 'months' || v === 'years' ? v : 'days');

/** The timeline's grouping, kept in the address (`?by=`) so the viewer and Back keep it. */
export function useGrouping(): Grouping {
  const [params] = useSearchParams();
  return asGrouping(params.get('by'));
}

/** The photo to focus when coming back from the viewer. */
export function useFocusId(): string | null {
  return (useLocation().state as { focus?: string } | null)?.focus ?? null;
}

/** Days / Months / Years. */
export function GroupBy() {
  const [, setParams] = useSearchParams();
  const grouping = useGrouping();
  return (
    <div className="segmented" role="group" aria-label="Group photos by">
      {GROUPINGS.map((g) => (
        <button
          key={g.value}
          type="button"
          className="segmented__option"
          aria-pressed={grouping === g.value}
          onClick={() => setParams(g.value === 'days' ? {} : { by: g.value }, { replace: true })}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
