"use client";

import { useState } from "react";

/**
 * LoadingPipeline — Animated progress indicator showing which pass is running.
 * @param {object} props
 * @param {"check"|"discover"} props.mode
 * @param {number} props.currentPass - 0=fetching, 1=pass1, 2=pass2, 3=pass3, 4=done
 * @param {string} props.statusMessage
 * @param {object} props.stats - { eliminated, survivors, rankedCount }
 */
export default function LoadingPipeline({ mode, currentPass, statusMessage, stats = {} }) {
  const steps =
    mode === "check"
      ? [
          { label: "Fetching data", icon: "🔍", pass: 0 },
          { label: "Analysing signals", icon: "🧠", pass: 1 },
          { label: "Generating verdict", icon: "⚖️", pass: 2 },
        ]
      : [
          { label: "Searching Amazon", icon: "🔍", pass: 0 },
          { label: "Pass 1 — Spec filter", icon: "📋", pass: 1 },
          { label: "Pass 2 — Review scoring", icon: "🧠", pass: 2 },
          { label: "Pass 3 — YouTube check", icon: "🎥", pass: 3 },
        ];

  return (
    <div className="loading-pipeline">
      <div className="pipeline-steps">
        {steps.map((step) => {
          const isDone = currentPass > step.pass;
          const isActive = currentPass === step.pass;
          return (
            <div
              key={step.pass}
              className={`pipeline-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
            >
              <div className="step-icon-wrap">
                {isDone ? (
                  <span className="step-check">✓</span>
                ) : isActive ? (
                  <span className="step-spinner" />
                ) : (
                  <span className="step-icon">{step.icon}</span>
                )}
              </div>
              <span className="step-label">{step.label}</span>
              {isActive && mode === "discover" && (
                <>
                  {step.pass === 1 && stats.survivors !== undefined && (
                    <span className="step-stat">{stats.survivors} survivors</span>
                  )}
                  {step.pass === 2 && stats.rankedCount !== undefined && (
                    <span className="step-stat">{stats.rankedCount} ranked</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {statusMessage && (
        <p className="pipeline-status">{statusMessage}</p>
      )}

      <div className="pipeline-bar-wrap">
        <div
          className="pipeline-bar"
          style={{ width: `${Math.min(100, (currentPass / (steps.length - 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
