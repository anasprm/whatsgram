"use client";

import React, { useEffect, useRef } from "react";

interface DropdownItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

interface BulletproofDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  items: DropdownItem[];
  align?: "left" | "right";
}

export const BulletproofDropdown: React.FC<BulletproofDropdownProps> = ({
  isOpen,
  onClose,
  items,
  align = "right",
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={`absolute z-50 mt-2 w-56 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 p-1.5 shadow-xl backdrop-blur-xl transition-all animate-in fade-in zoom-in-95 duration-150 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center space-x-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
            item.danger
              ? "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
          }`}
        >
          {item.icon && <span className="text-sm">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
