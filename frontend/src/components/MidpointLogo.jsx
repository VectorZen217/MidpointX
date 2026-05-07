import React from 'react';

export default function MidpointLogo({ size = 32, className = '' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1f72b9" />
          <stop offset="100%" stopColor="#0d3f6d" />
        </linearGradient>
        <linearGradient id="greenGrad" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6fce6e" />
          <stop offset="100%" stopColor="#288935" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.4" />
        </filter>
      </defs>
      
      {/* Right side Green Chevron */}
      <path 
        d="M 100 10 L 70 10 L 40 50 L 70 90 L 100 90 L 70 50 Z" 
        fill="url(#greenGrad)" 
      />
      
      {/* Left side Blue Chevron (overlaps, with shadow) */}
      <path 
        d="M 0 10 L 30 10 L 60 50 L 30 90 L 0 90 L 30 50 Z" 
        fill="url(#blueGrad)" 
        filter="url(#shadow)"
      />
      
    </svg>
  );
}
