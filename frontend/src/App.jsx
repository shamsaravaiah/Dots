import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/home/HomePage";
import FlowPage from "./pages/flow/FlowPage";
import StartPage from "./pages/start/StartPage";
import PricingPage from "./pages/pricing/PricingPage";
import "./styles/globals.css";
import "./styles/variables.css";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/flow" element={<FlowPage />} />
        <Route path="/start" element={<StartPage />} />
        <Route path="/pricing" element={<PricingPage />} />
      </Routes>
    </Router>
  );
}