import React from 'react';

export default function LoadingButton({ 
  loading = false, 
  disabled = false, 
  onClick, 
  children,
  loadingText = 'Fetching...',
  className = ''
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`
        px-4 py-2 rounded font-medium transition-all duration-200
        ${loading || disabled ? 'opacity-60 cursor-not-allowed bg-gray-300 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'}
        ${className}
      `}
    >
      {loading ? (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
          <span>{loadingText}</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
}
