"use client"

import { useEffect, useRef, useState } from "react"

export default function GlobalAudio() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  
  const tracks = [
    "/Jesús te seguiré con letra - Daniel Poli [lc62Pm6-bY4].mp3",
    "/Señor Aqui estoy -Daniel poli (MEJORADO) [jjM30Vt5xT8].mp3",
    "/Señor Aqui estoy -Daniel poli (MEJORADO) [jjM30Vt5xT8] (1).mp3"
  ]

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const playCurrentTrack = () => {
      audio.src = tracks[currentTrackIndex]
      audio.play().catch((error) => {
        console.log("[Audio] Autoplay bloqueado:", error)
      })
    }

    const handleTrackEnd = () => {
      // Pasar a la siguiente canción
      setCurrentTrackIndex((prevIndex) => (prevIndex + 1) % tracks.length)
    }

    // Configurar evento para cuando termine la canción
    audio.addEventListener('ended', handleTrackEnd)
    
    // Reproducir la canción actual
    playCurrentTrack()

    return () => {
      audio.removeEventListener('ended', handleTrackEnd)
    }
  }, [currentTrackIndex])

  useEffect(() => {
    // Iniciar reproducción al montar el componente
    if (audioRef.current) {
      audioRef.current.play().catch((error) => {
        console.log("[Audio] Autoplay bloqueado:", error)
      })
    }
  }, [])

  return (
    <audio 
      ref={audioRef} 
      preload="auto"
      style={{ display: 'none' }}
    />
  )
}