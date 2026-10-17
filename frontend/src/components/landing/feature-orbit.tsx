"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, History, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { AegisMark } from "@/components/shell/brand";
import { cn } from "@/lib/utils";
import styles from "./feature-orbit.module.css";

type DemoId = "risk" | "replay" | "proposal" | "advisor";

const DEMOS: { id: DemoId; title: string; eyebrow: string; description: string }[] = [
  { id: "risk", title: "Risk profile", eyebrow: "01 · SUITABILITY", description: "Capacity and willingness shape the risk tier." },
  { id: "replay", title: "Crisis replay", eyebrow: "02 · EXPERIENCE", description: "Watch a portfolio move through a historical crisis." },
  { id: "proposal", title: "Build a proposal", eyebrow: "03 · COMPLIANCE", description: "A portfolio mix meets a nine-rule gate." },
  { id: "advisor", title: "Ask Aegis", eyebrow: "04 · EXPLANATION", description: "Ask a question and inspect where the answer comes from." },
];

function RiskPreview({ active }: { active: boolean }) {
  return (
    <div className={cn("flex h-[112px] items-center justify-center gap-5 rounded-xl px-4", styles.previewPanel)}>
      <div className="relative flex h-[78px] w-[132px] items-end justify-center overflow-hidden">
        <svg viewBox="0 0 140 80" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d="M12 76a58 58 0 0 1 116 0" fill="none" stroke="var(--orbit-track)" strokeWidth="11" strokeLinecap="round" />
          <path d="M12 76a58 58 0 0 1 116 0" fill="none" stroke="var(--orbit-accent)" strokeWidth="11" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={active ? 32 : 100} className={cn("transition-[stroke-dashoffset] duration-[1800ms] ease-out motion-reduce:transition-none", active && styles.riskPulse)} />
        </svg>
        <div className="relative mb-1 text-center">
          <p className={cn("font-display text-2xl font-bold", styles.previewText)}>R4</p>
          <p className={cn("text-[9px] uppercase tracking-[.16em]", styles.previewMuted)}>Example tier</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {[{ label: "Capacity", width: "70%" }, { label: "Willingness", width: "70%" }].map((item, index) => (
          <div key={item.label}>
            <div className={cn("mb-1 flex justify-between text-[10px]", styles.previewMuted)}><span>{item.label}</span><span>70</span></div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--orbit-track)" }}>
              <div className={cn("h-full rounded-full bg-indigo-300 transition-[width] duration-1000 ease-out motion-reduce:transition-none", active ? "w-[70%]" : "w-0")} style={{ width: active ? item.width : "0%", transitionDelay: active ? `${index * 150}ms` : "0ms" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReplayPreview({ active }: { active: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", styles.previewPanel)}>
      <div className={cn("mb-2 flex items-center justify-between text-[10px]", styles.previewMuted)}>
        <span className="inline-flex items-center gap-1.5"><History className="size-3" aria-hidden="true" /> Global financial crisis</span>
        <span>2007 — 2009</span>
      </div>
      <svg viewBox="0 0 300 90" className="h-[76px] w-full" fill="none" role="img" aria-label="Illustrative crisis replay chart">
        <path d="M4 18H296M4 45H296M4 72H296" stroke="var(--orbit-grid)" strokeDasharray="3 5" />
        <path d="M6 20C26 16 35 22 53 26S75 28 94 34s18 17 37 14 20 21 38 23 20-19 38-14 23-16 40-17 31 6 47-2" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={active ? 0 : 100} className="transition-[stroke-dashoffset] duration-[2400ms] ease-out motion-reduce:transition-none" />
        <circle cx="209" cy="57" r="5" fill={active ? "#818cf8" : "#64748b"} className="transition-colors duration-500" />
        <circle cx="209" cy="57" r="10" stroke="#6366f1" strokeOpacity={active ? ".28" : "0"} className="transition-opacity duration-500" />
      </svg>
      <div className={cn("mt-1 flex items-center justify-between text-[10px]", styles.previewMuted)}><span>Portfolio path · illustrative</span><span className={cn("inline-flex items-center gap-1", active && "text-indigo-600 dark:text-indigo-200")}><span className={cn("size-1.5 rounded-full", active ? "animate-pulse bg-indigo-500 dark:bg-indigo-200 motion-reduce:animate-none" : "bg-slate-500")} />{active ? "Playing" : "Replay"}</span></div>
    </div>
  );
}

function ProposalPreview({ active }: { active: boolean }) {
  const mix = [
    { label: "Equity", width: "42%", color: "bg-indigo-300" },
    { label: "Bonds", width: "34%", color: "bg-sky-300" },
    { label: "Cash & gold", width: "24%", color: "bg-amber-300" },
  ];
  return (
    <div className={cn("rounded-xl p-4", styles.previewPanel)}>
      <div className="flex items-center justify-between">
        <div><p className={cn("text-[10px]", styles.previewMuted)}>Example proposal</p><p className={cn("mt-1 text-sm font-semibold", styles.previewText)}>CNY 200,000 · 8 years</p></div>
        <span className={cn("inline-flex items-center gap-1 rounded-full bg-emerald-700/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200", active && styles.proposalPass)}><Check className="size-3" aria-hidden="true" /> Pass</span>
      </div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--orbit-track)" }}>
        {mix.map((item, index) => <span key={item.label} className={cn("h-full transition-[width] duration-700 ease-out motion-reduce:transition-none", item.color)} style={{ width: active ? item.width : "0%", transitionDelay: active ? `${index * 150}ms` : "0ms" }} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {mix.map((item) => <span key={item.label} className={cn("inline-flex items-center gap-1.5 text-[9px]", styles.previewMuted)}><span className={cn("size-1.5 rounded-full", item.color)} />{item.label}</span>)}
        <span className={cn("ml-auto text-[9px]", styles.previewMuted)}>9 checks</span>
      </div>
    </div>
  );
}

function AdvisorPreview({ active }: { active: boolean }) {
  const [replyReady, setReplyReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReplyReady(false);
      return;
    }

    const timer = window.setTimeout(() => setReplyReady(true), 850);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div className={cn("space-y-2 rounded-xl p-3.5", styles.previewPanel)}>
      <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-[10px] leading-relaxed" style={{ background: "var(--orbit-bubble)" }}>Which product costs me least?</div>
      <div className={cn("max-w-[94%] rounded-xl rounded-tl-sm border px-3 py-2 text-[10px] leading-relaxed transition-opacity duration-500", active ? "opacity-100" : "opacity-65")} style={{ background: "var(--orbit-answer)", borderColor: "var(--orbit-answer-border)" }}>
        <span className="mb-1 inline-flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-200"><Sparkles className="size-3" aria-hidden="true" /> Aegis</span>
        {active && !replyReady ? (
          <span role="status" className={cn("inline-flex items-center gap-2 text-[9px]", styles.previewMuted)}>
            Aegis is typing
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              {[0, 120, 240].map((delay) => <span key={delay} className={cn("size-1 rounded-full bg-violet-200", styles.typingDot)} style={{ animationDelay: `${delay}ms` }} />)}
            </span>
          </span>
        ) : (
          <div className={cn(replyReady && styles.messageReveal)}>
            <p>I’ll compare the fees and show where each figure comes from.</p>
            <span className={cn("mt-1.5 inline-flex items-center gap-1 text-[9px]", styles.previewMuted)}><ShieldCheck className="size-3" aria-hidden="true" /> Traceable answer</span>
          </div>
        )}
      </div>
      {active ? <span className={cn("ml-1 inline-flex items-center gap-1 text-[9px]", styles.previewMuted)}><MessageCircle className="size-3" aria-hidden="true" /> Example conversation</span> : null}
    </div>
  );
}

function DemoCard({ id, active, onSelect, place = "" }: { id: DemoId; active: boolean; onSelect: () => void; place?: string }) {
  const demo = DEMOS.find((item) => item.id === id)!;
  return (
    <article
      className={cn(
        "group relative w-full max-w-[360px] justify-self-center rounded-2xl p-3 text-left backdrop-blur-sm transition duration-1000 ease-in-out motion-reduce:transition-none",
        styles.demoCard,
        place,
        active ? styles.demoCardActive : styles.demoCardIdle
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={active} aria-label={`Preview ${demo.title}: ${demo.description}`} className={cn("absolute inset-0 z-10 rounded-2xl", styles.cardSelect)} />
      <div aria-hidden="true" className="pointer-events-none">
      <div className="mb-2.5 flex items-start justify-between gap-2 px-1">
        <div>
          <p className={cn("text-[9px] font-bold tracking-[.16em]", styles.cardEyebrow)}>{demo.eyebrow}</p>
          <p className={cn("mt-1 text-xs font-semibold sm:text-[13px]", styles.cardTitle)}>{demo.title}</p>
        </div>
        {active ? <span className={cn("mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-semibold uppercase tracking-wide", styles.previewBadge)}><span className="size-1 animate-pulse rounded-full bg-violet-500 dark:bg-violet-300 motion-reduce:animate-none" /> Previewing</span> : null}
      </div>
      <div className="overflow-hidden rounded-xl">
        {id === "risk" ? <RiskPreview active={active} /> : null}
        {id === "replay" ? <ReplayPreview active={active} /> : null}
        {id === "proposal" ? <ProposalPreview active={active} /> : null}
        {id === "advisor" ? <AdvisorPreview active={active} /> : null}
      </div>
      <p className={cn("mt-2.5 px-1 text-[9px]", styles.previewMuted)}>{demo.description}</p>
      </div>
    </article>
  );
}

function CenterBrand() {
  return (
    <div className="flex items-center justify-center gap-4 text-left">
      <AegisMark className="size-14 shrink-0 sm:size-16" />
      <div className="flex flex-col leading-none">
        <p className={cn("font-display text-[34px] font-bold tracking-[-0.04em] sm:text-[38px]", styles.brandName)}>Aegis</p>
        <p className={cn("mt-1 text-[17px] font-normal tracking-normal sm:text-[18px]", styles.brandTagline)}>Wealth AI</p>
      </div>
    </div>
  );
}

function FeaturePicker({ activeIndex, onPick }: { activeIndex: number; onPick: (index: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2.5" role="group" aria-label="Choose a feature preview">
      {DEMOS.map((demo, index) => (
        <button
          key={demo.id}
          type="button"
          onClick={() => onPick(index)}
          aria-label={`Show ${demo.title}`}
          aria-pressed={index === activeIndex}
          className={cn(
            "transition",
            styles.featureControl,
            index === activeIndex ? cn("h-2.5 w-7", styles.featureDotActive) : cn("size-2.5", styles.featureDot)
          )}
        />
      ))}
    </div>
  );
}

export function FeatureOrbit() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeDemo = DEMOS[activeIndex];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % DEMOS.length), 3000);
    return () => window.clearInterval(timer);
  }, []);

  function pickDemo(index: number) {
    setActiveIndex(index);
  }

  return (
    <main className={styles.landing}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <header className="absolute right-5 top-5 z-30 sm:right-8 sm:top-7">
        <Link href="/login" className={cn("rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", styles.loginLink)}>Log in</Link>
      </header>

      <div className={cn(styles.orbitStage, "hidden xl:block")} role="group" aria-label="Aegis feature previews orbit around the logo">
        <div className={styles.orbitRing}>
          {DEMOS.map((demo, index) => (
            <div key={demo.id} className={styles.orbitNode} data-orbit={demo.id}>
              <div className={styles.orbitFace}>
                <DemoCard id={demo.id} active={activeDemo.id === demo.id} onSelect={() => pickDemo(index)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto hidden min-h-screen max-w-[1320px] items-center justify-center px-4 xl:flex">
        <div className="flex flex-col items-center">
          <CenterBrand />
          <p className={cn("mt-3 text-center text-xs font-semibold", styles.cardTitle)}>{activeDemo.title}</p>
          <p className={cn("mt-1 max-w-[250px] text-center text-[10px] leading-relaxed", styles.activeDescription)}>{activeDemo.description}</p>
          <div className="mt-4">
            <FeaturePicker activeIndex={activeIndex} onPick={pickDemo} />
          </div>
          <Link href="/login" className={cn("mt-4 inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", styles.primaryAction)}>
            Enter sandbox <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 pb-10 pt-20 xl:hidden">
        <CenterBrand />
        <p className={cn("mt-3 text-center text-xs", styles.supportingText)}>Risk-aware advice. Your decision.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2" role="group" aria-label="Choose a feature preview">
          {DEMOS.map((demo, index) => (
            <button key={demo.id} type="button" onClick={() => pickDemo(index)} aria-pressed={activeIndex === index} className={cn("rounded-full border px-3 py-2 text-[11px] font-medium transition", styles.featureChip, activeIndex === index && styles.featureChipActive)}>
              {demo.title}
            </button>
          ))}
        </div>
        <div className="mt-4 w-full max-w-[420px]">
          <DemoCard id={activeDemo.id} active onSelect={() => setActiveIndex((index) => (index + 1) % DEMOS.length)} place="" />
        </div>
        <Link href="/login" className={cn("mt-6 inline-flex h-10 items-center gap-2 rounded-full px-5 text-xs font-bold", styles.primaryAction)}>
          Enter sandbox <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        <p className={cn("mt-4 text-[10px]", styles.supportingText)}>Simulated accounts · no real money</p>
      </div>
    </main>
  );
}
