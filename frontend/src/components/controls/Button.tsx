import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`qc-button qc-button--${variant} ${className}`.trim()} {...props}>
      {icon ? <span className="qc-button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
