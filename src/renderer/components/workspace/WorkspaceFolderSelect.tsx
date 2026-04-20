/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Close, FolderOpen } from '@icon-park/react';
import React from 'react';

type WorkspaceFolderSelectProps = {
  value?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  triggerTestId?: string;
};

const WorkspaceFolderSelect: React.FC<WorkspaceFolderSelectProps> = ({
  value,
  onChange,
  onClear,
  placeholder,
  triggerTestId,
}) => {
  const handleBrowse = async () => {
    try {
      const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
      if (files?.[0]) {
        onChange(files[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  return (
    <div
      data-testid={triggerTestId}
      onClick={() => void handleBrowse()}
      className='flex items-center justify-between px-12px py-10px rounded-8px cursor-pointer transition-colors bg-bg-1 border border-border-2 hover:bg-fill-2'
    >
      <span className={`text-14px truncate ${value ? 'text-t-primary' : 'text-t-tertiary'}`}>
        {value || placeholder}
      </span>
      <div className='flex items-center gap-8px shrink-0'>
        {value && (
          <Close
            theme='outline'
            size='14'
            fill='currentColor'
            className='text-t-tertiary transition-colors hover:text-t-primary'
            onClick={handleClear}
          />
        )}
        <FolderOpen theme='outline' size='18' fill='currentColor' className='text-t-tertiary' />
      </div>
    </div>
  );
};

export default WorkspaceFolderSelect;
