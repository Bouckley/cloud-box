import { useTitle } from '../app/title.ts';

// Entry screens. Task 12 builds their forms; for now each states its job.

function Solo({ title, lede, fullTitle }: { title: string; lede: string; fullTitle?: boolean }) {
  useTitle(title, fullTitle);
  return (
    <div className="solo">
      <main className="solo__panel" id="content">
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </main>
    </div>
  );
}

export const SetupScreen = () => (
  <Solo
    title="Set up your Cloud Box"
    fullTitle
    lede="Press the power button on the front of your box once. Then come back here to choose a password."
  />
);

export const UnlockScreen = () => (
  <Solo title="Unlock your Cloud Box" lede="Enter your password to see your photos and files." />
);

export const ConnectScreen = ({ revoked }: { revoked: boolean }) => (
  <Solo
    title="Connect this browser"
    lede={
      revoked
        ? 'This browser was removed from your box.'
        : 'On a computer or phone that already uses your box, open Box › Add a device to get a code.'
    }
  />
);

export const ForgotScreen = () => (
  <Solo title="Forgot your password?" lede="Your 24-word recovery key lets you choose a new one." />
);

export const LoadingScreen = () => (
  <div className="solo">
    <main className="solo__panel" id="content" aria-busy="true">
      <p className="lede" role="status">
        Connecting to your box…
      </p>
    </main>
  </div>
);
