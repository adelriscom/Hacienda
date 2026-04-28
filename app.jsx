// Main app — wires sidebar to screens, hosts Tweaks panel
const { useState, useEffect } = React;

const SCREENS = {
  dashboard: { comp: "Dashboard", label: "Dashboard" },
  expenses: { comp: "Transactions", label: "Gastos" },
  income: { comp: "Transactions", label: "Ingresos" },
  budgets: { comp: "Budgets", label: "Presupuestos" },
  calendar: { comp: "CalendarScreen", label: "Calendario" },
  review: { comp: "ReviewShared", label: "Por revisar" },
  reports: { comp: "Reconciliation", label: "Reportes" },
  recurring: { comp: "Reconciliation", label: "Recurrencias" },
  accounts: { comp: "Reconciliation", label: "Cuentas" },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "screen": "dashboard",
  "accent": "indigo",
  "density": "comfortable",
  "sidebarStyle": "full"
}/*EDITMODE-END*/;

const ACCENTS = {
  indigo:  { a: "#6366f1", b: "#a855f7", c: "#ec4899" },
  emerald: { a: "#10b981", b: "#06b6d4", c: "#84cc16" },
  amber:   { a: "#f97316", b: "#eab308", c: "#ef4444" },
  cyan:    { a: "#0ea5e9", b: "#6366f1", c: "#a855f7" },
};

function applyTweaks(t) {
  const a = ACCENTS[t.accent] || ACCENTS.indigo;
  document.documentElement.style.setProperty("--accent", a.a);
  document.documentElement.style.setProperty("--accent-2", a.b);
  document.documentElement.style.setProperty("--accent-3", a.c);
}

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useState(tw.screen || "dashboard");

  useEffect(() => { applyTweaks(tw); }, [tw.accent]);
  useEffect(() => { setTweak("screen", screen); }, [screen]);

  const compName = SCREENS[screen]?.comp || "Dashboard";
  const Comp = window[compName];

  return (
    <div className="app">
      <div className="app-shell">
        <Sidebar active={screen} onNav={setScreen} />
        <main className="main">
          {Comp ? <Comp /> : <div style={{ padding: 32 }}>Loading…</div>}
        </main>
      </div>

      <TweaksPanel>
        <TweakSection label="Vista">
          <TweakRadio
            label="Pantalla"
            value={screen}
            onChange={setScreen}
            options={Object.entries(SCREENS).map(([id, s]) => ({ value: id, label: s.label }))}
          />
        </TweakSection>
        <TweakSection label="Apariencia">
          <TweakRadio
            label="Color de acento"
            value={tw.accent}
            onChange={(v) => setTweak("accent", v)}
            options={[
              { value: "indigo", label: "Índigo" },
              { value: "emerald", label: "Esmeralda" },
              { value: "amber", label: "Ámbar" },
              { value: "cyan", label: "Cian" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
