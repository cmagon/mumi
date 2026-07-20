import { useEffect, useRef, useState } from 'react'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import Modal from './Modal'
import { RotateCw, Check } from 'lucide-react'

// Recorta una imagen a una relación de aspecto y tamaño objetivo, y devuelve un Blob (JPEG).
// aspect: 1 (cuadrada) | 16/9 (banner). salidaW/salidaH: tamaño final recomendado.
// `guia`: % de alto (centrado) que marca el área que se verá en móvil (opcional).
export default function ImageCropper({ file, aspect = 1, salidaW = 1000, salidaH = 1000, guia = 0, onCancel, onCropped }) {
  const imgRef = useRef(null)
  const cropperRef = useRef(null)
  const [src, setSrc] = useState('')
  const [procesando, setProcesando] = useState(false)

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

  const usar = () => {
    const c = cropperRef.current
    if (!c) return
    setProcesando(true)
    const canvas = c.getCroppedCanvas({ width: salidaW, height: salidaH, imageSmoothingQuality: 'high', fillColor: '#fff' })
    canvas.toBlob(
      (blob) => { setProcesando(false); if (blob) onCropped(blob) },
      'image/jpeg', 0.9
    )
  }

  return (
    <Modal open onClose={onCancel} title={`Recortar imagen (${salidaW}×${salidaH})`}
      footer={<>
        <button className="btn btn-secondary" onClick={() => cropperRef.current?.rotate(90)}><RotateCw size={14} /> Girar</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={usar} disabled={procesando}><Check size={14} /> {procesando ? 'Recortando…' : 'Recortar y usar'}</button>
      </>}>
      <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginBottom: 10 }}>
        Arrastra y haz zoom para encuadrar. Se recorta a {salidaW}×{salidaH}.
        {guia > 0 && <> El marco punteado indica lo que se verá en <strong>móvil</strong>: deja ahí lo importante.</>}
      </p>
      <div className={guia > 0 ? 'crop-guia' : ''} style={{ maxHeight: '60vh', background: '#f0ece2', ...(guia > 0 ? { ['--guia-h']: `${guia}%` } : {}) }}>
        {src && <img ref={imgRef} src={src} alt="" style={{ maxWidth: '100%', display: 'block' }} />}
      </div>
    </Modal>
  )
}
