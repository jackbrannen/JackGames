"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import Lobby from "../../components/Lobby"
import Footer, { FOOTER_H } from "../../components/Footer"
import FooterButton from "../../components/FooterButton"
import IdleGateModal from "../../components/IdleGateModal"
import { useIdleGate } from "../../lib/useIdleGate"

const BG         = "#249E64"
const DARK       = "#1F8767"
const MID        = "#219165"
const YELLOW     = "#FBDF54"
const TEXT       = "white"
const WARM_LIGHT = "#29B55B"
const BOYS       = "#174867"
const GIRLS      = "#D4377C"

const MIN_TEAM = 2

const WORDS_A = ["AMBER","CEDAR","CRIMSON","DAGGER","EMBER","FALCON","GLACIER","HARBOR","INDIGO","JASPER","KODIAK","LANTERN","MARBLE","NEBULA","ONYX","PHANTOM","QUARTZ","RAVEN","SILVER","TOPAZ"]

function splitCode(code) {
  for (const w of WORDS_A) {
    if (code.startsWith(w)) return [w, code.slice(w.length)]
  }
  return [code, ""]
}

function loadProfile() {
  try {
    const local = JSON.parse(localStorage.getItem("jackgames:profile") || "null")
    const match = document.cookie.match(/(?:^|;\s*)jackgames_profile=([^;]*)/)
    const cookie = match ? JSON.parse(decodeURIComponent(match[1])) : null
    const merged = { ...(local ?? {}) }
    for (const [k, v] of Object.entries(cookie ?? {})) { if (v) merged[k] = v }
    if (merged.firstName && merged.lastName) return merged
  } catch {}
  return null
}

function saveProfile(profile) {
  const json = JSON.stringify(profile)
  localStorage.setItem("jackgames:profile", json)
  document.cookie = `jackgames_profile=${encodeURIComponent(json)}; domain=.jackbrannen.com; max-age=31536000; path=/; SameSite=Lax`
}

const inputStyle = {
  background: WARM_LIGHT, color: TEXT,
  fontSize: 20, padding: "16px 18px",
  width: "100%", display: "block",
  border: "none", outline: "none", boxSizing: "border-box",
}

const INSTRUCTIONS = `Two teams. Everyone submits words at the start; those become the pool for the whole game.

On your turn, pick 1–3 words from the board. When the countdown ends, you have 4 seconds to make sound effects for the words you picked — no talking, no miming, just noises. Your teammates each pick up to 3 words they think you meant.

Score +1 per correct guess, -1 per word you picked that they missed, -1 per word they guessed that you didn't pick.

Correctly guessed words leave the board; new ones take their place.

Here's the catch: words that stick around get more valuable — up to 9 points — the longer they survive.

First team to [16] points wins.`

const POKE_COLORS = { dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW, notifBg: "#2A0E0B" }
const BOTTOM_PAD = `calc(${FOOTER_H + 8}px + env(safe-area-inset-bottom))`

export default function LobbyPage({ params }) {
  const router = useRouter()
  const code = useMemo(() => params.code.toUpperCase(), [params.code])

  const [gameExists, setGameExists] = useState(null)
  const [gamePhase, setGamePhase] = useState("lobby")
  const [firstTeam, setFirstTeam] = useState("girls")
  const [winScore, setWinScore] = useState(16)
  const [players, setPlayers] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const isIdle = useIdleGate()
  const [savedProfile, setSavedProfile] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [name, setName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [confirmingStart, setConfirmingStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const channelRef = useRef(null)

  const me = players.find(p => p.id === myPlayerId)
  const boysTeam = players.filter(p => p.team === "boys")
  const girlsTeam = players.filter(p => p.team === "girls")

  async function refreshPlayers() {
    const { data } = await supabase
      .from("sb_players")
      .select("id,name,team,created_at")
      .eq("game_code", code)
      .order("created_at", { ascending: true })
    if (data) setPlayers(data)
  }

  async function loadGame() {
    const { data, error } = await supabase
      .from("sb_games")
      .select("code,phase,first_team,win_score")
      .eq("code", code)
      .single()
    if (error || !data) { setGameExists(false); return }
    setGameExists(true)
    setGamePhase(data.phase)
    setFirstTeam(data.first_team ?? "girls")
    setWinScore(data.win_score ?? 16)
  }

  async function loadState() {
    await loadGame()
    await refreshPlayers()
  }

  useEffect(() => {
    const saved = loadProfile()
    if (saved) { if (saved.username) saveProfile(saved); setSavedProfile(saved); setName(saved.username || "") }
  }, [])

  useEffect(() => {
    if (isIdle) return
    const existing = localStorage.getItem(`sb:${code}:playerId`)
    if (existing) setMyPlayerId(existing)
    loadState()
    const poll = setInterval(loadState, 60000)
    function handleVisibility() { if (!document.hidden) loadState() }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`soundboard-lobby-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sb_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "sb_games", filter: `code=eq.${code}` }, loadState)
      .on("broadcast", { event: "sync" }, loadState)
      .subscribe()
    channelRef.current = channel
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code, isIdle])

  useEffect(() => {
    if (gamePhase !== "lobby" && myPlayerId) router.replace(`/${code}/play`)
  }, [gamePhase, myPlayerId])

  async function join(team) {
    const trimmed = name.trim()
    if (!trimmed || joining) return
    const trimmedFirst = (savedProfile?.firstName || firstName).trim()
    const trimmedLast  = (savedProfile?.lastName  || lastName).trim()
    if (!trimmedFirst || !trimmedLast) return

    setJoining(true)
    setJoinError("")

    const { data: existing } = await supabase
      .from("sb_players").select("id").eq("game_code", code).ilike("name", trimmed).limit(1)
    if (existing?.length > 0) {
      setJoinError("That username is taken.")
      setJoining(false)
      return
    }

    const newProfile = { firstName: trimmedFirst, lastName: trimmedLast, username: trimmed }
    saveProfile(newProfile)
    setSavedProfile(newProfile)

    const { data, error } = await supabase
      .from("sb_players")
      .insert({ game_code: code, name: trimmed, first_name: trimmedFirst, last_name: trimmedLast, team })
      .select("id").single()
    if (error) { alert("Failed to join: " + error.message); setJoining(false); return }

    localStorage.setItem(`sb:${code}:playerId`, data.id)
    setMyPlayerId(data.id)
    setJoining(false)
    refreshPlayers()
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function switchTeam() {
    if (!me) return
    await supabase.from("sb_players").update({ team: me.team === "boys" ? "girls" : "boys" }).eq("id", me.id)
    refreshPlayers()
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    const { error } = await supabase.rpc("sb_start_game", { p_code: code })
    if (error) {
      alert(error.message ?? "Failed to start game")
      setStarting(false)
      return
    }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
    router.push(`/${code}/play`)
  }

  async function saveSettings() {
    const { error } = await supabase
      .from("sb_games")
      .update({ first_team: firstTeam, win_score: Number(winScore) || 16 })
      .eq("code", code)
    if (error) { console.error("Failed to save settings:", error); return }
    channelRef.current?.send({ type: "broadcast", event: "sync" })
  }

  function onInvite() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `Join Sound Board — ${code}`, url })
    else { navigator.clipboard.writeText(url).then(() => alert("Link copied!")) }
  }

  const canStart = boysTeam.length >= MIN_TEAM && girlsTeam.length >= MIN_TEAM
  const [w1, w2] = splitCode(code)

  if (isIdle) {
    return <IdleGateModal colors={POKE_COLORS} />
  }

  return (
    <>
      <div style={{ paddingBottom: BOTTOM_PAD }}>
        <Lobby
          code={code}
          gameName="Sound Board"
          players={players.map(p => ({
            id: p.id, name: p.name,
            teamLabel: p.team === "boys" ? "Boys" : p.team === "girls" ? "Girls" : undefined,
            teamColor: p.team === "boys" ? BOYS : p.team === "girls" ? GIRLS : undefined,
          }))}
          myPlayerId={myPlayerId}
          onInvite={onInvite}
          howToPlayContent={INSTRUCTIONS}
          codeDisplay={
            <>
              <span style={{ color: YELLOW }}>{w1}</span>
              <span style={{ color: TEXT }}>{w2}</span>
            </>
          }
          joinContent={
            !me ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
                  Join Game
                </div>
                {!savedProfile && (
                  <>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                    <input value={lastName}  onChange={e => setLastName(e.target.value)}  placeholder="Last name"  maxLength={40} style={{ ...inputStyle, marginBottom: 8 }} />
                  </>
                )}
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Display Name"
                  maxLength={45}
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => join("boys")}
                    disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                    style={{ background: BOYS, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1 }}
                  >
                    {joining ? "Joining…" : "Join Boys"}
                  </button>
                  <button
                    onClick={() => join("girls")}
                    disabled={!name.trim() || (!savedProfile && (!firstName.trim() || !lastName.trim())) || joining}
                    style={{ background: GIRLS, color: "white", fontSize: 16, fontWeight: 900, padding: "16px", flex: 1 }}
                  >
                    {joining ? "Joining…" : "Join Girls"}
                  </button>
                </div>
                {joinError && <p style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: YELLOW }}>{joinError}</p>}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
                  You
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>
                  {me.name} <span style={{ fontSize: 14, opacity: 0.65 }}>· {me.team === "boys" ? "Boys" : "Girls"}</span>
                </div>
                <button onClick={switchTeam} style={{ background: "rgba(255,255,255,0.15)", color: TEXT, fontSize: 14, fontWeight: 800, padding: "12px 18px" }}>
                  Switch Genders
                </button>
              </div>
            )
          }
          settingsContent={closeModal => (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>Who goes first?</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
                {[["girls", "Girls"], ["boys", "Boys"]].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFirstTeam(val)}
                    style={{
                      flex: 1,
                      background: firstTeam === val ? YELLOW : WARM_LIGHT,
                      color: firstTeam === val ? "#000" : "white",
                      fontSize: 16,
                      fontWeight: 900,
                      padding: "14px 8px",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 12 }}>Points to win</div>
              <input
                type="number"
                value={winScore}
                onChange={e => setWinScore(e.target.value)}
                min={1}
                style={{ ...inputStyle, marginBottom: 32 }}
              />

              <button
                onClick={() => { saveSettings(); closeModal() }}
                style={{ background: YELLOW, color: "#000", fontSize: 18, fontWeight: 900, padding: "16px", width: "100%" }}
              >
                Save
              </button>
            </div>
          )}
          colors={{ bg: BG, dark: DARK, mid: MID, wl: WARM_LIGHT, yellow: YELLOW }}
          minPlayers={MIN_TEAM * 2}
          notFound={gameExists === false}
          loading={gameExists === null}
          onRemovePlayer={async (id) => { await supabase.from("sb_players").delete().eq("id", id); loadState(); channelRef.current?.send({ type: "broadcast", event: "sync" }) }}
          extraContent={!canStart && players.length > 0 ? (
            <p style={{ fontSize: 13, opacity: 0.65, fontWeight: 600 }}>Each team needs 2+ players to start.</p>
          ) : null}
        />
      </div>

      {canStart && (
        <Footer colors={POKE_COLORS}>
          <FooterButton
            onClick={() => { setConfirmingStart(true); throw new Error("Modal opened") }}
            disabled={starting || confirmingStart}
            bg={YELLOW}
            textColor="#000"
          >
            Start Game
          </FooterButton>
        </Footer>
      )}

      {confirmingStart && (
        <div
          onClick={() => setConfirmingStart(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: DARK, width: "100%", maxWidth: 400, padding: "28px 24px" }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginBottom: 8 }}>
              Start the game?
            </h2>
            <p style={{ fontSize: 15, color: TEXT, opacity: 0.75, fontWeight: 600, marginBottom: 20 }}>
              This will begin for everyone. Are all players in?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 24 }}>
              {players.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{
                    padding: "10px 0", minWidth: 40, flexShrink: 0,
                    background: MID,
                    fontSize: 15, fontWeight: 900, color: TEXT,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    padding: "10px 14px", flex: 1,
                    background: MID,
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>
                      {p.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmingStart(false)}
                style={{ flex: 1, background: WARM_LIGHT, color: TEXT, fontSize: 17, fontWeight: 800, padding: "16px" }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmingStart(false); startGame() }}
                disabled={starting}
                style={{ flex: 2, background: YELLOW, color: "#000", fontSize: 17, fontWeight: 900, padding: "16px" }}
              >
                {starting ? "Starting…" : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
