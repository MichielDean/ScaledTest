import React from 'react';

/**
 * A React functional component that renders an eye icon SVG.
 *
 * This component is used to indicate the "visible" state in password visibility toggles.
 * It is typically displayed when the password is visible to the user.
 *
 * @component
 * @example
 * // Usage in a password toggle button
 * <button onClick={togglePasswordVisibility}>
 *   {isPasswordVisible ? <EyeIcon /> : <EyeOffIcon />}
 * </button>
 */
export const EyeIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * Eye-off icon SVG for hiding password (hidden state).
 *
 * This component is used in password visibility toggles to indicate
 * that the password is currently hidden. It is typically displayed
 * when the user has chosen to obscure the password input.
 *
 * @component
 * @example
 * // Usage in a password toggle button
 * <button onClick={togglePasswordVisibility}>
 *   {isPasswordVisible ? <EyeIcon /> : <EyeOffIcon />}
 * </button>
 */
export const EyeOffIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

/**
 * Password toggle icon component that shows appropriate icon based on visibility state
 */
export interface PasswordToggleIconProps {
  isVisible: boolean;
}

export const PasswordToggleIcon: React.FC<PasswordToggleIconProps> = ({ isVisible }) => (
  <span aria-hidden="true">{isVisible ? <EyeIcon /> : <EyeOffIcon />}</span>
);
