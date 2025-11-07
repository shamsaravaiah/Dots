import React from "react";
import "./Input.css";

const BLUE = "#4F86F7";

export default function Input({ 
  value, 
  onChange, 
  placeholder, 
  className = "",
  ...props 
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`input ${className}`}
      style={{
        width: "100%",
        padding: 14,
        borderRadius: 14,
        background: "#111",
        border: `1px solid ${BLUE}`,
        color: "white",
        textAlign: "left",
        outline: "none",
        boxShadow: "none",
        transition: "box-shadow 0.2s ease",
      }}
      onFocus={(e) =>
        (e.currentTarget.style.boxShadow = "0 0 0 3px rgba(79,134,247,0.25)")
      }
      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
      {...props}
    />
  );
}
