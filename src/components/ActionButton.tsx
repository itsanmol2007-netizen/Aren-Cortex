import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "ghost" | "danger";
};

export function ActionButton({ children, icon, variant = "ghost", className = "", ...props }: ActionButtonProps) {
  return (
    <button className={`action-button ${variant} ${className}`} type="button" {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
