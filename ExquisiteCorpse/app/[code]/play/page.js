"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import Footer, { FOOTER_H } from "../../../components/Footer"
import StatusBar from "../../../components/StatusBar"
import { STYLE, FONT_SIZE, FONT_WEIGHT, OPACITY, SPACE, GAP, CARD as CARD_LAYOUT } from "../../../components/styles"
import FooterButton from "../../../components/FooterButton"
import WaitingList from "../../../components/WaitingList"
import Results from "../../../components/Results"
import TextEntry from "../../../components/TextEntry"
import RandomIdeas from "../../../components/RandomIdeas"
import Menu from "../../../components/Menu"
import Notifications from "../../../components/Notifications"

const BG = "#1A3A5C"
const YELLOW = "#FBDF54"
const WARM_LIGHT = "#276994"

const PALETTE = [
  "#000000","#2D2D2D","#666666","#AAAAAA","#DDDDDD","#FFFFFF",
  "#6B0000","#5C3000","#1A4D00","#003D3D","#002B6B","#3D006B",
  "#E53935","#FB8C00","#FDD835","#7CB342","#00897B","#039BE5","#1E88E5","#8E24AA",
  "#FDDBB4","#D4956A","#8D5524","#A1887F",
  "#FFB3C6","#FFD4A8","#FFF5BA","#C8F5D3","#BAE1FF","#E8BAFF",
]

// ─── Flood fill ───────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

function floodFillImageData(imageData, startX, startY, fillHex) {
  const d = imageData.data
  const w = imageData.width
  const h = imageData.height
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return
  const [fr, fg, fb] = hexToRgb(fillHex)
  const si = (startY * w + startX) * 4
  const tr = d[si], tg = d[si+1], tb = d[si+2]
  if (tr === fr && tg === fg && tb === fb) return
  const stack = [startY * w + startX]
  const visited = new Uint8Array(w * h)
  const tol = 40
  while (stack.length) {
    const p = stack.pop()
    if (p < 0 || p >= w * h || visited[p]) continue
    const i = p * 4
    if (Math.abs(d[i]-tr) > tol || Math.abs(d[i+1]-tg) > tol || Math.abs(d[i+2]-tb) > tol) continue
    visited[p] = 1
    d[i] = fr; d[i+1] = fg; d[i+2] = fb; d[i+3] = 255
    const x = p % w, y = Math.floor(p / w)
    if (x > 0) stack.push(p-1)
    if (x < w-1) stack.push(p+1)
    if (y > 0) stack.push(p-w)
    if (y < h-1) stack.push(p+w)
  }
}

// ─── DrawingCanvas ─────────────────────────────────────────────────────────
// peekImageUrl: URL of previous player's drawing (null for round 0)
// peekFoldPct: where prior player set their fold (0.50–0.90)
// onExport: fn => { getDataUrl: () => string, foldPct: number }
// onFirstMark: called once when player makes their first mark

function DrawingCanvas({ peekImageUrl, peekFoldPct, onExport, onFirstMark }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const fabricLibRef = useRef(null)
  const historyRef = useRef([])
  const redoStackRef = useRef([])
  const onExportRef = useRef(onExport)
  onExportRef.current = onExport
  const onFirstMarkRef = useRef(onFirstMark)
  onFirstMarkRef.current = onFirstMark
  const firstMarkFiredRef = useRef(false)
  const peekHeightRef = useRef(0)
  const squareSizeRef = useRef(0)
  const peekFabricImgRef = useRef(null)

  const [color, setColorState] = useState("#000000")
  const [brushSize, setBrushSize] = useState(8)
  const [toolMode, setToolModeState] = useState("pen")
  const [foldPct, setFoldPct] = useState(0.8)
  const [showFoldHint, setShowFoldHint] = useState(true)
  const [squareSize, setSquareSize] = useState(0)

  const colorRef = useRef("#000000")
  colorRef.current = color
  const toolModeRef = useRef("pen")
  toolModeRef.current = toolMode
  const brushSizeRef = useRef(8)
  brushSizeRef.current = brushSize
  const foldPctRef = useRef(0.8)
  foldPctRef.current = foldPct
  const draggingFoldRef = useRef(false)
  const canvasContainerRef = useRef(null)

  const peekHeight = peekImageUrl && squareSize > 0
    ? Math.round((1 - peekFoldPct) * squareSize)
    : 0
  const totalCanvasHeight = peekHeight + squareSize
  const foldLinePct = totalCanvasHeight > 0
    ? (peekHeight + foldPct * squareSize) / totalCanvasHeight * 100
    : foldPct * 100

  function fireFirstMark() {
    if (!firstMarkFiredRef.current) {
      firstMarkFiredRef.current = true
      onFirstMarkRef.current?.()
    }
  }

  // Export the full canvas (peek strip + new square) so stored images overlap correctly in the reveal
  function makeExportFn(cv) {
    return () => ({
      dataUrl: cv.toDataURL({ format: "jpeg", quality: 0.72 }),
      foldPct: foldPctRef.current,
    })
  }

  const doBucketFill = useCallback(async (x, y) => {
    const cv = fabricRef.current
    const fabricLib = fabricLibRef.current
    if (!cv || !fabricLib) return
    const dataUrl = cv.toDataURL({ format: "png" })
    await new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const off = document.createElement("canvas")
        off.width = cv.width; off.height = cv.height
        const ctx = off.getContext("2d")
        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, off.width, off.height)
        floodFillImageData(imgData, x, y, colorRef.current)
        ctx.putImageData(imgData, 0, 0)
        const filledUrl = off.toDataURL()
        fabricLib.Image.fromURL(filledUrl, (fabricImg) => {
          cv.clear()
          cv.backgroundColor = "#ffffff"
          // Peek is already baked into filledUrl from toDataURL — don't re-add the peek object
          fabricImg.set({ selectable: false, evented: false, left: 0, top: 0, scaleX: 1, scaleY: 1 })
          cv.add(fabricImg)
          cv.renderAll()
          historyRef.current.push(JSON.stringify(cv.toJSON()))
          redoStackRef.current = []
          fireFirstMark()
          resolve()
        })
      }
      img.src = dataUrl
    })
  }, [])

  const doBucketFillRef = useRef(doBucketFill)
  doBucketFillRef.current = doBucketFill

  useEffect(() => {
    let canvas
    let cancelled = false

    ;(async () => {
      const { fabric } = await import("fabric")
      if (cancelled || !canvasRef.current || !containerRef.current) return
      fabricLibRef.current = fabric

      const w = containerRef.current.clientWidth
      setSquareSize(w)
      squareSizeRef.current = w

      const effectivePeekH = peekImageUrl ? Math.round((1 - peekFoldPct) * w) : 0
      peekHeightRef.current = effectivePeekH

      canvas = new fabric.Canvas(canvasRef.current, {
        isDrawingMode: true,
        width: w,
        height: effectivePeekH + w,
        backgroundColor: "#ffffff",
      })
      canvas.freeDrawingBrush.color = "#000000"
      canvas.freeDrawingBrush.width = 8

      // Load peek image into the Fabric canvas so players can draw on top of it
      if (peekImageUrl && effectivePeekH > 0) {
        fabric.Image.fromURL(peekImageUrl, (img) => {
          if (!img || cancelled) return
          const scale = w / img.width
          const cropSrcH = Math.round(effectivePeekH / scale)
          const cropSrcY = Math.max(0, img.height - cropSrcH)
          img.set({
            selectable: false,
            evented: false,
            left: 0,
            top: 0,
            scaleX: scale,
            scaleY: scale,
            cropY: cropSrcY,
            height: Math.min(img.height, cropSrcH),
          })
          peekFabricImgRef.current = img
          canvas.add(img)
          canvas.renderAll()
          historyRef.current.push(JSON.stringify(canvas.toJSON()))
        }, { crossOrigin: "anonymous" })
      }

      canvas.on("path:created", () => {
        historyRef.current.push(JSON.stringify(canvas.toJSON()))
        redoStackRef.current = []
        fireFirstMark()
      })

      canvas.on("mouse:down", (opt) => {
        if (toolModeRef.current !== "bucket") return
        const p = canvas.getPointer(opt.e)
        doBucketFillRef.current(Math.round(p.x), Math.round(p.y))
      })

      fabricRef.current = canvas
      onExportRef.current(makeExportFn(canvas))
    })()

    return () => {
      cancelled = true
      fabricRef.current?.dispose()
      fabricRef.current = null
      peekFabricImgRef.current = null
    }
  }, [])

  // Re-expose export fn whenever foldPct changes
  useEffect(() => {
    const cv = fabricRef.current
    if (!cv) return
    onExportRef.current(makeExportFn(cv))
  }, [foldPct])

  // Auto-dismiss fold hint
  useEffect(() => {
    if (!showFoldHint) return
    const t = setTimeout(() => setShowFoldHint(false), 3500)
    return () => clearTimeout(t)
  }, [showFoldHint])

  // Fold line drag handlers
  useEffect(() => {
    function onMove(e) {
      if (!draggingFoldRef.current) return
      e.preventDefault()
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const rect = canvasContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const relY = clientY - rect.top
      const peekH = peekHeightRef.current
      const sq = squareSizeRef.current
      if (sq === 0) return
      const pct = (relY - peekH) / sq
      const clamped = Math.max(0.50, Math.min(0.90, pct))
      setFoldPct(clamped)
      foldPctRef.current = clamped
    }
    function onUp() { draggingFoldRef.current = false }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onUp)
    }
  }, [])

  function applyBrush(newColor, newSize, isEraser) {
    const cv = fabricRef.current
    if (!cv) return
    cv.freeDrawingBrush.color = isEraser ? "#ffffff" : newColor
    cv.freeDrawingBrush.width = newSize
  }

  function handleColorClick(c) {
    setColorState(c)
    if (toolMode === "bucket") return
    const nextMode = toolMode === "eraser" ? "pen" : toolMode
    if (nextMode !== toolMode) setToolModeState(nextMode)
    const cv = fabricRef.current
    if (cv) cv.isDrawingMode = true
    applyBrush(c, brushSizeRef.current, false)
  }

  function handleSetTool(mode) {
    setToolModeState(mode)
    const cv = fabricRef.current
    if (!cv) return
    cv.isDrawingMode = (mode !== "bucket")
    if (mode !== "bucket") applyBrush(colorRef.current, brushSizeRef.current, mode === "eraser")
  }

  function handleSizeChange(newSize) {
    setBrushSize(newSize)
    applyBrush(colorRef.current, newSize, toolMode === "eraser")
  }

  function handleUndo() {
    const hist = historyRef.current
    if (!hist.length) return
    const last = hist.pop()
    redoStackRef.current.push(last)
    const cv = fabricRef.current
    if (!cv) return
    if (hist.length === 0) {
      cv.clear(); cv.backgroundColor = "#ffffff"
      if (peekFabricImgRef.current) cv.add(peekFabricImgRef.current)
      cv.renderAll()
    } else {
      cv.loadFromJSON(JSON.parse(hist[hist.length - 1]), () => cv.renderAll())
    }
  }

  function handleRedo() {
    const redo = redoStackRef.current
    if (!redo.length) return
    const state = redo.pop()
    historyRef.current.push(state)
    const cv = fabricRef.current
    if (!cv) return
    cv.loadFromJSON(JSON.parse(state), () => cv.renderAll())
  }

  function handleClear() {
    const cv = fabricRef.current
    if (!cv) return
    const nonPeekObjs = cv.getObjects().filter(obj => obj !== peekFabricImgRef.current)
    if (nonPeekObjs.length > 0) {
      historyRef.current.push(JSON.stringify(cv.toJSON()))
      redoStackRef.current = []
    }
    cv.clear(); cv.backgroundColor = "#ffffff"
    if (peekFabricImgRef.current) cv.add(peekFabricImgRef.current)
    cv.renderAll()
  }

  const BRUSH_SIZES = [2, 4, 8, 14, 22, 34, 52]

  return (
    <div ref={containerRef}>
      {/* Tool bar */}
      <div style={{ display: "flex", alignItems: "center", gap: GAP.selection, padding: "10px 0 8px" }}>
        <button
          onClick={() => handleSetTool("pen")}
          style={{ background: toolMode === "pen" ? YELLOW : WARM_LIGHT, color: toolMode === "pen" ? "#000" : "white", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button
          onClick={() => handleSetTool(toolMode === "eraser" ? "pen" : "eraser")}
          style={{ background: toolMode === "eraser" ? YELLOW : WARM_LIGHT, color: toolMode === "eraser" ? "#000" : "white", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>
          </svg>
        </button>
        <button
          onClick={() => handleSetTool(toolMode === "bucket" ? "pen" : "bucket")}
          style={{ background: toolMode === "bucket" ? YELLOW : WARM_LIGHT, color: toolMode === "bucket" ? "#000" : "white", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78Z"/><path d="m5 3 5 5"/><path d="M22 22c0-1.2-.2-2-.8-3-1.4 0-2.2 1.8-2.2 3"/>
          </svg>
        </button>
        <button onClick={handleUndo} style={{ background: WARM_LIGHT, color: "white", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        <button onClick={handleRedo} style={{ background: WARM_LIGHT, color: "white", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
        </button>
        <button onClick={handleClear} style={{ background: WARM_LIGHT, color: "rgba(255,255,255,0.6)", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>

      {/* Brush sizes */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 10 }}>
        {BRUSH_SIZES.map((sz, i) => {
          const circleD = 5 + i * 4.5
          const isActive = brushSize === sz
          return (
            <button
              key={sz}
              onClick={() => handleSizeChange(sz)}
              disabled={toolMode === "bucket"}
              style={{
                width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                background: isActive && toolMode !== "bucket" ? WARM_LIGHT : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: isActive && toolMode !== "bucket" ? `2px solid ${YELLOW}` : "2px solid transparent",
              }}
            >
              <div style={{ width: circleD, height: circleD, borderRadius: "50%", background: "white" }} />
            </button>
          )
        })}
      </div>

      {/* Color palette */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
        {PALETTE.map(c => (
          <button
            key={c}
            onClick={() => handleColorClick(c)}
            style={{
              width: 28, height: 28, borderRadius: 5, background: c, flexShrink: 0,
              border: color === c && toolMode !== "eraser"
                ? "3px solid white"
                : c === "#FFFFFF" || c === "#DDDDDD"
                  ? "1px solid rgba(255,255,255,0.25)"
                  : "2px solid transparent",
            }}
          />
        ))}
      </div>

      {/* Canvas — peek strip is loaded as a locked Fabric image at top so players can draw on top of it */}
      <div
        ref={canvasContainerRef}
        style={{ width: "100%", position: "relative", background: "#fff", cursor: toolMode === "bucket" ? "crosshair" : "default", borderRadius: 6, overflow: "hidden" }}
      >
        <canvas ref={canvasRef} style={{ display: "block", touchAction: "none" }} />

        {/* Fold line */}
        <div style={{ position: "absolute", left: 0, right: 0, top: `${foldLinePct}%`, zIndex: 10, pointerEvents: "none" }}>
          <div style={{ borderTop: "2px dashed rgba(26,58,92,0.75)", width: "100%" }} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: -14,
              background: "rgba(26,58,92,0.9)",
              color: "white",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              padding: "4px 10px",
              cursor: "ns-resize",
              userSelect: "none",
              touchAction: "none",
              pointerEvents: "all",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
            onMouseDown={e => { e.preventDefault(); draggingFoldRef.current = true }}
            onTouchStart={e => { e.preventDefault(); draggingFoldRef.current = true }}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
              <rect x="0" y="0" width="10" height="2" rx="1" fill="white" opacity="0.8"/>
              <rect x="0" y="6" width="10" height="2" rx="1" fill="white" opacity="0.8"/>
              <rect x="0" y="12" width="10" height="2" rx="1" fill="white" opacity="0.8"/>
            </svg>
            FOLD
          </div>
        </div>

        {/* Fold hint */}
        {showFoldHint && (
          <div style={{
            position: "absolute",
            top: `calc(${foldLinePct}% - 40px)`,
            left: 12,
            right: 56,
            background: "rgba(26,58,92,0.92)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 12px",
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 20,
          }}>
            Drag the fold line — the next player only sees what falls below it.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(523, ctx.currentTime)
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}


const POKE_COLORS = { dark: "#0E2438", mid: "#1A3A5C", wl: "#276994", yellow: "#FBDF54", notifBg: "#090F1A" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function Play({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [drawings, setDrawings] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [canvasDirty, setCanvasDirty] = useState(false)
  const [shownIdeas, setShownIdeas] = useState([])
  const [loadingIdeas, setLoadingIdeas] = useState(false)

  const getExportRef = useRef(null)
  const [advancing, setAdvancing] = useState(false)

  const [selectedChainOwner, setSelectedChainOwner] = useState(null)
  const [instructions, setInstructions] = useState("")

  const prevPhaseRef = useRef(null)
  const soundTriggerRef = useRef(null)
  const revealEndRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)

  const [pokeCooldownActive, setPokeCooldownActive] = useState(false)
  const [pokeJustSent, setPokeJustSent] = useState(null)
  async function sendInlinePoke(targetName) {
    if (!me || pokeCooldownActive) return
    setPokeCooldownActive(true); setPokeJustSent(targetName)
    await supabase.from("pokes").insert({ room_code: code, from_player: me.name, to_player: targetName, message: "👉" })
    setTimeout(() => setPokeJustSent(null), 2000)
    setTimeout(() => setPokeCooldownActive(false), 10000)
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const pokeSystemNode = (footer = null) => me ? (
    <>
      <Notifications supabase={supabase} colors={POKE_COLORS} roomCode={code} currentPlayer={me.name} />
      <Menu
        supabase={supabase}
        colors={POKE_COLORS}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={code}
        currentPlayer={me.name}
        playerDetails={players.map(p => ({ name: p.name, firstName: p.first_name, lastName: p.last_name }))}
        gamePhase={game?.phase}
        rules={instructions ? [["How to Play", instructions]] : null}
        onResetToLobby={async () => { await rpc("ec_reset_game", { p_code: code }) }}
      />
      <Footer colors={POKE_COLORS} isOpen={menuOpen} onToggle={() => setMenuOpen(o => !o)}>
        {footer}
      </Footer>
    </>
  ) : null


  useEffect(() => {
    if (!game || !me) return
    const prev = soundTriggerRef.current
    soundTriggerRef.current = game.phase
    if (!prev) return
    if (prev !== game.phase) playChirp()
  }, [game?.phase])

  async function rpc(fn, args = {}) {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }

  async function loadState() {
    const { data: gameData } = await supabase
      .from("ec_games").select("*").eq("code", code).single()

    if (!gameData) { router.replace(`/${code}`); return }
    if (gameData.phase === "lobby") {
      if (prevPhaseRef.current !== "finished") router.replace(`/${code}`)
      return
    }
    prevPhaseRef.current = gameData.phase

    const { data: playerData } = await supabase
      .from("ec_players").select("id,name,first_name,seat,is_bot")
      .eq("game_code", code).order("seat", { ascending: true })

    const { data: drawingData } = await supabase
      .from("ec_drawings").select("id,chain_owner_id,round_number,content,fold_pct,author_id")
      .eq("game_code", code).order("round_number", { ascending: true })

    setGame(gameData)
    setPlayers(playerData ?? [])
    setDrawings(drawingData ?? [])
  }

  useEffect(() => {
    const existing = localStorage.getItem(`exquisitecorpse:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
  }, [code])

  useEffect(() => {
    supabase.from("game_instructions").select("body").eq("game_key", "exquisitecorpse").single()
      .then(({ data }) => { if (data?.body) setInstructions(data.body) })
    loadState()
    let poll = setInterval(loadState, 1500)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 1500) } }
    document.addEventListener("visibilitychange", handleVisibility)

    const channel = supabase.channel(`ec-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ec_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "ec_drawings", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()

    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  useEffect(() => {
    if (game?.phase !== "finished") return
    const t = setTimeout(() => supabase.rpc("ec_reset_game", { p_code: code }), 30000)
    return () => clearTimeout(t)
  }, [game?.phase, code])

  // ── Derived state ─────────────────────────────────────────────────────────

  const n = game?.total_rounds ?? 0
  const currentRound = game?.current_round ?? 0

  const myChainOwner = useMemo(() => {
    if (!me || n === 0) return null
    const passOffsets = game?.pass_offsets ?? null
    const offset = currentRound === 0 ? 0 : (passOffsets?.[currentRound - 1] ?? currentRound)
    const ownerSeat = ((me.seat - offset) % n + n) % n
    return players.find(p => p.seat === ownerSeat) ?? null
  }, [me, currentRound, n, players, game?.pass_offsets])

  const myPrevDrawing = useMemo(() => {
    if (!myChainOwner || currentRound === 0) return null
    return drawings.find(d => d.chain_owner_id === myChainOwner.id && d.round_number === currentRound - 1) ?? null
  }, [myChainOwner, currentRound, drawings])

  const myDrawingSubmitted = useMemo(() => {
    if (!myChainOwner || !me) return false
    return drawings.some(d => d.chain_owner_id === myChainOwner.id && d.round_number === currentRound && d.author_id === me.id)
  }, [myChainOwner, currentRound, drawings, me])

  const submittedCount = useMemo(() => {
    return drawings.filter(d => d.round_number === currentRound).length
  }, [drawings, currentRound])

  const revealOrder = game?.reveal_order ?? []
  const currentRevealChain = game?.current_reveal_chain ?? 0
  const currentRevealStep = game?.current_reveal_step ?? -1

  const currentPresenterPlayer = useMemo(() => {
    if (!revealOrder.length || !players.length) return null
    return players.find(p => p.id === revealOrder[currentRevealChain]) ?? null
  }, [revealOrder, currentRevealChain, players])

  const amPresenter = !!(me && currentPresenterPlayer && me.id === currentPresenterPlayer.id)

  const currentChainDrawings = useMemo(() => {
    if (!currentPresenterPlayer) return []
    return drawings
      .filter(d => d.chain_owner_id === currentPresenterPlayer.id)
      .sort((a, b) => a.round_number - b.round_number)
  }, [currentPresenterPlayer, drawings])

  const allChains = useMemo(() => {
    return players
      .map(p => ({
        owner: p,
        drawings: drawings.filter(d => d.chain_owner_id === p.id).sort((a, b) => a.round_number - b.round_number),
      }))
      .filter(c => c.drawings.length > 0)
  }, [players, drawings])

  // Reset per-round UI state when round changes
  useEffect(() => {
    setCanvasDirty(false)
    setSubmitting(false)
    setShownIdeas([])
  }, [currentRound])

  // Auto-advance bot chains during dummy game reveal
  useEffect(() => {
    if (!game || game.phase !== "reveal" || !game.is_dummy) return
    if (!currentPresenterPlayer?.is_bot) return
    if (advancing) return
    const allRevealed = currentRevealStep >= n - 1
    const timer = setTimeout(async () => {
      if (!allRevealed) {
        await supabase.rpc("ec_advance_reveal", { p_code: code, p_new_reveal_step: currentRevealStep + 1, p_new_reveal_chain: currentRevealChain })
      } else {
        await supabase.rpc("ec_advance_reveal", { p_code: code, p_new_reveal_step: -1, p_new_reveal_chain: currentRevealChain + 1 })
      }
      await loadState()
    }, 400)
    return () => clearTimeout(timer)
  }, [game?.phase, game?.is_dummy, currentPresenterPlayer?.id, currentRevealStep, currentRevealChain, advancing])

  // Auto-scroll to newly revealed drawings during reveal phase
  useEffect(() => {
    if (game?.phase !== "reveal" || currentRevealStep < 0) return
    setTimeout(() => revealEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80)
  }, [game?.phase, currentRevealStep, currentRevealChain])


  // ── Actions ───────────────────────────────────────────────────────────────

  async function uploadAndSubmitDrawing() {
    if (!myChainOwner || submitting || myDrawingSubmitted || !canvasDirty) return
    const getExport = getExportRef.current
    if (!getExport) { alert("Canvas not ready"); return }
    const { dataUrl, foldPct } = getExport()
    if (!dataUrl) { alert("Canvas not ready"); return }

    setSubmitting(true)
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const filename = `ec/${code}/${Date.now()}-${crypto.randomUUID()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("drawings")
        .upload(filename, blob, { contentType: "image/jpeg" })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from("drawings").getPublicUrl(uploadData.path)
      const publicUrl = urlData.publicUrl

      const { error } = await supabase.rpc("ec_submit_drawing", {
        p_code: code,
        p_chain_owner_id: myChainOwner.id,
        p_round_number: currentRound,
        p_content: publicUrl,
        p_fold_pct: foldPct,
        p_author_id: me.id,
      })
      if (error) throw error
    } catch (e) {
      alert("Error submitting: " + e.message)
      setSubmitting(false)
    }
  }

  async function handleGetIdeas() {
    if (loadingIdeas || shownIdeas.length >= 9) return
    setLoadingIdeas(true)
    const { data } = await supabase.rpc("get_random_ideas", {
      p_count: 3,
      p_exclude: shownIdeas,
    })
    if (data?.length) setShownIdeas(prev => [...prev, ...data])
    setLoadingIdeas(false)
  }

  async function handleAdvanceReveal() {
    if (advancing) return
    setAdvancing(true)
    await supabase.rpc("ec_advance_reveal", {
      p_code: code,
      p_new_reveal_step: currentRevealStep + 1,
      p_new_reveal_chain: currentRevealChain,
    })
    await loadState()
    setAdvancing(false)
  }

  async function handleNextChain() {
    if (advancing) return
    setAdvancing(true)
    await supabase.rpc("ec_advance_reveal", {
      p_code: code,
      p_new_reveal_step: -1,
      p_new_reveal_chain: currentRevealChain + 1,
    })
    await loadState()
    setAdvancing(false)
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (!game || !me) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ── Finished ──────────────────────────────────────────────────────────────


  if (game.phase === "finished") {
    const modalChain = selectedChainOwner
      ? allChains.find(c => c.owner.id === selectedChainOwner)
      : null

    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white" }}>
        <div style={{ padding: "36px 24px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-1px", marginBottom: 8 }}>That's a wrap!</h1>
          <p style={{ fontSize: 16, opacity: 0.65, fontWeight: 500, marginBottom: 28 }}>This is your reminder to take screenshots.</p>
        </div>

        <div style={{ padding: "0 24px 48px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.4, marginBottom: 14 }}>
            All Chains
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: GAP.result }}>
            {allChains.map(chain => {
              const firstDrawing = chain.drawings[0]
              return (
                <button
                  key={chain.owner.id}
                  onClick={() => setSelectedChainOwner(chain.owner.id)}
                  style={{ background: WARM_LIGHT, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 0, overflow: "hidden", textAlign: "left", color: "white", display: "block" }}
                >
                  {firstDrawing?.content && (
                    <img src={firstDrawing.content} alt="" style={{ width: "100%", display: "block" }} />
                  )}
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {chain.owner.name}'s chain
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Play again / another game */}
        <div style={{ padding: "0 24px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={async () => { await rpc("ec_reset_game", { p_code: code }) }}
            style={{ background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "14px 24px", width: "100%" }}>
            Play Again
          </button>
          <a href="https://games.jackbrannen.com"
            style={{ display: "block", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 16, fontWeight: 700, padding: "14px 24px", width: "100%", textAlign: "center", textDecoration: "none" }}>
            Play Another Game
          </a>
        </div>

        {/* Chain detail modal */}
        {modalChain && (
          <ChainModal chain={modalChain} players={players} onClose={() => setSelectedChainOwner(null)} />
        )}
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  if (game.phase === "reveal") {
    const allStepsRevealed = currentRevealStep >= n - 1
    const isLastChain = currentRevealChain >= revealOrder.length - 1
    const visibleDrawings = currentRevealStep >= 0
      ? currentChainDrawings.slice(0, currentRevealStep + 1)
      : []

    // Everyone sees the same chain view; only the presenter gets the control button
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", paddingBottom: amPresenter ? FOOTER_H + 80 : FOOTER_H }}>
        {/* Header — identical for everyone */}
        <div style={{ padding: "28px 24px 20px", background: "#102540" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, marginBottom: 4 }}>
            CHAIN {currentRevealChain + 1} OF {revealOrder.length}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{currentPresenterPlayer?.name}'s chain</div>
        </div>

        {/* Chain view — grows in real time as presenter taps Reveal */}
        <div style={{ padding: "16px 24px" }}>
          {visibleDrawings.length === 0 ? (
            <p style={{ fontSize: 16, opacity: 0.5, fontWeight: 600, textAlign: "center", paddingTop: 40 }}>
              {amPresenter
                ? "Tap Reveal to show the first layer."
                : `Waiting for ${currentPresenterPlayer?.name} to start…`}
            </p>
          ) : (
            <>
              <StitchedChain drawings={visibleDrawings} players={players} />
              {allStepsRevealed && (
                <p style={{ fontSize: 15, opacity: 0.6, fontWeight: 600, textAlign: "center", marginTop: 20 }}>
                  That's the full exquisite corpse!
                </p>
              )}
              {!allStepsRevealed && !amPresenter && (
                <p style={{ fontSize: 14, opacity: 0.4, fontWeight: 600, textAlign: "center", marginTop: 16 }}>
                  Waiting for {currentPresenterPlayer?.name}…
                </p>
              )}
            </>
          )}
          <div ref={revealEndRef} />
        </div>

      </div>
        {pokeSystemNode(
          amPresenter
            ? (!allStepsRevealed
                ? <FooterButton onClick={handleAdvanceReveal} bg={YELLOW} textColor="#000">Reveal</FooterButton>
                : <FooterButton onClick={handleNextChain} bg={YELLOW} textColor="#000">{isLastChain ? "Finish →" : "Next chain →"}</FooterButton>)
            : null
        )}
      </>
    )
  }

  // ── Play phase ────────────────────────────────────────────────────────────

  if (!myChainOwner) {
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, fontWeight: 700 }}>Loading…</p>
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  const stepProgress = `${submittedCount} of ${n} done`

  // Waiting screen (submitted, others still drawing)
  if (myDrawingSubmitted) {
    const submittedPlayerIds = new Set(drawings.filter(d => d.round_number === currentRound).map(d => d.author_id))
    return (
      <>
      <div style={{ minHeight: "100dvh", background: BG, color: "white", display: "flex", flexDirection: "column", padding: "40px 24px", paddingBottom: BOTTOM_PAD }}>
        <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Waiting for everyone to finish…</p>
        <WaitingList
          players={players.map(p => ({ name: p.name, done: submittedPlayerIds.has(p.id) }))}
          myName={me?.name}
          onPoke={sendInlinePoke}
          cooldownActive={pokeCooldownActive}
          pokeJustSent={pokeJustSent}
        />
      </div>
        {pokeSystemNode()}
      </>
    )
  }

  // Drawing screen
  return (
    <>
    <div style={{ minHeight: "100dvh", background: BG, color: "white" }}>
      <StatusBar
        label={`ROUND ${currentRound + 1} OF ${n}`}
        progress={stepProgress}
        colors={{ bg: "#102540", text: "white" }}
      />
      <div style={{ padding: "20px 24px 10px" }}>
        <div style={{ fontSize: 15, opacity: 0.65, fontWeight: 500, marginTop: 4 }}>
          {currentRound === 0
            ? "Start something and adjust your fold line. The next player will only see below your fold line."
            : "Add to the drawing below the fold. You can draw over the existing art, but can't erase it."}
        </div>
      </div>

      <div style={{ padding: "0 24px", paddingBottom: BOTTOM_PAD }}>
        <DrawingCanvas
          key={`${currentRound}-${myChainOwner.id}`}
          peekImageUrl={myPrevDrawing?.content ?? null}
          peekFoldPct={myPrevDrawing?.fold_pct ?? 0.8}
          onExport={fn => { getExportRef.current = fn }}
          onFirstMark={() => setCanvasDirty(true)}
        />

        <button
          onClick={uploadAndSubmitDrawing}
          disabled={!canvasDirty || submitting}
          style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "20px", width: "100%", display: "block", marginTop: 16 }}
        >
          {submitting ? "Submitting…" : "Done Drawing"}
        </button>
        {!canvasDirty && !submitting && (
          <p style={{ fontSize: 13, opacity: 0.4, fontWeight: 600, textAlign: "center", marginTop: 8 }}>Draw something first!</p>
        )}

        {/* Random ideas */}
        <div style={{ marginTop: 20 }}>
          {shownIdeas.length < 9 ? (
            <button
              onClick={handleGetIdeas}
              disabled={loadingIdeas}
              style={{ background: WARM_LIGHT, color: "white", fontSize: 15, fontWeight: 800, padding: "14px 18px", width: "100%", marginBottom: shownIdeas.length ? 12 : 0 }}
            >
              {shownIdeas.length === 0 ? "✦ Random ideas" : "✦ 3 more ideas"}
            </button>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.25)", padding: "12px 18px", background: WARM_LIGHT, borderRadius: 6, marginBottom: 12 }}>
              No more ideas
            </div>
          )}
          {shownIdeas.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {shownIdeas.map((idea, i) => (
                <div key={i} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 14, fontWeight: 700, background: WARM_LIGHT, color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {idea}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
      {pokeSystemNode()}
    </>
  )
}

// ─── StitchedChain ────────────────────────────────────────────────────────────
// Each segment overlaps the previous one: segment i starts at the fold line of
// segment i-1. The stored image for round > 0 includes the peek strip at the top
// (peek height = (1 - prevFoldPct) * squareSize), so a negative margin equal to
// that peek fraction correctly aligns the images. margin-top as % is relative to
// container width; since images are square (or near-square), this works out.

function StitchedChain({ drawings, players }) {
  if (!drawings.length) return null

  return (
    <>
    <div style={{ position: "relative", width: "100%", borderRadius: 8, overflow: "hidden" }}>
      {drawings.map((d, i) => {
        const author = players.find(p => p.id === d.author_id)
        const overlapPct = i > 0 ? (1 - drawings[i - 1].fold_pct) * 100 : 0
        return (
          <div key={d.id} style={{ position: "relative", marginTop: i > 0 ? `-${overlapPct.toFixed(2)}%` : 0 }}>
            <img
              src={d.content}
              alt={`Layer ${i + 1}`}
              crossOrigin="anonymous"
              style={{ width: "100%", display: "block" }}
            />
            {/* Author label — overlaid on the image so it's not pushed out of place by the next layer's overlap */}
            <div style={{
              position: "absolute", bottom: 6, right: 8,
              background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.85)",
              fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
            }}>
              {author?.name ?? "?"} added this
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}

// ─── ChainModal ───────────────────────────────────────────────────────────────

async function downloadChain(drawings, ownerName) {
  const W = 600
  const imgs = await Promise.all(drawings.map(d => new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => res(img)
    img.onerror = rej
    img.src = d.content
  })))

  const yOffsets = [0]
  const heights = imgs.map(img => img.naturalHeight * W / img.naturalWidth)
  let totalH = heights[0]
  for (let i = 1; i < imgs.length; i++) {
    const overlapH = (1 - drawings[i - 1].fold_pct) * W
    const y = yOffsets[i - 1] + heights[i - 1] - overlapH
    yOffsets.push(y)
    totalH = y + heights[i]
  }

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = Math.round(totalH)
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, canvas.height)
  for (let i = 0; i < imgs.length; i++) {
    ctx.drawImage(imgs[i], 0, Math.round(yOffsets[i]), W, Math.round(heights[i]))
  }

  const a = document.createElement("a")
  a.href = canvas.toDataURL("image/jpeg", 0.92)
  a.download = `${ownerName.toLowerCase().replace(/\s+/g, "-")}-chain.jpg`
  a.click()
}

function ChainModal({ chain, players, onClose }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try { await downloadChain(chain.drawings, chain.owner.name) } catch {}
    setDownloading(false)
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>{chain.owner.name}'s chain</div>
        <button
          onClick={onClose}
          style={{ background: WARM_LIGHT, color: "white", width: 36, height: 36, borderRadius: "50%", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
        >×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 0" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <StitchedChain drawings={chain.drawings} players={players} />
          <div style={{ height: 24 }} />
        </div>
      </div>
      <div style={{ padding: "16px 24px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))", background: "rgba(0,0,0,0.95)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", gap: 10 }}>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{ flex: 1, background: YELLOW, color: "#000", fontSize: 16, fontWeight: 900, padding: "16px" }}
          >{downloading ? "Saving…" : "⬇ Save image"}</button>
          <button
            onClick={onClose}
            style={{ flex: 1, background: WARM_LIGHT, color: "white", fontSize: 16, fontWeight: 700, padding: "16px" }}
          >Close</button>
        </div>
      </div>
    </div>
  )
}
