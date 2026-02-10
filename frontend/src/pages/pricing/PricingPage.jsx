import React from "react";
import { useNavigate } from "react-router-dom";
import DotGrid from "../../components/common/DotGrid/DotGrid";
import Button from "../../components/common/Button/Button";
import "./PricingPage.css";

export default function PricingPage() {
  const navigate = useNavigate();

  const handleNew = () => {
    // Don't create canvas in database - just navigate to start page
    // Canvas will only be created when user asks a question
    navigate('/start');
  };

  return (
    <div className="pricing-page">
      {/* DotGrid background - same settings as StartPage */}
      <div className="pricing-page__particles-container">
        <DotGrid
          dotSize={4}
          gap={10}
          baseColor="#000000"
          activeColor="#4f86f7"
          proximity={120}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
        />
      </div>
      
      {/* Content wrapper */}
      <div className="pricing-page__content-wrapper">
        <div className="pricing-page__actions">
          <Button onClick={handleNew} className="button--floating">
            New +
          </Button>
        </div>
        <div className="pricing-page__hero">
          <img
            src="/text_logo.png"
            alt="Dots logo"
            className="pricing-page__logo"
          />
          <p className="pricing-page__intro">
            dots is an initiative by a student that you know — it&apos;s here to let you imagine the way you think.
          </p>
        </div>

        <div className="pricing-page__tiers">
          <div className="pricing-page__card">
            <h2 className="pricing-page__card-title">Free</h2>
            <p className="pricing-page__card-caption">Perfect for individuals exploring ideas.</p>
          </div>
          <div className="pricing-page__card">
            <h2 className="pricing-page__card-title">Monthly</h2>
            <p className="pricing-page__card-caption">Ideal for collaborators building together.</p>
          </div>
          <div className="pricing-page__card">
            <h2 className="pricing-page__card-title">Semester</h2>
            <p className="pricing-page__card-caption">Designed for students and learners.</p>
          </div>
          <div className="pricing-page__card">
            <h2 className="pricing-page__card-title">Yearly</h2>
            <p className="pricing-page__card-caption">Best value for long-term commitment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

