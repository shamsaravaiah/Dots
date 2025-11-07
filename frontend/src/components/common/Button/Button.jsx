import React from "react";
import "./Button.css";

const BLUE = "#4F86F7";

export default function Button({ 
  children, 
  onClick, 
  className = "", 
  variant = "primary",
  ...props 
}) {
  const buttonClass = `button button--${variant} ${className}`;
  
  return (
    <button
      className={buttonClass}
      onClick={onClick}
      style={{
        backgroundColor: variant === "primary" ? BLUE : "transparent",
        border: `1px solid ${BLUE}`,
        color: "white",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (variant === "primary") {
          e.currentTarget.style.background = "#3b6fe0";
        }
      }}
      onMouseLeave={(e) => {
        if (variant === "primary") {
          e.currentTarget.style.background = BLUE;
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}
