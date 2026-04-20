import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowOpen = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: (...args: unknown[]) => mockShowOpen(...args),
      },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  Close: ({ onClick }: { onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid='icon-close' onClick={onClick} />
  ),
  FolderOpen: () => <span data-testid='icon-folder-open' />,
}));

import WorkspaceFolderSelect from '@/renderer/components/workspace/WorkspaceFolderSelect';

describe('WorkspaceFolderSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowOpen.mockResolvedValue([]);
  });

  it('renders placeholder when value is empty', () => {
    render(
      <WorkspaceFolderSelect value='' onChange={vi.fn()} placeholder='Select folder' triggerTestId='ws-trigger' />
    );
    expect(screen.getByTestId('ws-trigger')).toHaveTextContent('Select folder');
  });

  it('renders the current value when set', () => {
    render(
      <WorkspaceFolderSelect
        value='/home/user/project'
        onChange={vi.fn()}
        placeholder='Select folder'
        triggerTestId='ws-trigger'
      />
    );
    expect(screen.getByTestId('ws-trigger')).toHaveTextContent('/home/user/project');
  });

  it('invokes the folder picker on click and forwards the chosen path', async () => {
    mockShowOpen.mockResolvedValue(['/chosen/path']);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect value='' onChange={onChange} placeholder='Select folder' triggerTestId='ws-trigger' />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/chosen/path'));
    expect(mockShowOpen).toHaveBeenCalledWith({ properties: ['openDirectory', 'createDirectory'] });
  });

  it('does not call onChange when the picker is dismissed', async () => {
    mockShowOpen.mockResolvedValue([]);
    const onChange = vi.fn();
    render(
      <WorkspaceFolderSelect value='' onChange={onChange} placeholder='Select folder' triggerTestId='ws-trigger' />
    );
    fireEvent.click(screen.getByTestId('ws-trigger'));
    await waitFor(() => expect(mockShowOpen).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onClear when close icon clicked and onClear prop is provided', () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <WorkspaceFolderSelect value='/current/path' onChange={onChange} onClear={onClear} placeholder='Select folder' />
    );
    fireEvent.click(screen.getByTestId('icon-close'));
    expect(onClear).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange with empty string when close icon clicked and no onClear prop', () => {
    const onChange = vi.fn();
    render(<WorkspaceFolderSelect value='/current/path' onChange={onChange} placeholder='Select folder' />);
    fireEvent.click(screen.getByTestId('icon-close'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('does not propagate click when close icon clicked (picker not triggered)', () => {
    const onChange = vi.fn();
    render(<WorkspaceFolderSelect value='/current/path' onChange={onChange} placeholder='Select folder' />);
    fireEvent.click(screen.getByTestId('icon-close'));
    expect(mockShowOpen).not.toHaveBeenCalled();
  });

  it('hides the close icon when value is empty', () => {
    render(<WorkspaceFolderSelect value='' onChange={vi.fn()} placeholder='Select folder' />);
    expect(screen.queryByTestId('icon-close')).not.toBeInTheDocument();
  });
});
