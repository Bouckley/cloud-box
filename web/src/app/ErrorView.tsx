import { useTitle } from './title.ts';

/** A whole-page problem with one way forward. Never auto-dismissed. */
export function ErrorView({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; onClick(): void };
}) {
  useTitle(title);
  return (
    <div className="solo">
      <main className="solo__panel" id="content">
        <h1>{title}</h1>
        <p className="lede">{detail}</p>
        {action && (
          <div>
            <button type="button" className="button button--primary" onClick={action.onClick}>
              {action.label}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
