import React, { useState } from "react";
import "./HomePage.css";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  return (
    <div className={`homepage${fadeOut ? ' fade-out' : ''}`}>
      {/* Hero Section */}
      <div className="hero-section">
        {/* Go to Start Page Button - Top Right */}
        <button
          onClick={() => {
            setFadeOut(true);
            setTimeout(() => navigate('/start'), 600);
          }}
          className="go-to-start-button"
        >
          Go to Start Page
        </button>

        {/* Pulsating Logo Icon */}
        <div className="logo-container">
          <img
            src="/logo.svg"
            alt="Dots logo icon"
            className="logo-icon"
          />
        </div>

        {/* Text Logo */}
        <img
          src="/text_logo.png"
          alt="Dots"
          className="text-logo"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />

        {/* Read More Button */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
            // Smooth scroll to content when expanded
            if (!isExpanded) {
              setTimeout(() => {
                window.scrollTo({
                  top: window.innerHeight,
                  behavior: 'smooth'
                });
              }, 300);
            }
          }}
          className="read-more-button"
        >
          Watch Demo
          <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>
            ▼
          </span>
        </button>
      </div>

      {/* Content Section */}
      <div className={`content-section ${isExpanded ? 'expanded' : ''}`}>
        <div className="content-container">
          <h2 className="content-title">
            Welcome to Dots
          </h2>
          <p className="content-text">
            Connect your ideas, visualize your thoughts, and explore the connections that matter most.
          </p>
          <p className="content-text">
            Dots is a powerful platform for organizing information and discovering meaningful relationships between concepts.
          </p>
        </div>
      </div>
    </div>
  );
}

