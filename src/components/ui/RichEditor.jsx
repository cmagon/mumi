import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, List, ListOrdered, Quote, Undo2, Redo2, Eraser } from 'lucide-react'
import './RichEditor.css'

// Editor de texto enriquecido tipo "mini Word": títulos, párrafos, listas, negrita, cursiva, subrayado…
// value/onChange trabajan con HTML. Sin límite de longitud.
export default function RichEditor({ value = '', onChange, placeholder = 'Escribe la descripción del producto…' }) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: { attributes: { class: 'rich-content', 'data-placeholder': placeholder } },
  })

  // Sincroniza si el value externo cambia (p. ej. al abrir otro producto)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '', false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null
  const B = ({ on, active, children, title }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={on}
      className={`re-btn ${active ? 'on' : ''}`}>{children}</button>
  )
  return (
    <div className="rich-editor">
      <div className="re-toolbar">
        <B title="Título" active={editor.isActive('heading', { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></B>
        <B title="Subtítulo" active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></B>
        <span className="re-sep" />
        <B title="Negrita" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></B>
        <B title="Cursiva" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></B>
        <B title="Subrayado" active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></B>
        <span className="re-sep" />
        <B title="Lista con viñetas" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></B>
        <B title="Lista numerada" active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></B>
        <B title="Cita" active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></B>
        <span className="re-sep" />
        <B title="Quitar formato" on={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={16} /></B>
        <B title="Deshacer" on={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></B>
        <B title="Rehacer" on={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></B>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
