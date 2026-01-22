// components/UI/ShowHideTokenButton.js

import React from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'; // Correct imports

// ShowHideTokenButton Component
const ShowHideTokenButton = ({ isMasked, toggleMask }) => {
  return (
    <button
      onClick={toggleMask}
      className="glass flex items-center gap-2 p-2"
      style={{ borderRadius: '5px' }}
    >
      {isMasked ? (
        <EyeSlashIcon className="w-5 h-5 text-gray-500" />
      ) : (
        <EyeIcon className="w-5 h-5 text-gray-500" />
      )}
    </button>
  );
};

export default ShowHideTokenButton;
