import React from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/common/Button/Button";
import "./PricingPage.css";

export default function PricingPage() {
  const navigate = useNavigate();

  const handleNew = () => {
    navigate("/flow");
  };

  return (
    <div className="pricing-page">
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
          <h2 className="pricing-page__card-title">Basic</h2>
          <p className="pricing-page__card-caption">Perfect for individuals exploring ideas.</p>
        </div>
        <div className="pricing-page__card">
          <h2 className="pricing-page__card-title">Plus</h2>
          <p className="pricing-page__card-caption">Ideal for collaborators building together.</p>
        </div>
        <div className="pricing-page__card">
          <h2 className="pricing-page__card-title">Pro</h2>
          <p className="pricing-page__card-caption">Designed for teams scaling connected knowledge.</p>
        </div>
      </div>
    </div>
  );
}

