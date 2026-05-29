"use client";

/**
 * components/LLMSelector.jsx
 * Modular LLM provider + model picker.
 *
 * Props:
 *   value:    { provider: string, model: string }
 *   onChange: (newConfig) => void
 *   disabled: boolean
 */

const PROVIDERS = [
  {
    id: "claude",
    label: "Claude",
    badge: "Anthropic",
    icon: "🧠",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Sonnet 4", tag: "Recommended" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tag: "Fast" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "gemini",
    label: "Gemini",
    badge: "Google",
    icon: "✦",
    models: [
      { id: "gemini-2.5-flash", label: "2.5 Flash", tag: "Recommended" },
      { id: "gemini-2.5-pro", label: "2.5 Pro", tag: "Powerful" },
      { id: "gemini-2.0-flash", label: "2.0 Flash", tag: "Fast" },
    ],
    defaultModel: "gemini-2.5-flash",
  },
];

export default function LLMSelector({ value, onChange, disabled }) {
  const activeProvider = PROVIDERS.find((p) => p.id === value.provider) || PROVIDERS[0];

  function handleProviderChange(providerId) {
    const prov = PROVIDERS.find((p) => p.id === providerId);
    if (prov) {
      onChange({ provider: prov.id, model: prov.defaultModel });
    }
  }

  function handleModelChange(modelId) {
    onChange({ ...value, model: modelId });
  }

  return (
    <div className="llm-selector" aria-label="LLM Model Selector">
      <div className="llm-selector-label">
        <span className="llm-selector-icon">⚙</span>
        AI Model
      </div>

      {/* Provider tabs */}
      <div className="llm-provider-tabs" role="tablist" aria-label="LLM Provider">
        {PROVIDERS.map((prov) => (
          <button
            key={prov.id}
            id={`llm-provider-${prov.id}`}
            role="tab"
            type="button"
            aria-selected={value.provider === prov.id}
            className={`llm-provider-tab ${value.provider === prov.id ? "active" : ""}`}
            onClick={() => handleProviderChange(prov.id)}
            disabled={disabled}
          >
            <span className="llm-provider-icon">{prov.icon}</span>
            <span className="llm-provider-name">{prov.label}</span>
            <span className="llm-provider-badge">{prov.badge}</span>
          </button>
        ))}
      </div>

      {/* Model pills */}
      <div className="llm-model-pills" role="group" aria-label="Model variant">
        {activeProvider.models.map((m) => (
          <button
            key={m.id}
            id={`llm-model-${m.id.replace(/[^a-z0-9]/gi, "-")}`}
            type="button"
            className={`llm-model-pill ${value.model === m.id ? "active" : ""}`}
            onClick={() => handleModelChange(m.id)}
            disabled={disabled}
          >
            {m.label}
            {m.tag && <span className="llm-model-tag">{m.tag}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
