import { useState, useEffect, useCallback, useRef } from "react";

const FRAME_COUNT = 8;
const PAGE_COUNT = 16;

const COLORS = {
  free: "#1a1a2e",
  page: ["#7c3aed","#0d9488","#d97706","#dc2626","#2563eb","#059669","#db2777","#ea580c","#7c3aed","#0f766e","#b45309","#b91c1c","#1d4ed8","#047857","#be185d","#c2410c"],
  fault: "#ef4444",
  hit: "#22c55e",
};

function generateAccessSequence(length = 20, pageCount = PAGE_COUNT) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(Math.floor(Math.random() * pageCount));
  }
  return seq;
}

function lruReplace(frames, framesHistory, incoming) {
  let lruIdx = 0;
  let oldest = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const lastUsed = framesHistory[frames[i]] ?? -Infinity;
    if (lastUsed < oldest) {
      oldest = lastUsed;
      lruIdx = i;
    }
  }
  return lruIdx;
}

function optimalReplace(frames, future) {
  let farthest = -1;
  let replaceIdx = 0;
  for (let i = 0; i < frames.length; i++) {
    const nextUse = future.indexOf(frames[i]);
    if (nextUse === -1) return i;
    if (nextUse > farthest) {
      farthest = nextUse;
      replaceIdx = i;
    }
  }
  return replaceIdx;
}

function fifoReplace(fifoQueue) {
  return fifoQueue[0];
}

function simulateAlgorithm(sequence, frameCount, algorithm) {
  const frames = new Array(frameCount).fill(-1);
  const steps = [];
  let faults = 0;
  let fifoQueue = [];
  let lastUsed = {};

  for (let t = 0; t < sequence.length; t++) {
    const page = sequence[t];
    const hit = frames.includes(page);
    let evicted = -1;
    let frameIdx = -1;

    if (hit) {
      lastUsed[page] = t;
      frameIdx = frames.indexOf(page);
    } else {
      faults++;
      const emptyIdx = frames.indexOf(-1);
      if (emptyIdx !== -1) {
        frameIdx = emptyIdx;
        frames[frameIdx] = page;
        if (algorithm === "fifo") fifoQueue.push(frameIdx);
      } else {
        if (algorithm === "lru") {
          frameIdx = lruReplace(frames, lastUsed, page);
        } else if (algorithm === "optimal") {
          const future = sequence.slice(t + 1);
          frameIdx = optimalReplace(frames, future);
        } else {
          const fifoFrameIdx = fifoReplace(fifoQueue);
          frameIdx = fifoFrameIdx;
          fifoQueue = [...fifoQueue.slice(1), fifoFrameIdx];
        }
        evicted = frames[frameIdx];
        frames[frameIdx] = page;
      }
      lastUsed[page] = t;
    }

    steps.push({
      page,
      hit,
      evicted,
      frames: [...frames],
      frameIdx,
      fault: !hit,
    });
  }

  return { steps, faults, hits: sequence.length - faults };
}

function MemoryFrame({ page, highlight, animating }) {
  const color = page === -1 ? "transparent" : COLORS.page[page % COLORS.page.length];
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 8,
      border: highlight ? `2px solid ${highlight}` : "1.5px solid rgba(255,255,255,0.12)",
      background: page === -1 ? "rgba(255,255,255,0.03)" : color + "33",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      transition: "all 0.3s",
      boxShadow: animating ? `0 0 16px ${color}88` : "none",
      position: "relative", overflow: "hidden",
    }}>
      {page !== -1 && (
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#fff",
        }}>{page}</div>
      )}
      {page === -1 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>free</div>}
    </div>
  );
}

function PageTable({ frames, frameCount }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {Array.from({ length: frameCount }).map((_, i) => (
        <MemoryFrame key={i} page={frames[i] ?? -1} />
      ))}
    </div>
  );
}

export default function VirtualMemoryTool() {
  const [tab, setTab] = useState("simulate");
  const [frameCount, setFrameCount] = useState(4);
  const [algorithm, setAlgorithm] = useState("lru");
  const [sequence, setSequence] = useState(() => generateAccessSequence(16));
  const [customSeq, setCustomSeq] = useState("");
  const [result, setResult] = useState(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [fragMode, setFragMode] = useState("external");
  const [allocSize, setAllocSize] = useState(3);
  const [allocations, setAllocations] = useState([]);
  const [memory, setMemory] = useState(Array(PAGE_COUNT).fill(null));
  const intervalRef = useRef(null);

  const runSimulation = useCallback(() => {
    const r = simulateAlgorithm(sequence, frameCount, algorithm);
    setResult(r);
    setCurrentStep(-1);
    setPlaying(false);
  }, [sequence, frameCount, algorithm]);

  useEffect(() => { runSimulation(); }, [runSimulation]);

  useEffect(() => {
    if (playing && result) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(s => {
          if (s >= result.steps.length - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, result, speed]);

  const applyCustomSeq = () => {
    const parsed = customSeq.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n >= 0 && n < PAGE_COUNT);
    if (parsed.length > 0) setSequence(parsed);
  };

  const step = result && currentStep >= 0 ? result.steps[currentStep] : null;
  const displayFrames = step ? step.frames : Array(frameCount).fill(-1);

  // Fragmentation simulation
  const allocMem = () => {
    if (fragMode === "external") {
      const blocks = [];
      let rem = allocSize;
      const mem = [...memory];
      let start = -1;
      for (let i = 0; i < mem.length; i++) {
        if (mem[i] === null) {
          if (start === -1) start = i;
          if (i - start + 1 >= rem) {
            const color = COLORS.page[allocations.length % COLORS.page.length];
            for (let j = start; j <= i; j++) mem[j] = { id: allocations.length, color };
            blocks.push({ id: allocations.length, size: rem, start, color });
            break;
          }
        } else { start = -1; }
      }
      if (blocks.length > 0) {
        setMemory(mem);
        setAllocations(a => [...a, ...blocks]);
      }
    } else {
      const mem = [...memory];
      const freeSlots = mem.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
      if (freeSlots.length >= allocSize) {
        const color = COLORS.page[allocations.length % COLORS.page.length];
        const slots = freeSlots.slice(0, allocSize);
        slots.forEach(i => mem[i] = { id: allocations.length, color });
        setMemory(mem);
        setAllocations(a => [...a, { id: allocations.length, size: allocSize, slots, color }]);
      }
    }
  };

  const freeAlloc = (id) => {
    setMemory(m => m.map(cell => cell?.id === id ? null : cell));
    setAllocations(a => a.filter(b => b.id !== id));
  };

  const resetMem = () => {
    setMemory(Array(PAGE_COUNT).fill(null));
    setAllocations([]);
  };

  const externalFrag = () => {
    let maxFree = 0, cur = 0;
    memory.forEach(c => {
      if (c === null) { cur++; maxFree = Math.max(maxFree, cur); }
      else cur = 0;
    });
    const totalFree = memory.filter(c => c === null).length;
    return totalFree > 0 ? Math.round((1 - maxFree / totalFree) * 100) : 0;
  };

  const tabs = ["simulate", "fragmentation", "compare"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f1a",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: "0 0 60px",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid rgba(124,58,237,0.3)",
        padding: "24px 32px 0",
        background: "linear-gradient(to bottom, rgba(124,58,237,0.08), transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "rgba(124,58,237,0.25)",
            border: "1px solid rgba(124,58,237,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px", color: "#c4b5fd" }}>
              Virtual Memory Lab
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
              paging · segmentation · page replacement
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, marginTop: 16 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 20px", border: "none",
              borderBottom: tab === t ? "2px solid #7c3aed" : "2px solid transparent",
              background: "transparent",
              color: tab === t ? "#c4b5fd" : "rgba(255,255,255,0.4)",
              cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 600 : 400,
              letterSpacing: "0.5px", textTransform: "uppercase",
              transition: "all 0.2s",
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px 32px" }}>
        {/* SIMULATE TAB */}
        {tab === "simulate" && (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }}>
            {/* Controls */}
            <div>
              <Panel title="Configuration">
                <Label>Algorithm</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {["lru", "optimal", "fifo"].map(alg => (
                    <button key={alg} onClick={() => setAlgorithm(alg)} style={{
                      padding: "8px 12px", borderRadius: 6,
                      border: algorithm === alg ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(255,255,255,0.1)",
                      background: algorithm === alg ? "rgba(124,58,237,0.2)" : "transparent",
                      color: algorithm === alg ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                      cursor: "pointer", fontSize: 12, textAlign: "left",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: algorithm === alg ? "#7c3aed" : "transparent",
                        border: "1px solid",
                        borderColor: algorithm === alg ? "#7c3aed" : "rgba(255,255,255,0.3)",
                      }} />
                      {alg === "lru" ? "LRU — Least Recently Used" : alg === "optimal" ? "OPT — Bélády's Algorithm" : "FIFO — First In First Out"}
                    </button>
                  ))}
                </div>
                <Label>Frames: <span style={{ color: "#c4b5fd" }}>{frameCount}</span></Label>
                <input type="range" min={1} max={8} value={frameCount}
                  onChange={e => setFrameCount(+e.target.value)}
                  style={{ width: "100%", accentColor: "#7c3aed", marginBottom: 16 }} />
                <Label>Speed</Label>
                <input type="range" min={200} max={1500} step={100} value={speed}
                  onChange={e => setSpeed(+e.target.value)}
                  style={{ width: "100%", accentColor: "#7c3aed", marginBottom: 16 }} />
                <Label>Page access sequence</Label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {sequence.map((p, i) => (
                    <div key={i} style={{
                      width: 26, height: 26, borderRadius: 4,
                      background: COLORS.page[p % COLORS.page.length] + "33",
                      border: `1px solid ${COLORS.page[p % COLORS.page.length]}66`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      color: COLORS.page[p % COLORS.page.length],
                    }}>{p}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input value={customSeq} onChange={e => setCustomSeq(e.target.value)}
                    placeholder="e.g. 1 2 3 1 4 2 5"
                    style={{
                      flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 11,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0",
                    }} />
                  <Btn onClick={applyCustomSeq}>Set</Btn>
                </div>
                <Btn onClick={() => setSequence(generateAccessSequence(16))} full>
                  🎲 Randomize
                </Btn>
              </Panel>
            </div>

            {/* Simulation area */}
            <div>
              {/* Stats */}
              {result && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <StatCard label="Total Accesses" value={sequence.length} />
                  <StatCard label="Page Hits" value={currentStep >= 0 ? result.steps.slice(0, currentStep + 1).filter(s => s.hit).length : result.hits} color="#22c55e" />
                  <StatCard label="Page Faults" value={currentStep >= 0 ? result.steps.slice(0, currentStep + 1).filter(s => s.fault).length : result.faults} color="#ef4444" />
                  <StatCard label="Hit Rate" value={
                    currentStep >= 0
                      ? Math.round(result.steps.slice(0, currentStep + 1).filter(s => s.hit).length / (currentStep + 1) * 100) + "%"
                      : Math.round(result.hits / sequence.length * 100) + "%"
                  } color="#7c3aed" />
                </div>
              )}

              {/* Current step display */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: 20, marginBottom: 20,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Physical Frames</div>
                  {step && (
                    <div style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: step.fault ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                      color: step.fault ? "#ef4444" : "#22c55e",
                      border: `1px solid ${step.fault ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                    }}>
                      {step.fault ? `PAGE FAULT — P${step.page} loaded${step.evicted >= 0 ? `, P${step.evicted} evicted` : ""}` : `HIT — P${step.page} in frame`}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {displayFrames.map((p, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>F{i}</div>
                      <MemoryFrame
                        page={p}
                        highlight={step && step.frameIdx === i ? (step.fault ? COLORS.fault : COLORS.hit) : null}
                        animating={step && step.frameIdx === i}
                      />
                    </div>
                  ))}
                </div>

                {/* Playback controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Btn onClick={() => { setCurrentStep(-1); setPlaying(false); }}>⏮</Btn>
                  <Btn onClick={() => setCurrentStep(s => Math.max(-1, s - 1))}>◁</Btn>
                  <Btn onClick={() => setPlaying(p => !p)}>
                    {playing ? "⏸ Pause" : "▶ Play"}
                  </Btn>
                  <Btn onClick={() => setCurrentStep(s => Math.min(result.steps.length - 1, s + 1))}>▷</Btn>
                  <Btn onClick={() => setCurrentStep(result.steps.length - 1)}>⏭</Btn>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    Step {currentStep + 1} / {result?.steps.length}
                  </div>
                </div>
              </div>

              {/* Step timeline */}
              {result && (
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: 16, overflowX: "auto",
                }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Access Timeline</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {result.steps.map((s, i) => (
                      <div key={i} onClick={() => setCurrentStep(i)} style={{
                        minWidth: 36, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 6,
                          background: i === currentStep
                            ? (s.fault ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)")
                            : i < currentStep
                            ? (s.fault ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)")
                            : "rgba(255,255,255,0.04)",
                          border: i === currentStep
                            ? `2px solid ${s.fault ? "#ef4444" : "#22c55e"}`
                            : "1px solid rgba(255,255,255,0.08)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 600,
                          color: i <= currentStep ? (s.fault ? "#ef4444" : "#22c55e") : "rgba(255,255,255,0.3)",
                          transition: "all 0.15s",
                        }}>{s.page}</div>
                        <div style={{
                          width: 4, height: 4, borderRadius: "50%",
                          background: s.fault ? "#ef4444" : "#22c55e",
                          opacity: i <= currentStep ? 1 : 0.2,
                        }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} /> Hit
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} /> Fault
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FRAGMENTATION TAB */}
        {tab === "fragmentation" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
            <div>
              <Panel title="Memory Allocation">
                <Label>Allocation type</Label>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                  {["external", "internal"].map(m => (
                    <button key={m} onClick={() => { setFragMode(m); resetMem(); }} style={{
                      flex: 1, padding: "8px 6px", borderRadius: 6, fontSize: 11,
                      border: fragMode === m ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(255,255,255,0.1)",
                      background: fragMode === m ? "rgba(124,58,237,0.2)" : "transparent",
                      color: fragMode === m ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                      cursor: "pointer",
                    }}>{m}</button>
                  ))}
                </div>
                <Label>Block size: <span style={{ color: "#c4b5fd" }}>{allocSize}</span> pages</Label>
                <input type="range" min={1} max={6} value={allocSize}
                  onChange={e => setAllocSize(+e.target.value)}
                  style={{ width: "100%", accentColor: "#7c3aed", marginBottom: 16 }} />
                <Btn onClick={allocMem} full>+ Allocate {allocSize} pages</Btn>
                <div style={{ marginTop: 8 }} />
                <Btn onClick={resetMem} full>Reset memory</Btn>

                <div style={{ marginTop: 20 }}>
                  <Label>Active allocations</Label>
                  {allocations.length === 0
                    ? <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", padding: "8px 0" }}>None</div>
                    : allocations.map(a => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderRadius: 6, marginBottom: 4,
                        background: a.color + "15",
                        border: `1px solid ${a.color}33`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: a.color }} />
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                            Block {a.id} · {a.size}p
                          </span>
                        </div>
                        <button onClick={() => freeAlloc(a.id)} style={{
                          background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                          cursor: "pointer", fontSize: 12, padding: 0,
                        }}>✕</button>
                      </div>
                    ))}
                </div>
              </Panel>
            </div>

            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <StatCard label="Total Pages" value={PAGE_COUNT} />
                <StatCard label="Free Pages" value={memory.filter(c => c === null).length} color="#22c55e" />
                <StatCard label="Fragmentation" value={externalFrag() + "%"} color={externalFrag() > 50 ? "#ef4444" : "#f59e0b"} />
              </div>

              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: 20, marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
                  Physical Memory Layout ({fragMode === "external" ? "Contiguous allocation" : "Non-contiguous (paged)"})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
                  {memory.map((cell, i) => (
                    <div key={i} style={{
                      height: 52, borderRadius: 8,
                      background: cell ? cell.color + "22" : "rgba(255,255,255,0.03)",
                      border: cell ? `1px solid ${cell.color}55` : "1px solid rgba(255,255,255,0.07)",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      transition: "all 0.3s",
                    }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>p{i}</div>
                      {cell
                        ? <div style={{ width: 16, height: 16, borderRadius: "50%", background: cell.color }} />
                        : <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>—</div>
                      }
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: 20,
              }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Fragmentation Explanation</div>
                <div style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}>
                  {fragMode === "external"
                    ? <>
                        <strong style={{ color: "#c4b5fd" }}>External Fragmentation</strong> occurs when free memory exists, but it's scattered in non-contiguous blocks. Even if total free space is enough to satisfy a request, no single contiguous block may be available. The fragmentation index shows what percentage of free memory is unusable due to scattering.
                      </>
                    : <>
                        <strong style={{ color: "#c4b5fd" }}>Internal Fragmentation</strong> occurs in paged allocation when a process is allocated more space than needed (e.g., to align to page boundaries). Each colored cell represents a page — multiple scattered pages can be assigned to a single process. This eliminates external fragmentation but may waste space within allocated pages.
                      </>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPARE TAB */}
        {tab === "compare" && (
          <CompareTab sequence={sequence} frameCount={frameCount} />
        )}
      </div>
    </div>
  );
}

function CompareTab({ sequence, frameCount }) {
  const algorithms = ["lru", "optimal", "fifo"];
  const labels = { lru: "LRU", optimal: "Optimal", fifo: "FIFO" };
  const accent = { lru: "#7c3aed", optimal: "#0d9488", fifo: "#d97706" };
  const results = algorithms.reduce((acc, alg) => {
    acc[alg] = simulateAlgorithm(sequence, frameCount, alg);
    return acc;
  }, {});

  const maxFaults = Math.max(...algorithms.map(a => results[a].faults));

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24,
      }}>
        {algorithms.map(alg => {
          const r = results[alg];
          const hitRate = Math.round(r.hits / sequence.length * 100);
          return (
            <div key={alg} style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${accent[alg]}44`,
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent[alg] }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: accent[alg] }}>{labels[alg]}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <MiniStat label="Faults" value={r.faults} color="#ef4444" />
                <MiniStat label="Hits" value={r.hits} color="#22c55e" />
                <MiniStat label="Hit Rate" value={hitRate + "%"} color={accent[alg]} />
                <MiniStat label="Fault Rate" value={(100 - hitRate) + "%"} color="rgba(255,255,255,0.4)" />
              </div>
              <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: hitRate + "%",
                  background: accent[alg],
                  transition: "width 0.8s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>hit rate</div>
            </div>
          );
        })}
      </div>

      {/* Fault comparison bars */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Page Fault Comparison</div>
        {algorithms.map(alg => (
          <div key={alg} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: accent[alg], fontWeight: 600 }}>{labels[alg]}</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{results[alg].faults} faults</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>
              <div style={{
                height: "100%", borderRadius: 4,
                width: maxFaults > 0 ? (results[alg].faults / maxFaults * 100) + "%" : "0%",
                background: accent[alg], transition: "width 0.8s ease",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Step-by-step comparison table */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: 20, overflowX: "auto",
      }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Step-by-step comparison</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <div style={{ width: 30, fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>#</div>
          <div style={{ width: 30, fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>P</div>
          {algorithms.map(a => (
            <div key={a} style={{ width: 60, fontSize: 10, color: accent[a], textAlign: "center", fontWeight: 600 }}>{labels[a]}</div>
          ))}
        </div>
        {sequence.map((page, i) => (
          <div key={i} style={{ display: "flex", gap: 4, marginBottom: 3 }}>
            <div style={{ width: 30, fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: "22px" }}>{i}</div>
            <div style={{
              width: 30, height: 22, borderRadius: 4, fontSize: 11, fontWeight: 700,
              background: COLORS.page[page % COLORS.page.length] + "22",
              color: COLORS.page[page % COLORS.page.length],
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{page}</div>
            {algorithms.map(a => {
              const s = results[a].steps[i];
              return (
                <div key={a} style={{
                  width: 60, height: 22, borderRadius: 4,
                  background: s.fault ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)",
                  border: `1px solid ${s.fault ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600,
                  color: s.fault ? "#ef4444" : "#22c55e",
                }}>
                  {s.fault ? "FAULT" : "HIT"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>{children}</div>;
}

function Btn({ onClick, children, full }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 12px", borderRadius: 6, fontSize: 11,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)",
      color: "rgba(255,255,255,0.7)", cursor: "pointer",
      width: full ? "100%" : "auto",
      transition: "all 0.15s",
    }}>{children}</button>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "rgba(255,255,255,0.8)", letterSpacing: "-1px" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}