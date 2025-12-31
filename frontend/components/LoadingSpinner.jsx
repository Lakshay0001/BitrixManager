import React from 'react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 shadow-lg max-w-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-700 font-medium">{message}</p>
        </div>
      </div>
    </div>
  );
}
