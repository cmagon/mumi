import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fCOP } from '../lib/businessLogic'
import { calcularEnvio } from '../lib/calculadoraEnvio'
import MoneyInput from '../components/ui/MoneyInput'
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

  const { pesoVolumetrico, pesoCobrar, costoAprox } = calcularEnvio({
    largoCm: largo,
    anchoCm: ancho,
    altoCm: alto,
    pesoRealKg: pesoReal,
    precioKilo,
    precioAdicional,
  })

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

      <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
        Peso volumétrico = (Largo × Ancho × Alto) / 6000 · Peso a cobrar = el mayor entre peso real y volumétrico ·
        Costo ≈ precio 1<sup>er</sup> kg + precio kg adicional × (peso a cobrar − 1).
      </div>

      <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-title"><Ico as={Package} size={14} />Medidas del paquete</div>
          <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Largo</label>
              <input
                className="form-control"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="cm"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ancho</label>
              <input
                className="form-control"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="cm"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Alto</label>
              <input
                className="form-control"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="cm"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Peso real</label>
              <input
                className="form-control"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="kg"
                value={pesoReal}
                onChange={(e) => setPesoReal(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Tarifas (se guardan en la empresa)</div>
          <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Precio × kilo (1<sup>er</sup> kg)</label>
              <MoneyInput value={precioKilo} onChange={setPrecioKilo} placeholder="COP / kg" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Precio kilo adicional</label>
              <MoneyInput value={precioAdicional} onChange={setPrecioAdicional} placeholder="COP / kg" />
            </div>
          </div>
          {esAdmin ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              disabled={saving}
              onClick={guardarTarifas}
            >
              {saving ? 'Guardando…' : 'Guardar tarifas'}
            </button>
          ) : (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: '0.8rem', color: 'var(--texto-suave)' }}>
              Las tarifas guardadas se cargan al abrir. Solo un administrador puede persistir cambios.
            </p>
          )}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: 20 }}>
        <ResultCard
          label="Peso volumétrico"
          value={fmtKg(pesoVolumetrico)}
          sub="(L × A × H) / 6000"
          accent="lima"
        />
        <ResultCard
          label="Peso a cobrar"
          value={fmtKg(pesoCobrar)}
          sub="Máximo entre real y volumétrico"
          accent="dorado"
        />
        <ResultCard
          label="Costo aprox. envío"
          value={costoAprox == null ? '—' : fCOP(costoAprox)}
          sub={
            pesoCobrar != null && precioKilo !== '' && precioAdicional !== ''
              ? `${fCOP(precioKilo)} + ${fCOP(precioAdicional)} × ${Number(Math.max(0, pesoCobrar - 1)).toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg adic.`
              : 'Completa medidas, peso y tarifas'
          }
          accent="verde"
        />
      </div>
    </div>
  )
}
