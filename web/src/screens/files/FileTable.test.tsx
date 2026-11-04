import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '../../app/files.ts';
import { coll, photo } from '../../test/photos.ts';
import { FileTable } from './FileTable.tsx';

const pdf: FileEntry = {
  kind: 'file',
  item: photo(
    'f1',
    null,
    { collectionId: 'files' },
    {
      name: 'Home insurance.pdf',
      size: 1_400_000,
      mime: 'application/pdf',
      modifiedAt: '2026-11-02T10:00:00Z',
    },
  ),
};
const taxes: FileEntry = {
  kind: 'folder',
  folder: coll('taxes', 'folder', { name: 'Taxes' }),
  files: 3,
  folders: 1,
};
const car: FileEntry = {
  kind: 'folder',
  folder: coll('car', 'folder', { name: 'Car' }),
  files: 0,
  folders: 0,
};
const old: FileEntry = {
  kind: 'folder',
  folder: coll('old', 'folder', { name: 'Old' }),
  files: 0,
  folders: 2,
};

function show(over: Partial<Parameters<typeof FileTable>[0]> = {}) {
  const props = {
    rows: [{ entry: taxes }, { entry: car }, { entry: pdf }],
    isEmpty: (id: string) => id === 'car',
    onOpen: vi.fn(),
    onAction: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <FileTable {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('FileTable', () => {
  it('a table of Name, Modified and Size, folders as links', () => {
    show();
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Modified', 'Size', 'Actions']);
    expect(screen.getByRole('link', { name: 'Taxes' })).toHaveAttribute('href', '/files/taxes');
    const row = screen.getByRole('row', { name: /Home insurance\.pdf/ });
    expect(row).toHaveTextContent('1.4 MB');
    expect(screen.getByRole('row', { name: /Taxes/ })).toHaveTextContent('3 files');
  });

  it('clicking a file name opens it', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'Home insurance.pdf' }));
    expect(p.onOpen).toHaveBeenCalledWith(pdf);
  });

  it('a file’s menu: Download, Move to…, Delete', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'More options for Home insurance.pdf' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Download', 'Move to…', 'Delete']);
    expect(within(menu).getByRole('menuitem', { name: 'Download' })).toHaveFocus();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to…' }));
    expect(p.onAction).toHaveBeenCalledWith('move', pdf);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a folder with things in it cannot be deleted, and says why', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'More options for Taxes' }));
    const item = screen.getByRole('menuitem', { name: "Folder isn't empty" });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Move or delete what is in it first.');
    fireEvent.click(item);
    expect(p.onAction).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Rename',
      "Folder isn't empty",
    ]);
  });

  it('an empty folder can be deleted', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'More options for Car' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(p.onAction).toHaveBeenCalledWith('delete', car);
  });

  it('Esc closes the menu and gives focus back to its button; arrows move through it', () => {
    show();
    const button = screen.getByRole('button', { name: 'More options for Home insurance.pdf' });
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Move to…' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('search results say where each one is', () => {
    show({ rows: [{ entry: pdf, where: 'Files › Taxes' }] });
    expect(screen.getByRole('row', { name: /Home insurance\.pdf/ })).toHaveTextContent(
      'In Files › Taxes',
    );
  });
});

it('a folder holding only folders says so, not "0 files"', () => {
  show({ rows: [{ entry: old }] });
  expect(screen.getByRole('row', { name: /Old/ })).toHaveTextContent('2 folders');
  expect(screen.getByRole('row', { name: /Old/ })).not.toHaveTextContent('0 files');
});
