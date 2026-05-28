"use client"

// Backward-compatible wrapper that composes Footer + Menu + Notifications.
// Existing game pages use this component unchanged. New games can import the
// individual components directly for more control.

import { useState } from "react"
import Footer, { FOOTER_H } from "./Footer"
import Menu from "./Menu"
import Notifications from "./Notifications"
import { supabase as defaultSupabase } from "../lib/supabase"

export { FOOTER_H }

export default function PokeSystem({
  colors,
  onResetToLobby,
  rules,
  roomCode,
  currentPlayer,
  allPlayers,
  playerDetails,
  word,
  roleContent,
  gamePhase,
  timerRunning,
  peekBarHeight,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <Notifications
        supabase={defaultSupabase}
        colors={colors}
        roomCode={roomCode}
        currentPlayer={currentPlayer}
      />
      <Menu
        supabase={defaultSupabase}
        colors={colors}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        roomCode={roomCode}
        currentPlayer={currentPlayer}
        allPlayers={allPlayers}
        playerDetails={playerDetails}
        gamePhase={gamePhase}
        word={word}
        roleContent={roleContent}
        onResetToLobby={onResetToLobby}
        rules={rules}
        peekBarHeight={peekBarHeight}
      />
      <Footer
        colors={colors}
        isOpen={menuOpen}
        onToggle={() => setMenuOpen(o => !o)}
        timerRunning={timerRunning}
        peekBarHeight={peekBarHeight}
      >
        {children}
      </Footer>
    </>
  )
}
