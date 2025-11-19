import React from "react";
import { useNavigate } from "react-router-dom";
import Particles from "../../components/common/Particles/Particles";
import Button from "../../components/common/Button/Button";
import "./PricingPage.css";

export default function PricingPage() {
  const navigate = useNavigate();

  const handleNew = () => {
    navigate("/flow");
  };

  return (
    <div className="pricing-page">
      {/* Particles background */}
      <div className="pricing-page__particles-container">
        <Particles
          particleColors={['#ffffff', '#ffffff']}
          particleCount={800}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={true}
          alphaParticles={false}
          disableRotation={false}
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

