import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile, beginSilentWrites, endSilentWrites } from '../lib/supabase'
import { startDownload, updateDownload, endDownload, isDownloadCanceled } from '../lib/downloadProgress'
import { reservarPEPS, liberarReservaLotes, consumirReservaLotes, estadoLote, crearLoteEntrada, costoPEPS, revertirLotesDeOrden } from '../lib/lotes'
import { writeOrQueue } from '../lib/offlineQueue'
import { getConfig } from '../lib/appConfig'
import { useReorder } from '../hooks/useReorder'
import TimeField from '../components/ui/TimeField'
import BuscadorSelect from '../components/ui/BuscadorSelect'
import { fFecha, fNum, fCOP, componerSurtido } from '../lib/businessLogic'
import { setBusy } from '../lib/busy'
import Cargando from '../components/ui/Cargando'
import { useToast } from '../hooks/useToast'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { notificar } from '../lib/notificaciones'
import {
  Recycle, ClipboardList, DollarSign, Link2, ReceiptText, Factory, Pencil, Printer, Share2,
  Undo2, Trash2, Camera, Check, X, Play, Download, Send, Package, Shuffle, Plus, Save,
  Eye, Calculator, FlaskConical, Hash, Clock, CheckCircle2, ScrollText, Image as ImageIcon,
  AlertTriangle, FileText,
} from 'lucide-react'

// Icono inline para usar dentro de títulos/botones manteniendo alineación con el texto
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden=