import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { createRouter } from './routes.tsx';
import { SessionProvider } from './session.tsx';

export function App() {
  const [router] = useState(createRouter);
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
