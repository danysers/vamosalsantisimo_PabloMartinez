export const argentinaProvinces = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
  'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis',
  'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
] as const

export function validWorkshopLocation(country: string, province: string, locality?: string) {
  if (country.trim().toLocaleLowerCase('es-AR') === 'argentina') {
    return argentinaProvinces.some(value => value === province)
  }
  return !!province.trim() && !!locality?.trim()
}
