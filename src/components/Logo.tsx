import React from "react";

export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-grad-comp" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fbbf24" />
          <stop offset="100%" stop-color="#f97316" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#logo-grad-comp)" />
      <path d="M10 18.5a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 10 20.5v-2z" fill="#ffffff" opacity="0.9" />
      <path d="M16 8c-3 0-6 2-6 5.5s3 5.5 6 5.5 6-2 6-5.5S19 8 16 8zm-2 5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm5 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" fill="#ffffff" />
    </svg>
  );
}
