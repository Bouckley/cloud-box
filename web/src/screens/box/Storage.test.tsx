import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { coll, photo } from '../../test/photos.ts';
import { Storage, storageParts } from './Storage.tsx';

const GB = 1e9;

function snapshot() {
  const collections = new Map([
    ['album', coll('album', 'album')],
    ['docs', coll('docs', 'folder')],
  ]);
  const blobs = (n: number) => ({ original: { id: 'o', size: n } });
  const items = new Map([
    ['p', photo('p', null, { blobs: { ...blobs(3 * GB), thumb: { id: 't', size: GB } } })],
    ['v', photo('v', null, { blobs: blobs(2 * GB) }, { mime: 'video/mp4' })],
    [
      'f',
      photo('f', null, { collectionId: 'docs', blobs: blobs(GB) }, { mime: 'application/pdf' }),
    ],
  ]);
  return { collections, items, syncedAt: new Date() };
}

describe('Storage', () => {
  it('adds up the encrypted blob sizes per kind, here in the browser', () => {
    expect(storageParts(snapshot())).toEqual({ photos: 4 * GB, videos: 2 * GB, files: GB });
  });

  it('{used} of {size} used, and a bar whose label states the numbers', () => {
    render(
      <Storage
        drive={{ sizeBytes: 1000 * GB, freeBytes: 990 * GB }}
        parts={storageParts(snapshot())}
      />,
    );
    expect(screen.getByText(/of 1 TB used/)).toHaveTextContent('10 GB of 1 TB used');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Photos 4 GB, videos 2 GB, files 1 GB, other 3 GB, 990 GB free',
    );
    // The legend says the sizes too, so nobody has to judge the bar's colours.
    const legend = [...document.querySelectorAll('.usage-legend li')].map((li) => li.textContent);
    expect(legend).toEqual(['Photos 4 GB', 'Videos 2 GB', 'Files 1 GB', 'Other 3 GB']);
  });

  it('a kind with nothing in it takes no room in the bar', () => {
    render(
      <Storage
        drive={{ sizeBytes: 1000 * GB, freeBytes: 996 * GB }}
        parts={{ photos: 4 * GB, videos: 0, files: 0 }}
      />,
    );
    const parts = [...document.querySelectorAll('.usage .usage__part')].map((el) => el.className);
    expect(parts).toEqual(['usage__part usage__part--photos']);
    const legend = [...document.querySelectorAll('.usage-legend li')].map((li) => li.textContent);
    expect(legend).toEqual(['Photos 4 GB', 'Videos 0 bytes', 'Files 0 bytes']);
  });

  it('no Other when the library accounts for everything used', () => {
    render(
      <Storage
        drive={{ sizeBytes: 1000 * GB, freeBytes: 993 * GB }}
        parts={storageParts(snapshot())}
      />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Photos 4 GB, videos 2 GB, files 1 GB, 993 GB free',
    );
    expect(screen.queryByText(/^Other/)).toBeNull();
  });

  it('before the box answers it waits quietly', () => {
    render(<Storage drive={null} parts={storageParts(snapshot())} />);
    expect(screen.getByText('Checking your box…')).toBeInTheDocument();
  });
});
