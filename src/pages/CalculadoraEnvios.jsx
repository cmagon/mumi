import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Truck, Settings, Calculator } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fCOP } from '../lib/businessLogic'
import { calcularEnvio } from '../lib/calculadoraEnvio'
import MoneyInput from '../components/ui/MoneyInput'
import Modal from '../components/ui/Modal'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'

const Ico = ({ as: C, size = 15 }) => (
  <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
)

function ResultCard({ label, value, sub, accent = 'verde' }) {
  return (
    <div className={`kpi-card ${accent}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: '1.55rem' }}>{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  )
}

export default function CalculadoraEnvios() {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = (profile?.rol || '') === 'admin'

  const [largo, setLargo] = useState('')
  const [ancho, setAncho] = useState('')
  const [alto, setAlto] = useState('')
  const [pesoReal, setPesoReal] = useState('')
  const [precioKilo, setPrecioKilo] = useState('')
  const [precioAdicional, setPrecioAdicional] = useState('')
  const [saving, setSaving] = useState(false)
  const [tarifasLoaded, setTarifasLoaded] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [resultado, setResultado] = useState(null)   // null hasta que el usuario pulse "Calcular"

  const { data: tarifas } = useQuery({
    queryKey: ['envio_tarifas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('costing_settings')
        .select('precio_kilo, precio_adicional')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      return data || { precio_kilo: null, precio_adicional: null }
    },
  })

  useEffect(() => {
    if (!tarifas || tarifasLoaded) return
    setPrecioKilo(tarifas.precio_kilo != null ? Number(tarifas.precio_kilo) : '')
    setPrecioAdicional(tarifas.precio_adicional != null ? Number(tarifas.precio_adicional) : '')
    setTarifasLoaded(true)
  }, [tarifas, tarifasLoaded])

  const tarifasListas = precioKilo !== '' && precioAdicional !== ''

  const calcular = () => {
    if (!tarifasListas) {
      toast('Primero configura el precio por kilo y el kilo adicional', 'error')
      setConfigOpen(true)
      return
    }
    const r = calcularEnvio({
      largoCm: largo, anchoCm: ancho, altoCm: alto,
      pesoRealKg: pesoReal, precioKilo, precioAdicional,
    })
    if (r.costoAprox == null) {
      toast('Ingresa las medidas y el peso del paquete', 'error')
      return
    }
    setResultado({ ...r, precioKilo, precioAdicional })
  }

  const guardarTarifas = async () => {
    const pk = Number(precioKilo)
    const pa = Number(precioAdicional)
    if (!(pk >= 0) || !(pa >= 0)) {
      toast('Indica precio por kilo y precio adicional (≥ 0)', 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('costing_settings').upsert(
        {
          id: 1,
          precio_kilo: pk,
          precio_adicional: pa,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['envio_tarifas'] })
      toast('Tarifas de envío guardadas ✓')
      setConfigOpen(false)
    } catch (e) {
      toast(e.message || 'No se pudieron guardar las tarifas', 'error')
    } finally {
      setSaving(false)
    }
  }

  const fmtKg = (n) => {
    if (n == null) return '—'
    return `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg`
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Ico as={Truck} size={22} />Calculadora de costos de envío</h1>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
          <Ico as={Package} size={14} />Medidas del paquete
          <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setConfigOpen(true)}>
            <Ico as={Settings} size={14} />Configurar
          </button>
        </div>
        <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Largo</label>
            <input className="form-control" type="number" inputMode="decimal" min="0" step="any" placeholder="cm" value={largo} onChange={(e) => setLargo(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Ancho</label>
            <input className="form-control" type="number" inputMode="decimal" min="0" step="any" placeholder="cm" value={ancho} onChange={(e) => setAncho(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Alto</label>
            <input className="form-control" type="number" inputMode="decimal" min="0" step="any" placeholder="cm" value={alto} onChange={(e) => setAlto(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Peso real</label>
            <input className="form-control" type="number" inputMode="decimal" min="0" step="any" placeholder="kg" value={pesoReal} onChange={(e) => setPesoReal(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={calcular}>
            <Ico as={Calculator} size={15} />Calcular
          </button>
        </div>
      </div>

      {resultado && (
        <div className="kpi-grid" style={{ marginTop: 20 }}>
          <ResultCard label="Peso volumétrico" value={fmtKg(resultado.pesoVolumetrico)} sub="(L × A × H) / 6000" accent="lima" />
          <ResultCard label="Peso a cobrar" value={fmtKg(resultado.pesoCobrar)} sub="Máximo entre real y volumétrico" accent="dorado" />
          <ResultCard
            label="Costo aprox. envío"
            value={resultado.costoAprox == null ? '—' : fCOP(resultado.costoAprox)}
            sub={`${fCOP(resultado.precioKilo)} + ${fCOP(resultado.precioAdicional)} × ${Number(Math.max(0, resultado.pesoCobrar - 1)).toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg adic.`}
            accent="verde"
          />
        </div>
      )}

      {/* Configuración de tarifas: precio por kilo y kilo adicional */}
      <Modal open={configOpen} onClose={() => setConfigOpen(false)} guard={false}
        title="Configurar tarifas de envío"
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfigOpen(false)}>Cerrar</button>
            {esAdmin && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={guardarTarifas}>
                {saving ? 'Guardando…' : 'Guardar tarifas'}
              </button>
            )}
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Precio × kilo (1<sup>er</sup> kg)</label>
            <MoneyInput value={precioKilo} onChange={setPrecioKilo} placeholder="COP / kg" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Precio kilo adicional</label>
            <MoneyInput value={precioAdicional} onChange={setPrecioAdicional} placeholder="COP / kg" />
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--texto-suave)', lineHeight: 1.5 }}>
            Peso volumétrico = (Largo × Ancho × Alto) / 6000 · Peso a cobrar = el mayor entre peso real y volumétrico ·
            Costo ≈ precio 1<sup>er</sup> kg + precio kg adicional × (peso a cobrar − 1).
            {!esAdmin && ' Solo un administrador puede guardar cambios.'}
          </p>
        </div>
      </Modal>
    </div>
  )
}
