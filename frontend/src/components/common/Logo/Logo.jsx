import React from "react";
import "./Logo.css";

export default function Logo({ className = "" }) {
  return (
    <img
      src="/logo.svg"
      alt="Dots logo"
      className={`logo ${className}`}
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}
