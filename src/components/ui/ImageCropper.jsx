import { useEffect, useRef, useState } from 'react'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import Modal from './Modal'
import { RotateCw, Check } from 'lucide-react'

// Recorta una imagen a una relación de aspecto y tamaño(s) objetivo, y devuelve Blob(s) JPEG.
// aspect: 1 (cuadrada) | 16/9 (banner). salidaW/salidaH: tamaño final recomendado.
// variantes: [{ key, w, h }] — genera varias resoluciones del mismo recorte (web + móvil).
// guia: % de alto (centrado) que marca el área que se verá en móvil (opcional).
export default function ImageCropper({
  file, aspect = 1, salidaW = 1000, salidaH = 1000, variantes = null, guia = 0, onCancel, onCropped,
}) {
  const imgRef = useRef(null)
  const cropperRef = useRef(null)
  const [src, setSrc] = useState('')
  const [procesando, setProcesando] = useState(false)
  const lista = Array.isArray(variantes) && variantes.length
    ? variantes
    : [{ key: 'main', w: salidaW, h: salidaH }]
  const etiqueta = lista.map(v => `${v.w}×${v.h}`).join(' + ')

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!src || !imgRef.current) return
    const c = new Cropper(imgRef.current, {
      aspectRatio: aspect, viewMode: 1, autoCropArea: 1, background: false,
      responsive: true, movable: true, zoomable: true, dragMode: 'move',
    })
    cropperRef.current = c
    return () => c.destroy()
  }, [src, aspect])

  const blobDe = (canvas) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
  })

  const usar = async () => {
    const c = cropperRef.current
    if (!c) return
    setProcesando(true)
    try {
      const out = {}
      for (const v of lista) {
        const canvas = c.getCroppedCanvas({ width: v.w, height: v.h, imageSmoothingQuality: 'high', fillColor: '#fff' })
        out[v.key] = await blobDe(canvas)
      }
      if (lista.length === 1 && lista[0].key === 'main') onCropped(out.main)
      else onCropped(out)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal open onClose={onCancel} title={`Recortar imagen (${etiqueta})`} size="modal-lg" guard={false}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => cropperRef.current?.rotate(90)}><RotateCw size={14} /> Girar</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={usar} disabled={procesando}><Check size={14} /> {procesando ? 'Recortando…' : 'Recortar y usar'}</button>
      </>}>
      <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginBottom: 10 }}>
        Arrastra y haz zoom para encuadrar. Se genera{lista.length > 1 ? 'n' : ''} {etiqueta}.
        {lista.length > 1 && <> Versión <strong>web</strong> y <strong>móvil</strong> del mismo recorte.</>}
        {guia > 0 && <> El marco punteado indica lo que se verá en <strong>móvil</strong>: deja ahí lo importante.</>}
      </p>
      <div
        className={`crop-stage${guia > 0 ? ' crop-guia' : ''}`}
        style={guia > 0 ? { ['--guia-h']: `${guia}%` } : undefined}
      >
        {src && <img ref={imgRef} src={src} alt="" style={{ maxWidth: '100%', display: 'block' }} />}
      </div>
    </Modal>
  )
}
