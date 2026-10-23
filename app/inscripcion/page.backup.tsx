"use client"

import { useState } from "react"
import Link from "next/link"
import { useAudio } from "../../contexts/AudioContext"

interface FormData {
  nombre: string
  apellido: string
  edad: string
  telefono: string
  correo: string
  grupo: string
  mov: string
  estado: string
  ocupacion: string
  tieneInconveniente: string
  inconveniente: string
}

export default function Inscripcion() {
  const { isPlaying, toggleAudio, getCurrentTrackName } = useAudio()
  
  const [formData, setFormData] = useState<FormData>({
    nombre: "",
    apellido: "",
    edad: "",
    telefono: "",
    correo: "",
    grupo: "",
    mov: "",
    estado: "",
    ocupacion: "",
    tieneInconveniente: "",
    inconveniente: ""
  })

  const [errors, setErrors] = useState<{[key: string]: string}>({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState<FormData | null>(null)

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {}
    
    if (!formData.nombre.trim()) {
      newErrors.nombre = "Por favor, ingresá tu nombre"
    }
    
    if (!formData.apellido.trim()) {
      newErrors.apellido = "Por favor, ingresá tu apellido"
    }
    
    if (!formData.telefono.trim()) {
      newErrors.telefono = "Por favor, ingresá tu número de teléfono"
    }
    
    if (!formData.correo.trim()) {
      newErrors.correo = "Por favor, ingresá tu correo electrónico"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo)) {
      newErrors.correo = "Ingresá un correo electrónico válido"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      const response = await fetch('/api/inscripciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setSubmittedData(formData)
        setIsSubmitted(true)
      } else {
        alert('Error al enviar la inscripción. Por favor, intentá de nuevo.')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error al enviar la inscripción. Por favor, intentá de nuevo.')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }))
    }
  }

  if (isSubmitted && submittedData) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="bg-gray-900 p-4 flex justify-between items-center">
          <Link href="/" className="text-yellow-400 hover:text-yellow-300 text-lg">
             Volver al inicio
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300">
              {getCurrentTrackName()}
            </span>
            <button
              onClick={toggleAudio}
              className="bg-yellow-400 text-black p-2 rounded-full hover:bg-yellow-300 transition-colors"
            >
              {isPlaying ? "" : ""}
            </button>
          </div>
        </div>

        <div className="p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-green-900 border border-green-500 rounded-lg p-8 mb-6">
              <h1 className="text-3xl font-bold text-green-400 mb-4">
                ¡Inscripción enviada con éxito! 
              </h1>
              <p className="text-lg text-green-300 mb-6">
                Tu inscripción ha sido registrada correctamente. 
                Pronto nos pondremos en contacto contigo para confirmar tu lugar en el taller.
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 mb-6 text-left">
              <h2 className="text-xl font-bold text-yellow-400 mb-4">Datos de tu inscripción:</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><strong>Nombre:</strong> {submittedData.nombre}</div>
                <div><strong>Apellido:</strong> {submittedData.apellido}</div>
                {submittedData.edad && <div><strong>Edad:</strong> {submittedData.edad}</div>}
                <div><strong>Teléfono:</strong> {submittedData.telefono}</div>
                <div><strong>Correo:</strong> {submittedData.correo}</div>
                {submittedData.grupo && <div><strong>Grupo musical:</strong> {submittedData.grupo}</div>}
                {submittedData.mov && <div><strong>Movimiento:</strong> {submittedData.mov}</div>}
                {submittedData.estado && <div><strong>Estado civil:</strong> {submittedData.estado}</div>}
                {submittedData.ocupacion && <div><strong>Ocupación:</strong> {submittedData.ocupacion}</div>}
                {submittedData.tieneInconveniente && (
                  <div className="md:col-span-2">
                    <strong>Inconvenientes:</strong> {submittedData.tieneInconveniente}
                    {submittedData.inconveniente && <div className="mt-2"><strong>Detalles:</strong> {submittedData.inconveniente}</div>}
                  </div>
                )}
              </div>
            </div>

            <Link 
              href="/" 
              className="inline-block bg-yellow-400 text-black px-8 py-3 rounded-full font-bold hover:bg-yellow-300 transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="bg-gray-900 p-4 flex justify-between items-center">
        <Link href="/" className="text-yellow-400 hover:text-yellow-300 text-lg">
           Volver al inicio
        </Link>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">
            {getCurrentTrackName()}
          </span>
          <button
            onClick={toggleAudio}
            className="bg-yellow-400 text-black p-2 rounded-full hover:bg-yellow-300 transition-colors"
          >
            {isPlaying ? "" : ""}
          </button>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 text-yellow-400">Inscripción al Taller</h1>
          <p className="text-gray-300 mb-8">Completá el formulario para inscribirte</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Nombre *</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
                {errors.nombre && <p className="text-red-400 text-sm mt-1">{errors.nombre}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Apellido *</label>
                <input
                  type="text"
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
                {errors.apellido && <p className="text-red-400 text-sm mt-1">{errors.apellido}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Edad</label>
                <input
                  type="number"
                  name="edad"
                  value={formData.edad}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Teléfono *</label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
                {errors.telefono && <p className="text-red-400 text-sm mt-1">{errors.telefono}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Correo electrónico *</label>
              <input
                type="email"
                name="correo"
                value={formData.correo}
                onChange={handleChange}
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              />
              {errors.correo && <p className="text-red-400 text-sm mt-1">{errors.correo}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Grupo musical</label>
                <input
                  type="text"
                  name="grupo"
                  value={formData.grupo}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Movimiento</label>
                <input
                  type="text"
                  name="mov"
                  value={formData.mov}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Estado civil</label>
                <select
                  name="estado"
                  value={formData.estado}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                >
                  <option value="">Seleccioná</option>
                  <option value="soltero">Soltero/a</option>
                  <option value="casado">Casado/a</option>
                  <option value="divorciado">Divorciado/a</option>
                  <option value="viudo">Viudo/a</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ocupación</label>
                <input
                  type="text"
                  name="ocupacion"
                  value={formData.ocupacion}
                  onChange={handleChange}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">¿Algún inconveniente?</label>
              <select
                name="tieneInconveniente"
                value={formData.tieneInconveniente}
                onChange={handleChange}
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              >
                <option value="">Seleccioná</option>
                <option value="no">No</option>
                <option value="si">Sí</option>
              </select>
            </div>

            {formData.tieneInconveniente === "si" && (
              <div>
                <label className="block text-sm font-medium mb-2">Detalles</label>
                <textarea
                  name="inconveniente"
                  value={formData.inconveniente}
                  onChange={handleChange}
                  rows={3}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-yellow-400 text-black py-3 px-6 rounded-lg font-bold text-lg hover:bg-yellow-300 transition-colors"
            >
              Enviar inscripción
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
