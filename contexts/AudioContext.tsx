"use client"

import React, { createContext, useContext, useRef, useState, useEffect } from 'react'

interface AudioContextType {
  isPlaying: boolean
  currentTrack: number
  toggleAudio: () => void
  nextTrack: () => void
  getCurrentTrackName: () => string
}

const AudioContext = createContext<AudioContextType | undefined>(undefined)

export const useAudio = () => {
  const context = useContext(AudioContext)
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider')
  }
  return context
}

interface AudioProviderProps {
  children: React.ReactNode
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)
  const hasTriedAutoplay = useRef(false)

  // Lista de canciones
  const playlist = [
    "/Jesús te seguiré con letra - Daniel Poli [lc62Pm6-bY4].mp3",
    "/Señor Aqui estoy -Daniel poli (MEJORADO) [jjM30Vt5xT8].mp3",
    "/santo santo santo .mp3",
    "/Alma Misionera.mp3"
  ]

  const trackNames = [
    "Jesús, te seguiré",
    "Señor, aquí estoy",
    "Santo, Santo, Santo",
    "Alma Misionera"
  ]

  useEffect(() => {
    // Solo inicializar una vez por montaje del componente
    if (!isInitialized) {
      console.log("🎵 Inicializando AudioContext...")
      
      // Crear el elemento audio solo si no existe
      if (!audioRef.current) {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.src = playlist[currentTrack]
        audioRef.current = audio

        // Eventos del audio
        const handlePlay = () => setIsPlaying(true)
        const handlePause = () => setIsPlaying(false)
        const handleEnded = () => {
          const nextTrack = (currentTrack + 1) % playlist.length
          setCurrentTrack(nextTrack)
        }

        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handleEnded)

        // Intentar reproducir automáticamente en cada carga de la aplicación
        if (!hasTriedAutoplay.current) {
          hasTriedAutoplay.current = true
          
          const attemptAutoplay = async () => {
            try {
              console.log("🎵 Intentando reproducción automática...")
              await audio.play()
              console.log("✅ Reproducción automática exitosa")
            } catch (error) {
              console.log("❌ Reproducción automática bloqueada:", error)
              console.log("⏸️  Esperando interacción del usuario...")
              
              // Agregar un event listener para el primer click/touch del usuario
              const handleFirstInteraction = async () => {
                try {
                  await audio.play()
                  console.log("🎵 Reproducción iniciada por interacción del usuario")
                } catch (err) {
                  console.error("❌ Error al reproducir:", err)
                }
              }
              
              document.addEventListener('click', handleFirstInteraction, { once: true })
              document.addEventListener('touchstart', handleFirstInteraction, { once: true })
              document.addEventListener('keydown', handleFirstInteraction, { once: true })
            }
          }
          
          // Delay para asegurar que la página esté completamente cargada
          setTimeout(attemptAutoplay, 500)
        }
      }
      setIsInitialized(true)
    }

    return () => {
      // Cleanup solo cuando el componente se desmonte completamente
      if (audioRef.current && !document.body.contains(document.querySelector('[data-audio-provider]'))) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [isInitialized])

  // Actualizar la fuente del audio cuando cambie la pista
  useEffect(() => {
    if (audioRef.current && isInitialized) {
      const wasPlaying = !audioRef.current.paused
      audioRef.current.src = playlist[currentTrack]
      
      if (wasPlaying) {
        audioRef.current.play().catch(console.error)
      }
    }
  }, [currentTrack, isInitialized])

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(console.error)
      }
    }
  }

  const nextTrack = () => {
    const next = (currentTrack + 1) % playlist.length
    setCurrentTrack(next)
    // Reproducir automáticamente la siguiente canción
    if (audioRef.current) {
      setTimeout(() => {
        audioRef.current?.play().catch(console.error)
      }, 100)
    }
  }

  const getCurrentTrackName = () => {
    return trackNames[currentTrack] || "Cargando..."
  }

  return (
    <div data-audio-provider>
      <AudioContext.Provider 
        value={{ 
          isPlaying, 
          currentTrack, 
          toggleAudio,
          nextTrack, 
          getCurrentTrackName 
        }}
      >
        {children}
      </AudioContext.Provider>
    </div>
  )
}